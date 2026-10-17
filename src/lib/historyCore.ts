/**
 * Graded lines for /lines/board, built only from ESPN: the closing line ESPN kept for a finished game
 * (DraftKings spread, main player over/under lines) and the final box score. Pure, so it is testable.
 * Milestone ladders are never used. A player who did not record the stat is skipped, not guessed.
 */
import { statFromMarket } from "@/lib/breakdown";
import { sportOf } from "@/lib/legPick";
import { liveStat, playerByName } from "@/lib/tracker";
import type { LiveBox } from "@/lib/live";
import type { HistoryLine } from "@/lib/types";

export type GradeInput = {
  league: string;
  gameId: string;
  date: string; // YYYY-MM-DD (PT)
  home: { abbr: string; name: string; score: number | null };
  away: { abbr: string; name: string; score: number | null };
  /** Home closing spread from ESPN (e.g. +1.5). Null when none was kept. */
  spreadHome: number | null;
  props: { athleteId: string; name: string; team: string; market: string; line: string; headshot: string | null }[];
  boxes: LiveBox[];
  plays?: { text: string }[];
};

export function gradedLines(g: GradeInput): HistoryLine[] {
  const out: HistoryLine[] = [];
  const sport = sportOf(g.league);
  const hs = g.home.score;
  const as = g.away.score;
  if (g.spreadHome != null && Number.isFinite(g.spreadHome) && hs != null && as != null) {
    out.push({ id: `${g.league}:${g.gameId}:side:${g.home.abbr}`, sport, date: g.date, kind: "side", subject: g.home.name || g.home.abbr, team: g.home.abbr, opponent: g.away.abbr, market: "Spread", closingLine: g.spreadHome, result: hs - as, headshotUrl: null });
    out.push({ id: `${g.league}:${g.gameId}:side:${g.away.abbr}`, sport, date: g.date, kind: "side", subject: g.away.name || g.away.abbr, team: g.away.abbr, opponent: g.home.abbr, market: "Spread", closingLine: -g.spreadHome, result: as - hs, headshotUrl: null });
  }
  const all = g.boxes.flatMap((b) => b.players);
  for (const p of g.props) {
    if (/\+\s*$/.test(p.line) || /milestone/i.test(p.market)) continue;
    const line = Number(p.line);
    if (!Number.isFinite(line) || line <= 0) continue;
    if (!statFromMarket(g.league, p.market)) continue;
    if (p.team !== g.home.abbr && p.team !== g.away.abbr) continue;
    const pl = all.find((x) => x.id === p.athleteId) ?? playerByName(g.boxes, p.name);
    if (!pl || pl.played === false) continue;
    const v = liveStat(pl.statMap, p.market, g.plays, pl.name);
    if (v === null || !Number.isFinite(v)) continue;
    out.push({
      id: `${g.league}:${g.gameId}:prop:${p.athleteId}:${p.market.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      sport,
      date: g.date,
      kind: "prop",
      subject: p.name,
      team: p.team,
      opponent: p.team === g.home.abbr ? g.away.abbr : g.home.abbr,
      market: p.market,
      closingLine: line,
      result: v,
      headshotUrl: p.headshot,
    });
  }
  return out;
}
