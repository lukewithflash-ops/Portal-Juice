import "server-only";
import { getSlateFor } from "@/lib/espn";
import { LEAGUES, sportsDate } from "@/lib/slate";
import { SPORT_LEAGUES, parseSportScoreboard } from "@/lib/sports";
import { matchRow, nameClose, parseSlipRows, propMarketOf, stakeOf, type FoundPlayer, type ImportLeg, type SlateGame, type SlipKind, type SlipRow } from "@/lib/slipImport";

const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions";
const MODEL = process.env.AI_GATEWAY_MODEL || "google/gemini-2.5-flash";
/** ESPN search "league" slug → our league id, for every league we cover. */
const LEAGUE_OF: Record<string, string> = Object.fromEntries([
  ...LEAGUES.map((l) => [l.slug, l.id]),
  ...SPORT_LEAGUES.map((l) => [l.path.split("/")[1], l.id]),
]);

function addDays(day: string, n: number): string {
  const d = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)) + n));
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Today plus three days, every league we cover. */
export async function upcomingGames(): Promise<SlateGame[]> {
  const today = sportsDate();
  const slates = await Promise.all([0, 1, 2, 3].map((n) => getSlateFor(addDays(today, n)).catch(() => null)));
  const extra = await Promise.all(
    SPORT_LEAGUES.filter((l) => l.kind !== "golf").map(async (l) => {
      // Day by day: some ESPN leagues reject a date range.
      const days = await Promise.all(
        [0, 1, 2, 3].map(async (n) => {
          try {
            const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${l.path}/scoreboard?dates=${addDays(today, n)}`, { signal: AbortSignal.timeout(6000), next: { revalidate: 300 } });
            return res.ok ? parseSportScoreboard(l, await res.json()).matches : [];
          } catch {
            return [];
          }
        })
      );
      try {
        return days.flat().map(
          (m): SlateGame => ({
            league: l.id,
            id: m.id,
            start: m.start,
            state: m.state,
            away: { id: m.away.id, abbr: m.away.short, name: m.away.name },
            home: { id: m.home.id, abbr: m.home.short, name: m.home.name },
          })
        );
      } catch {
        return [];
      }
    })
  );
  return [...extra.flat(), ...slates.flatMap((s) =>
    (s?.games ?? []).map((g) => ({
      league: g.league,
      id: g.id,
      start: g.start,
      state: g.state,
      away: { id: g.away.id, abbr: g.away.abbr, name: g.away.name },
      home: { id: g.home.id, abbr: g.home.abbr, name: g.home.name },
    }))
  )];
}

type SearchItem = { id?: string; displayName?: string; league?: string; teamRelationships?: { core?: { id?: string } }[] };

async function searchPlayers(q: string): Promise<FoundPlayer[]> {
  try {
    const res = await fetch(`https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(q)}&limit=10&type=player`, {
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: SearchItem[] };
    return (data.items ?? [])
      .map((it) => ({
        id: String(it.id ?? ""),
        name: String(it.displayName ?? ""),
        league: LEAGUE_OF[String(it.league ?? "")] ?? "",
        teamId: it.teamRelationships?.[0]?.core?.id ? String(it.teamRelationships[0].core.id) : null,
      }))
      .filter((h) => h.id && h.league);
  } catch {
    return [];
  }
}

/**
 * ESPN player search across every league we cover. Prefers a hit whose team plays in the window.
 * If the full name finds nothing (a typo, a missing accent), retries by last name and keeps close spellings.
 */
export async function findPlayer(name: string, games: SlateGame[]): Promise<FoundPlayer | null> {
  const q = name.trim();
  if (q.length < 3) return null;
  let hits = await searchPlayers(q);
  if (!hits.length) {
    const last = q.split(/\s+/).pop() ?? "";
    if (last.length >= 3) hits = (await searchPlayers(last)).filter((h) => nameClose(h.name, q));
  }
  const playing = hits.find((h) => h.teamId && games.some((g) => g.league === h.league && g.state !== "post" && (g.home.id === h.teamId || g.away.id === h.teamId)));
  return playing ?? hits[0] ?? null;
}

export async function matchRows(rows: SlipRow[]): Promise<ImportLeg[]> {
  const games = await upcomingGames();
  return Promise.all(rows.slice(0, 15).map(async (r) => matchRow(r, games, r.kind === "prop" ? await findPlayer(r.subject, games) : null)));
}

export type VisionResult = { ok: true; rows: SlipRow[]; stake: number | null; text: string } | { ok: false; reason: string; status?: number; detail?: string };

function gatewayAuth(oidcHeader: string | null): string | null {
  return process.env.AI_GATEWAY_API_KEY || oidcHeader || process.env.VERCEL_OIDC_TOKEN || null;
}

export function visionConfigured(oidcHeader: string | null): boolean {
  return Boolean(gatewayAuth(oidcHeader));
}

const PROMPT = `You read sportsbook bet slip screenshots. Copy ONLY what is printed on the slip. Never guess or add anything.
Return JSON: {"legs":[{"subject":string,"kind":"prop"|"spread"|"total"|"moneyline","market":string,"line":number|null,"side":"over"|"under"|null,"odds":number|null}],"stake":number|null,"lines":[string]}
- subject: the player name for props, the team for spread/moneyline, the matchup ("AWAY @ HOME") for game totals.
- market: the stat as printed (e.g. "Passing Yards") for props; "spread", "moneyline", or "total" otherwise.
- line: the number on the slip (spread keeps its sign). null if not printed.
- odds: American odds for that leg if printed, else null. Do not use the combined parlay odds for a leg.
- stake: the wager amount if printed, else null.
- lines: every text line you can read, top to bottom.
If the image is not a bet slip, return {"legs":[],"stake":null,"lines":[]}.`;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v.replace(/[+$,]/g, ""))) ? Number(v.replace(/[$,]/g, "")) : null);

/** Reads a slip photo with a vision model via Vercel AI Gateway. Extraction only. */
export async function readSlipImage(dataUrl: string, oidcHeader: string | null): Promise<VisionResult> {
  const auth = gatewayAuth(oidcHeader);
  if (!auth) return { ok: false, reason: "not-configured" };
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      signal: AbortSignal.timeout(40000),
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 1500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: PROMPT },
          { role: "user", content: [{ type: "text", text: "Read this slip." }, { type: "image_url", image_url: { url: dataUrl } }] },
        ],
      }),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      console.log(JSON.stringify({ event: "slip.vision", status: res.status, body }));
      let detail = "";
      try {
        const j = JSON.parse(body) as { error?: { message?: string; type?: string } | string };
        detail = typeof j.error === "string" ? j.error : [j.error?.type, j.error?.message].filter(Boolean).join(": ");
      } catch {
        detail = body;
      }
      return { ok: false, status: res.status, detail: detail.replace(/[A-Za-z0-9_-]{32,}/g, "…").slice(0, 240), reason: res.status === 401 || res.status === 403 ? "not-authorized" : res.status === 402 ? "no-credit" : `error-${res.status}` };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: unknown };
    console.log(JSON.stringify({ event: "slip.vision", status: 200, model: MODEL, usage: data.usage ?? null }));
    const content = data.choices?.[0]?.message?.content ?? "";
    const json = JSON.parse(content.replace(/^```(?:json)?|```$/g, "").trim()) as { legs?: unknown[]; stake?: unknown; lines?: unknown[] };
    const lines = (json.lines ?? []).filter((x): x is string => typeof x === "string").slice(0, 80);
    const text = lines.join("\n");
    const rows: SlipRow[] = [];
    for (const raw of json.legs ?? []) {
      if (!raw || typeof raw !== "object") continue;
      const l = raw as Record<string, unknown>;
      const subject = typeof l.subject === "string" ? l.subject.trim().slice(0, 60) : "";
      const kind = (["prop", "spread", "total", "moneyline"] as const).includes(l.kind as SlipKind) ? (l.kind as SlipKind) : null;
      if (!subject || !kind) continue;
      const market = kind === "prop" ? propMarketOf(String(l.market ?? "")) || String(l.market ?? "").toLowerCase().slice(0, 40) : kind;
      const side = String(l.side ?? "").toLowerCase();
      const odds = num(l.odds);
      rows.push({
        subject,
        kind,
        market,
        line: kind === "moneyline" ? null : num(l.line),
        selection: kind === "prop" || kind === "total" ? (side === "over" ? "Over" : side === "under" ? "Under" : null) : null,
        odds: odds != null && Math.abs(odds) >= 100 && Math.abs(odds) < 100000 ? Math.round(odds) : null,
      });
    }
    return { ok: true, rows: rows.slice(0, 15), stake: num(json.stake) ?? stakeOf(text), text };
  } catch (err) {
    console.log(JSON.stringify({ event: "slip.vision", error: String((err as Error).message).slice(0, 200) }));
    return { ok: false, reason: "error" };
  }
}

export function rowsFromText(text: string): { rows: SlipRow[]; stake: number | null } {
  return { rows: parseSlipRows(text), stake: stakeOf(text) };
}
