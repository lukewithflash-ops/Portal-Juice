import { NextResponse } from "next/server";
import { analyzeLeg, parlayMath, statFromMarket, type GameResearch, type LegInput, type LegReport } from "@/lib/breakdown";
import { gameRoster, researchGame, researchPlayer } from "@/lib/research";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const KINDS = new Set(["spread", "total", "moneyline", "prop"]);

function clean(raw: unknown): LegInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const league = typeof r.league === "string" ? r.league : "";
  const gameId = typeof r.gameId === "string" ? r.gameId : "";
  const kind = typeof r.kind === "string" && KINDS.has(r.kind) ? (r.kind as LegInput["kind"]) : null;
  if (!/^[a-z]+$/.test(league) || !/^\d+$/.test(gameId) || !kind) return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
  const odds = n(r.odds);
  return {
    league,
    gameId,
    kind,
    side: r.side === "away" ? "away" : r.side === "home" ? "home" : undefined,
    pick: r.pick === "under" ? "under" : r.pick === "over" ? "over" : undefined,
    line: n(r.line),
    odds: odds !== null && (odds <= -100 || odds >= 100) ? Math.round(odds) : null,
    athleteId: typeof r.athleteId === "string" && /^\d+$/.test(r.athleteId) ? r.athleteId : undefined,
    athleteName: typeof r.athleteName === "string" ? r.athleteName.slice(0, 60) : undefined,
    stat: typeof r.stat === "string" ? r.stat.slice(0, 40) : undefined,
    openLine: n(r.openLine),
    market: typeof r.market === "string" ? r.market.slice(0, 60) : undefined,
    team: typeof r.team === "string" ? r.team.slice(0, 60) : undefined,
  };
}

/** Read-only. Breaks down up to 6 legs from real ESPN numbers. */
export async function POST(req: Request) {
  let body: { legs?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const legs = (Array.isArray(body.legs) ? body.legs : []).map(clean).filter((l): l is LegInput => l !== null).slice(0, 6);
  if (!legs.length) return NextResponse.json({ error: "Add a leg first." }, { status: 400 });
  const games = new Map<string, Promise<GameResearch | null>>();
  const gameFor = (l: LegInput) => {
    const k = `${l.league}/${l.gameId}`;
    if (!games.has(k)) games.set(k, researchGame(l.league, l.gameId));
    return games.get(k) as Promise<GameResearch | null>;
  };
  const reports: (LegReport | { error: string })[] = await Promise.all(
    legs.map(async (l) => {
      const g = await gameFor(l);
      if (!g) return { error: "ESPN has no data for that game." };
      // Logged picks carry words, not ids. Match them to this game.
      if ((l.kind === "spread" || l.kind === "moneyline") && !l.side && l.team) {
        const t = norm(l.team);
        const hit = (x: GameResearch["home"]) => t === norm(x.abbr) || t.includes(norm(x.name)) || norm(x.name).includes(t);
        l.side = hit(g.home) ? "home" : hit(g.away) ? "away" : undefined;
        if (!l.side) return { error: `Could not match "${l.team}" to ${g.label}.` };
      }
      if (l.kind === "prop") {
        if (!l.stat && l.market) l.stat = statFromMarket(l.league, l.market) ?? undefined;
        if (!l.athleteId && l.athleteName) {
          const roster = await gameRoster(l.league, l.gameId);
          const want = norm(l.athleteName);
          const who = roster.players.find((p) => norm(p.name) === want) ?? roster.players.find((p) => norm(p.name).endsWith(want) || want.endsWith(norm(p.name)));
          if (who) {
            l.athleteId = who.id;
            l.athleteName = who.name;
          }
        }
        if (!l.athleteId || !l.stat) return { error: "Could not match that player and stat to ESPN data." };
      }
      const p = l.kind === "prop" && l.athleteId && l.stat ? await researchPlayer(l.league, l.athleteId, l.stat, g.start) : null;
      return analyzeLeg(l, g, p);
    })
  );
  const good = reports.filter((r): r is LegReport => !("error" in r));
  return NextResponse.json(
    { reports, parlay: good.length ? parlayMath(good) : null, fetchedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
