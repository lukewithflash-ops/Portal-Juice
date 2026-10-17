import { pickDk } from "@/lib/book";
import "server-only";
import { EspnMissing, getJson } from "@/lib/espn";
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

/** One scoreboard read per league per ~1.5 s per instance, so a batch of live tennis matches costs one ESPN call. */
const boardMemo = new Map<string, { at: number; p: Promise<unknown> }>();
function boardJson(url: string): Promise<unknown> {
  const hit = boardMemo.get(url);
  if (hit && Date.now() - hit.at < 1500) return hit.p;
  const p = getJson(url);
  boardMemo.set(url, { at: Date.now(), p });
  p.catch(() => boardMemo.delete(url));
  return p;
}

/** Tennis server from ESPN's core situation, when the scoreboard didn't mark one. Doubles ids are "a-b". */
async function tennisServer(leaguePath: string, eventId: string, matchId: string, m: Match): Promise<void> {
  if (m.state !== "in" || m.away.serving || m.home.serving || !eventId) return;
  const lg = leaguePath.split("/")[1];
  const sit = (await getJson(`https://sports.core.api.espn.com/v2/sports/tennis/leagues/${lg}/events/${eventId}/competitions/${matchId}/situation`, 1).catch(() => null)) as { server?: { $ref?: string }; servingSide?: { $ref?: string } } | null;
  const side = sit?.servingSide?.$ref?.match(/competitors\/([\d-]+)/)?.[1];
  const id = sit?.server?.$ref?.match(/athletes\/(\d+)/)?.[1];
  for (const e of [m.away, m.home]) if ((side && e.id === side) || (id && (e.id === id || e.id.split("-").includes(id)))) e.serving = true;
}

export type MatchPage = { match: Match; feed: MatchEvent[]; stats: StatRow[]; hasSummary: boolean };

/** One match: from the scoreboard, plus the summary feed and stats when ESPN has them. */
export async function getMatch(id: string, matchId: string): Promise<MatchPage | null> {
  const league = sportLeague(id);
  if (!league || league.kind === "golf" || !/^\d+$/.test(matchId)) return null;
  let failed = 0;
  const board = await (league.kind === "tennis" ? boardJson : getJson)(`${BASE}${league.path}/scoreboard`).catch(() => ((failed += 1), null));
  let match: Match | null = null;
  let eventId = "";
  for (const ev of ((board as { events?: Record<string, unknown>[] } | null)?.events ?? [])) {
    const comps = [
      ...((ev.competitions as unknown[]) ?? []),
      ...(((ev.groupings as { competitions?: unknown[] }[]) ?? []).flatMap((g) => g.competitions ?? [])),
    ];
    for (const c of comps) {
      if (String((c as { id?: string }).id) === matchId) {
        match = parseMatch(league, String(ev.name ?? ""), c, String(ev.date ?? ""));
        eventId = String(ev.id ?? "");
      }
    }
  }
  let summary: unknown = null;
  if (league.kind === "soccer" || league.kind === "team") {
    summary = await getJson(`${BASE}${league.path}/summary?event=${matchId}`).catch((e) => ((failed += e instanceof EspnMissing ? 0 : 1), null));
  }
  if (!match && summary) {
    const comp = ((summary as { header?: { competitions?: unknown[] } }).header?.competitions ?? [])[0];
    if (comp) match = parseMatch(league, "", comp, "");
    if (match && !match.price) {
      const pc = pickDk((summary as { pickcenter?: unknown[] }).pickcenter ?? []);
      match.price = parseMatchPrice(pc);
    }
  }
  // Both feeds down is a hiccup, not a missing match: throw so the page retries instead of bouncing.
  if (!match && failed && !summary) throw new Error("ESPN feed unavailable");
  if (!match) return null;
  if (league.kind === "tennis") await tennisServer(league.path, eventId, matchId, match).catch(() => {});
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
