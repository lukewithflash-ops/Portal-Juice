import { NextResponse } from "next/server";
import { analyzeLeg, parlayMath, roughTitle, statFromMarket, thinReport, type GameResearch, type LegInput, type LegReport } from "@/lib/breakdown";
import { matchReport, stubGame } from "@/lib/matchResearch";
import { findPlayer } from "@/lib/slipRead";
import { sportLeague } from "@/lib/sports";
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
  // A manual leg may have no game (and no league) yet. It still gets whatever breakdown the data allows.
  if (!/^[a-z]*$/.test(league) || !/^\d*$/.test(gameId) || !kind) return null;
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
  const reports: LegReport[] = await Promise.all(
    legs.map(async (l): Promise<LegReport> => {
      const title = roughTitle(l);
      try {
        const kind = sportLeague(l.league)?.kind;
        if (kind === "tennis" || kind === "fight") return (await matchReport(l)) ?? thinReport(l, title, "ESPN has no data for that match", "Match");
        if (l.kind === "prop" && !l.stat && l.market) l.stat = statFromMarket(l.league, l.market) ?? undefined;
        if (!l.gameId) {
          // Manual leg: find the player by name across every league and read the game log.
          if (l.kind !== "prop" || !l.athleteName) return thinReport(l, title, "no game to read for this leg");
          const hit = await findPlayer(l.athleteName, []);
          if (!hit) return thinReport(l, title, `ESPN has no player named ${l.athleteName}`);
          l.league = hit.league;
          l.athleteId = hit.id;
          l.athleteName = hit.name;
          if (!l.stat && l.market) l.stat = statFromMarket(hit.league, l.market) ?? undefined;
          if (!l.stat) return thinReport(l, title, `we can't read "${l.market ?? "that stat"}" from a game log`);
          const p = await researchPlayer(hit.league, hit.id, l.stat);
          return analyzeLeg(l, stubGame(hit.league, "No game in the next few days"), p);
        }
        const g = await gameFor(l);
        if (!g) return thinReport(l, title, "ESPN has no data for that game");
        // Logged picks carry words, not ids. Match them to this game.
        if ((l.kind === "spread" || l.kind === "moneyline") && !l.side && l.team) {
          const t = norm(l.team);
          const hit = (x: GameResearch["home"]) => t === norm(x.abbr) || t.includes(norm(x.name)) || norm(x.name).includes(t);
          l.side = hit(g.home) ? "home" : hit(g.away) ? "away" : undefined;
          if (!l.side) return thinReport(l, title, `could not match "${l.team}" to ${g.label}`, g.label);
        }
        if (l.kind === "prop") {
          if (!l.athleteId && l.athleteName) {
            const roster = await gameRoster(l.league, l.gameId).catch(() => ({ players: [] as { id: string; name: string }[] }));
            const want = norm(l.athleteName);
            const who = roster.players.find((p) => norm(p.name) === want) ?? roster.players.find((p) => norm(p.name).endsWith(want) || want.endsWith(norm(p.name)));
            const found = who ?? (await findPlayer(l.athleteName, []));
            if (found) {
              l.athleteId = found.id;
              l.athleteName = found.name;
            }
          }
          if (!l.athleteId) return thinReport(l, title, "could not find that player in ESPN data", g.label);
          if (!l.stat) return thinReport(l, title, `we can't read "${l.market ?? "that stat"}" from a game log`, g.label);
        }
        const p = l.kind === "prop" && l.athleteId && l.stat ? await researchPlayer(l.league, l.athleteId, l.stat, g.start) : null;
        return analyzeLeg(l, g, p);
      } catch {
        return thinReport(l, title, "the data didn't load");
      }
    })
  );
  const good = reports;
  return NextResponse.json(
    { reports, parlay: good.length ? parlayMath(good) : null, fetchedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
