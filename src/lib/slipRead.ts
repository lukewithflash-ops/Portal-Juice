import "server-only";
import { getLive } from "@/lib/espn";
import { LEAGUES, parseScoreboard, sportsDate } from "@/lib/slate";
import { SPORT_LEAGUES, parseSportScoreboard } from "@/lib/sports";
import { gradePick } from "@/lib/grade";
import { pickFromLeg } from "@/lib/legPick";
import {
  BASKETBALL,
  TENNIS,
  easternDate,
  gameOptions,
  gradeTennis,
  matchRow,
  nameClose,
  parseSlipRows,
  propMarketOf,
  slipDateOf,
  rowSport,
  teamScore,
  type FoundPlayer,
  type ImportLeg,
  type SlateGame,
  type SlipKind,
  type SlipRow,
} from "@/lib/slipImport";

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

/** How far the matcher looks: a week back (finished slips) through two weeks ahead (futures). */
export const WINDOW_BACK = 7;
export const WINDOW_AHEAD = 14;
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/";
const COLLEGE_HOOPS = new Set(["ncaam", "ncaaw"]);

async function fetchBoard(url: string, past: boolean): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "PortalJuice/1.0" }, next: { revalidate: past ? 1800 : 120 } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Days (YYYYMMDD) the window covers, plus a day either side of any date printed on the slip. */
export function windowDays(today: string, printed: string[] = []): string[] {
  const days = new Set<string>();
  for (let n = -WINDOW_BACK; n <= WINDOW_AHEAD; n++) days.add(addDays(today, n));
  for (const p of printed) {
    const d = p.replace(/-/g, "");
    if (!/^\d{8}$/.test(d)) continue;
    // Only dates within ~two months: a misread year should not pull a season of games.
    const gap = Math.abs(Date.parse(p + "T12:00:00Z") - Date.parse(`${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6)}T12:00:00Z`));
    if (!(gap < 62 * 864e5)) continue;
    for (const n of [-1, 0, 1]) days.add(addDays(d, n));
  }
  return [...days].sort();
}

const memo = new Map<string, { at: number; value: Promise<SlateGame[]> }>();

/**
 * Every game in the window, every league we cover. One call per league per month (ESPN takes YYYYMM),
 * day by day only where a month is too big (college football, college basketball in season).
 */
export async function windowGames(printed: string[] = []): Promise<SlateGame[]> {
  const today = sportsDate();
  const days = windowDays(today, printed);
  const key = days[0] + days[days.length - 1] + days.length;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  const value = loadWindow(today, days);
  memo.set(key, { at: Date.now(), value });
  if (memo.size > 20) memo.delete(memo.keys().next().value as string);
  value.catch(() => memo.delete(key));
  return value;
}

async function loadWindow(today: string, days: string[]): Promise<SlateGame[]> {
  const set = new Set(days);
  const months = [...new Set(days.map((d) => d.slice(0, 6)))];
  const inWindow = (iso: string) => {
    const e = easternDate(iso).replace(/-/g, "");
    return set.has(e);
  };
  const isPast = (d: string) => d < today;
  const src = (u: string, past: boolean): [string, boolean] => [u, past];
  const monthPast = (m: string) => m < today.slice(0, 6);
  const core = LEAGUES.map(async (l): Promise<SlateGame[]> => {
    const urls =
      l.id === "ncaaf"
        ? days.map((d) => src(`${ESPN}${l.sport}/${l.slug}/scoreboard?dates=${d}&groups=80&limit=300`, isPast(d)))
        : months.map((m) => src(`${ESPN}${l.sport}/${l.slug}/scoreboard?dates=${m}&limit=1000`, monthPast(m)));
    const boards = await Promise.all(urls.map(([u, past]) => fetchBoard(u, past)));
    return boards.flatMap((b) =>
      b
        ? parseScoreboard(l, b).games.map((g) => ({
            league: g.league,
            id: g.id,
            start: g.start,
            state: g.state,
            away: { id: g.away.id, abbr: g.away.abbr, name: g.away.name },
            home: { id: g.home.id, abbr: g.home.abbr, name: g.home.name },
          }))
        : []
    );
  });
  const extra = SPORT_LEAGUES.filter((l) => l.kind !== "golf").map(async (l): Promise<SlateGame[]> => {
    const inSeason = (m: string) => [11, 12, 1, 2, 3, 4].includes(Number(m.slice(4)));
    const urls = COLLEGE_HOOPS.has(l.id)
      ? months.flatMap((m) =>
          inSeason(m)
            ? days.filter((d) => d.startsWith(m)).map((d) => src(`${ESPN}${l.path}/scoreboard?dates=${d}&groups=50&limit=400`, isPast(d)))
            : [src(`${ESPN}${l.path}/scoreboard?dates=${m}&groups=50&limit=1000`, monthPast(m))]
        )
      : months.map((m) => src(`${ESPN}${l.path}/scoreboard?dates=${m}&limit=1000`, monthPast(m)));
    const boards = await Promise.all(urls.map(([u, past]) => fetchBoard(u, past)));
    return boards.flatMap((b) => {
      if (!b) return [];
      try {
        return parseSportScoreboard(l, b, Date.now(), { all: true }).matches.map(
          (m): SlateGame => ({
            league: l.id,
            id: m.id,
            start: m.start,
            state: m.state,
            away: { id: m.away.id, abbr: m.away.short, name: m.away.name },
            home: { id: m.home.id, abbr: m.home.short, name: m.home.name },
            ...(l.kind === "tennis" ? { sets: { away: m.away.sets, home: m.home.sets }, winner: m.home.winner ? "home" : m.away.winner ? "away" : null, event: m.event } : {}),
          })
        );
      } catch {
        return [];
      }
    });
  });
  const all = (await Promise.all([...core, ...extra])).flat();
  const seen = new Set<string>();
  return all.filter((g) => {
    const k = g.league + g.id;
    if (seen.has(k) || !inWindow(g.start)) return false;
    seen.add(k);
    return true;
  });
}

/** Back-compat: the window, today first. */
export async function upcomingGames(): Promise<SlateGame[]> {
  return windowGames();
}

const HOOP_PATH: Record<string, string> = {
  nba: "basketball/nba",
  wnba: "basketball/wnba",
  ncaam: "basketball/mens-college-basketball",
  ncaaw: "basketball/womens-college-basketball",
};

async function roster(league: string, teamId: string): Promise<{ id: string; name: string }[]> {
  const path = HOOP_PATH[league];
  if (!path || !/^\d+$/.test(teamId)) return [];
  try {
    const res = await fetch(`${ESPN}${path}/teams/${teamId}/roster`, { signal: AbortSignal.timeout(6000), next: { revalidate: 21600 } });
    if (!res.ok) return [];
    const d = (await res.json()) as { athletes?: { id?: string; displayName?: string; fullName?: string; items?: { id?: string; displayName?: string }[] }[] };
    // Most rosters are a flat list; some group by position.
    const flat = (d.athletes ?? []).flatMap((a) => (Array.isArray(a.items) ? a.items : [a]));
    return flat.filter((a) => a.id && (a.displayName || (a as { fullName?: string }).fullName)).map((a) => ({ id: String(a.id), name: String(a.displayName ?? (a as { fullName?: string }).fullName) }));
  } catch {
    return [];
  }
}

/**
 * Basketball: look the name up on the rosters of teams that play in the window (every basketball league,
 * preseason and the new season included). A printed team or opponent narrows the teams first.
 */
export async function rosterPlayer(row: SlipRow, games: SlateGame[], max = 48): Promise<FoundPlayer | null> {
  const lg = (row.league ?? "").toLowerCase();
  const hoops = games.filter((g) => (lg && BASKETBALL.has(lg) ? g.league === lg : BASKETBALL.has(g.league)));
  if (!hoops.length) return null;
  const hint = [row.team, row.opponent].filter(Boolean).join(" ");
  const at = row.date ? Date.parse(row.date + "T23:00:00Z") : Date.now();
  const teams: { league: string; id: string; score: number; dist: number }[] = [];
  for (const g of hoops) {
    for (const t of [g.home, g.away]) {
      const score = hint ? teamScore(hint, t) : 0;
      const dist = Math.abs(Date.parse(g.start) - at);
      const have = teams.find((x) => x.league === g.league && x.id === t.id);
      if (have) {
        have.dist = Math.min(have.dist, dist);
        have.score = Math.max(have.score, score);
      } else teams.push({ league: g.league, id: t.id, score, dist });
    }
  }
  // Pro leagues before college (smaller, likelier), then printed team, then closest game.
  const pro = (l: string) => (l === "nba" || l === "wnba" ? 0 : 1);
  teams.sort((a, b) => b.score - a.score || pro(a.league) - pro(b.league) || a.dist - b.dist);
  const pickTeams = teams.slice(0, max);
  for (let i = 0; i < pickTeams.length; i += 16) {
    const chunk = pickTeams.slice(i, i + 16);
    const lists = await Promise.all(chunk.map((t) => roster(t.league, t.id)));
    for (let j = 0; j < chunk.length; j++) {
      const p = lists[j].find((a) => nameClose(a.name, row.subject));
      if (p) return { id: p.id, name: p.name, league: chunk[j].league, teamId: chunk[j].id };
    }
  }
  return null;
}

type SearchItem = { id?: string; displayName?: string; league?: string; sport?: string; teamRelationships?: { core?: { id?: string } }[] };

async function searchPlayers(q: string): Promise<FoundPlayer[]> {
  try {
    const res = await fetch(`https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(q)}&limit=10&type=player`, {
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: SearchItem[] };
    const items = data.items ?? [];
    // Soccer search lists a player under his national team; look up his club instead.
    const soccer = await Promise.all(
      items
        .filter((it) => it.sport === "soccer" && it.id && !LEAGUE_OF[String(it.league ?? "")])
        .slice(0, 3)
        .map(async (it) => {
          const club = await soccerClub(String(it.id));
          return club ? ({ id: String(it.id), name: String(it.displayName ?? ""), league: "soccer", teamId: club } as FoundPlayer) : null;
        })
    );
    const clubHits = soccer.filter((x): x is FoundPlayer => !!x);
    return [...clubHits, ...items
      .map((it) => ({
        id: String(it.id ?? ""),
        name: String(it.displayName ?? ""),
        league: LEAGUE_OF[String(it.league ?? "")] ?? "",
        teamId: it.teamRelationships?.[0]?.core?.id ? String(it.teamRelationships[0].core.id) : null,
      }))
      .filter((h) => h.id && h.league)];
  } catch {
    return [];
  }
}

async function soccerClub(id: string): Promise<string | null> {
  try {
    const res = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes/${id}`, { signal: AbortSignal.timeout(6000), next: { revalidate: 21600 } });
    if (!res.ok) return null;
    const d = (await res.json()) as { athlete?: { team?: { id?: string } } };
    return d.athlete?.team?.id ? String(d.athlete.team.id) : null;
  } catch {
    return null;
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
  const isSoccer = (lg: string) => SPORT_LEAGUES.some((l) => l.id === lg && l.kind === "soccer");
  const sameLeague = (h: FoundPlayer, g: SlateGame) => g.league === h.league || (h.league === "soccer" && isSoccer(g.league));
  const order = (g: SlateGame) => (g.state === "in" ? 0 : g.state === "pre" ? 1 : 2);
  // Only people whose name matches what was printed: search also returns loose matches.
  hits = hits.filter((h) => nameClose(h.name, q));
  for (const h of hits) {
    if (!h.teamId) continue;
    const g = games.filter((x) => sameLeague(h, x) && (x.home.id === h.teamId || x.away.id === h.teamId)).sort((a, b) => order(a) - order(b))[0];
    if (g) return { ...h, league: g.league };
  }
  return hits.find((h) => h.league !== "soccer") ?? null;
}

/** A prop's player: ESPN search first (checked against the window), then basketball rosters, never a guess. */
async function propPlayer(row: SlipRow, games: SlateGame[]): Promise<FoundPlayer | null> {
  const sport = rowSport(row);
  if (sport === "tennis") return null; // tennis players are matched against the match entrants
  const hit = await findPlayer(row.subject, games);
  const plays = (h: FoundPlayer | null) => !!h?.teamId && games.some((g) => g.league === h.league && (g.home.id === h.teamId || g.away.id === h.teamId));
  if (hit && plays(hit) && (!row.league || row.league === hit.league || !BASKETBALL.has(row.league))) return hit;
  // Search can lag a trade or a new season; rosters are current. Basketball, or no sport printed.
  if (sport === "basketball" || !row.league || BASKETBALL.has(row.league)) {
    const r = await rosterPlayer(row, games);
    if (r) return r;
  }
  // A hit from another league than the slip names is someone else.
  return hit && (!row.league || row.league === hit.league) ? hit : null;
}

/** Grade a finished leg from ESPN: the final box for props, the final score for sides and totals. */
async function gradeLeg(leg: ImportLeg, games: SlateGame[]): Promise<"win" | "loss" | "push" | null> {
  if (!leg.leg || !leg.game || leg.game.state !== "post") return null;
  const g = games.find((x) => x.league === leg.game!.league && x.id === leg.game!.id);
  if (!g) return null;
  if (TENNIS.has(g.league)) return gradeTennis(leg.leg, g);
  try {
    const snap = await getLive(g.league, g.id);
    if (!snap || snap.state !== "post") return null;
    const pick = pickFromLeg(leg.row.kind === "prop" ? { ...leg.leg, market: leg.row.market } : leg.leg, { home: g.home.abbr, away: g.away.abbr });
    const r = gradePick(pick, snap);
    return r === "win" || r === "loss" || r === "push" ? r : null;
  } catch {
    return null;
  }
}

export async function matchRows(rows: SlipRow[], slipDate: string | null = null): Promise<ImportLeg[]> {
  const list = rows.slice(0, 20).map((r) => (slipDate && !r.date ? { ...r, date: slipDate } : r));
  const printed = list.map((r) => r.date).filter((d): d is string => !!d);
  const games = await windowGames(printed);
  const now = Date.now();
  return Promise.all(
    list.map(async (r) => {
      const player = r.kind === "prop" ? await propPlayer(r, games) : null;
      const m = matchRow(r, games, player, now);
      const result = await gradeLeg(m, games);
      return result ? { ...m, result } : m;
    })
  );
}

/** Games for the "Match it" picker on a row the reader could not tie (and for a manual re-pick). */
export async function optionsFor(row: SlipRow): Promise<ReturnType<typeof gameOptions>> {
  const games = await windowGames(row.date ? [row.date] : []);
  return gameOptions(row, games, Date.now(), 20);
}

export type VisionResult = { ok: true; rows: SlipRow[]; stake: number | null; book?: string | null; text: string; date?: string | null } | { ok: false; reason: string; status?: number; detail?: string };

function gatewayAuth(oidcHeader: string | null): string | null {
  return process.env.AI_GATEWAY_API_KEY || oidcHeader || process.env.VERCEL_OIDC_TOKEN || null;
}

export function visionConfigured(oidcHeader: string | null): boolean {
  return Boolean(gatewayAuth(oidcHeader));
}

function prompt(today: string): string {
  return `You read sportsbook and pick'em slip screenshots (PrizePicks, Underdog, DraftKings, FanDuel, BetMGM, Caesars, ESPN Bet, Fliff, Sleeper and similar). Copy ONLY what is printed. Never guess or add anything.
Today is ${today}. Use it only to turn printed words like "Today", "Tomorrow", "Fri", "10/14" or "Oct 14" into a YYYY-MM-DD date.
Return JSON:
{"legs":[{"subject":string,"kind":"prop"|"spread"|"total"|"moneyline","market":string,"line":number|null,"side":"over"|"under"|null,"odds":number|null,"league":string|null,"date":string|null,"team":string|null,"opponent":string|null,"settled":boolean}],"stake":null,"book":string|null,"entry":string|null,"date":string|null,"lines":[string]}
Read EVERY leg on the slip, top to bottom, even when there are many (up to 20). Each player block on a pick'em slip is one leg. Each line of a parlay or same-game parlay is one leg.
- subject: the player for props (full name as printed), the team for spread/moneyline, the matchup ("AWAY @ HOME") for game totals. Tennis: the player.
- Keep each leg's own details together: the matchup, date and teams for a leg come from that leg's own row or the game header it sits under, never from a neighboring leg.
- market: the stat as printed for props (e.g. "Points", "Pts+Rebs+Asts", "3-PT Made", "Passing Yards", "Aces", "Total Games", "Games Won", "Double Faults", "Fantasy Score", "Break Points Won"); "spread", "moneyline" or "total" otherwise.
- line: the number for that leg (spread keeps its sign). null if not printed. Demon/goblin/discounted lines: use the number shown.
- side: "More", "Higher", "Over", an up arrow, or "O 24.5" means over; "Less", "Lower", "Under", a down arrow, or "U 24.5" means under. Moneyline and spread: null.
- odds: American odds for that leg if printed, else null. Never use the combined parlay odds for a leg.
- league: the league if printed or plain from the slip (logos, team names, "NBA", "WNBA", "NCAAB", "NCAAW", "NFL", "CFB", "MLB", "NHL", "ATP", "WTA", "EPL", "MLS", "UFC"), else null.
- date: the game date as YYYY-MM-DD when printed for that leg (or its game header), else null.
- team / opponent: teams or players printed beside the leg ("LAL vs DEN", "@ BOS", "vs C. Alcaraz"). team = the subject's side, opponent = the other side. null if not printed.
- settled: true only if the slip marks that leg finished (a check, an X, "Won", "Lost", "Final", a final stat beside it). Otherwise false.
- stake: always null. Ignore "$X to win $Y", payouts and entry fees.
- book: the app name if visible, else null. entry: the entry type if printed ("Power Play", "Flex Play", "Parlay", "SGP", "Champions"), else null.
- date (top level): a date printed for the whole slip (placed or game date), YYYY-MM-DD, else null.
- lines: every text line you can read, top to bottom.
If the image is not a bet slip, return {"legs":[],"stake":null,"lines":[]}.`;
}

const LEAGUE_ALIASES: [RegExp, string][] = [
  [/^nba$/i, "nba"], [/^wnba$/i, "wnba"], [/^(ncaab|ncaam|cbb|ncaa\s*m(en'?s)?\s*b(asket)?b(all)?|college basketball)$/i, "ncaam"], [/^(ncaaw|wcbb|ncaa\s*w)/i, "ncaaw"],
  [/^nfl$/i, "nfl"], [/^(cfb|ncaaf|college football)$/i, "ncaaf"], [/^mlb$/i, "mlb"], [/^nhl$/i, "nhl"],
  [/^atp/i, "atp"], [/^wta/i, "wta"], [/^(epl|premier league)$/i, "epl"], [/^mls$/i, "mls"], [/^(ucl|champions league)$/i, "ucl"],
  [/^la\s*liga$/i, "laliga"], [/^serie\s*a$/i, "seriea"], [/^bundesliga$/i, "bundesliga"], [/^(ufc|mma)$/i, "ufc"],
];
export function leagueId(raw: unknown): string | null {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return null;
  for (const [re, id] of LEAGUE_ALIASES) if (re.test(t)) return id;
  return null;
}
const isoDate = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null);
const txt = (v: unknown, n = 60): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

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
        max_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })) },
          { role: "user", content: [{ type: "text", text: "Read every leg on this slip." }, { type: "image_url", image_url: { url: dataUrl } }] },
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
    const json = JSON.parse(content.replace(/^```(?:json)?|```$/g, "").trim()) as { legs?: unknown[]; stake?: unknown; lines?: unknown[]; book?: unknown; entry?: unknown; date?: unknown };
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
        selection: kind === "prop" || kind === "total" ? (/^(over|more|higher|o)$/.test(side) ? "Over" : /^(under|less|lower|u)$/.test(side) ? "Under" : null) : null,
        odds: odds != null && Math.abs(odds) >= 100 && Math.abs(odds) < 100000 ? Math.round(odds) : null,
        league: leagueId(l.league),
        date: isoDate(l.date),
        team: txt(l.team),
        opponent: txt(l.opponent),
        settled: l.settled === true,
      });
    }
    const book = [typeof json.book === "string" ? json.book.slice(0, 20) : "", typeof json.entry === "string" ? json.entry.slice(0, 20) : ""].filter(Boolean).join(" · ") || null;
    // No money in records: stake and payout text are dropped.
    return { ok: true, rows: rows.slice(0, 20), stake: null, book, text, date: isoDate(json.date) };
  } catch (err) {
    console.log(JSON.stringify({ event: "slip.vision", error: String((err as Error).message).slice(0, 200) }));
    return { ok: false, reason: "error" };
  }
}

export function rowsFromText(text: string): { rows: SlipRow[]; stake: number | null; date: string | null } {
  const rows = parseSlipRows(text);
  // One league named on the whole slip: a hint for every row.
  const named = [...new Set((text.match(/\b(NBA|WNBA|NCAAB|NCAAW|NFL|NCAAF|CFB|MLB|NHL|ATP|WTA|EPL|MLS|UFC)\b/g) ?? []).map((t) => leagueId(t)).filter(Boolean))];
  const league = named.length === 1 ? named[0] : null;
  return { rows: league ? rows.map((r) => ({ ...r, league: r.league ?? league })) : rows, stake: null, date: slipDateOf(text) };
}
