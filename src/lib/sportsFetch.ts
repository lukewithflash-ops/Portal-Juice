import "server-only";
import { getJson } from "@/lib/espn";
import { parseMatch, parseMatchFeed, parseMatchPrice, parseMatchStats, parseSportScoreboard, sportLeague, summaryProjection, type Match, type MatchEvent, type SportSlate, type StatRow } from "@/lib/sports";
import { winPct } from "@/lib/winPct";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/";

export async function getSportSlate(id: string): Promise<SportSlate | null> {
  const league = sportLeague(id);
  if (!league) return null;
  const data = await getJson(`${BASE}${league.path}/scoreboard`);
  const { matches, golf } = parseSportScoreboard(league, data);
  return { league, matches, golf, fetchedAt: new Date().toISOString() };
}

export type MatchPage = { match: Match; feed: MatchEvent[]; stats: StatRow[]; hasSummary: boolean };

/** One match: from the scoreboard, plus the summary feed and stats when ESPN has them. */
export async function getMatch(id: string, matchId: string): Promise<MatchPage | null> {
  const league = sportLeague(id);
  if (!league || league.kind === "golf" || !/^\d+$/.test(matchId)) return null;
  const board = await getJson(`${BASE}${league.path}/scoreboard`).catch(() => null);
  let match: Match | null = null;
  for (const ev of ((board as { events?: Record<string, unknown>[] } | null)?.events ?? [])) {
    const comps = [
      ...((ev.competitions as unknown[]) ?? []),
      ...(((ev.groupings as { competitions?: unknown[] }[]) ?? []).flatMap((g) => g.competitions ?? [])),
    ];
    for (const c of comps) {
      if (String((c as { id?: string }).id) === matchId) match = parseMatch(league, String(ev.name ?? ""), c, String(ev.date ?? ""));
    }
  }
  let summary: unknown = null;
  if (league.kind === "soccer" || league.kind === "team") {
    summary = await getJson(`${BASE}${league.path}/summary?event=${matchId}`).catch(() => null);
  }
  if (!match && summary) {
    const comp = ((summary as { header?: { competitions?: unknown[] } }).header?.competitions ?? [])[0];
    if (comp) match = parseMatch(league, "", comp, "");
    if (match && !match.price) {
      const pc = ((summary as { pickcenter?: unknown[] }).pickcenter ?? [])[0];
      match.price = parseMatchPrice(pc);
    }
  }
  if (!match) return null;
  if (summary) {
    const proj = summaryProjection(summary);
    const wp = (summary as { winprobability?: { homeWinPercentage?: number }[] }).winprobability ?? [];
    const better = winPct({ state: match.state, liveHome: wp.length ? wp[wp.length - 1].homeWinPercentage ?? null : null, projection: proj, homeMl: match.price?.homeMl, awayMl: match.price?.awayMl, drawMl: match.price?.drawMl ?? null });
    if (better) match.win = better;
  }
  return {
    match,
    feed: summary ? parseMatchFeed(summary) : [],
    stats: summary ? parseMatchStats(summary, match.away.name, match.home.name) : [],
    hasSummary: !!summary,
  };
}
