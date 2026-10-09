/** "Our lean" for one game: the strongest of moneyline, spread, and total by the breakdown engine. Pure. */
import { analyzeLeg, type GameResearch, type LegInput, type LegReport } from "@/lib/breakdown";

export type GameLean =
  | { kind: "lean"; leg: LegInput; report: LegReport; points: { text: string; weight: number; pro: boolean }[] }
  | { kind: "none"; reason: string };

export function leanCandidates(g: GameResearch): LegInput[] {
  const o = g.odds;
  if (!o) return [];
  const base = { league: g.league, gameId: g.id };
  const out: LegInput[] = [];
  if (o.homeMl != null && o.awayMl != null) {
    out.push({ ...base, kind: "moneyline", side: "home", odds: o.homeMl }, { ...base, kind: "moneyline", side: "away", odds: o.awayMl });
  }
  if (o.spreadHome != null) {
    out.push(
      { ...base, kind: "spread", side: "home", line: o.spreadHome, odds: o.homeSpreadJuice },
      { ...base, kind: "spread", side: "away", line: -o.spreadHome, odds: o.awaySpreadJuice }
    );
  }
  if (o.total != null) {
    out.push({ ...base, kind: "total", pick: "over", line: o.total, odds: o.overJuice }, { ...base, kind: "total", pick: "under", line: o.total, odds: o.underJuice });
  }
  return out;
}

export function chooseLean(g: GameResearch | null): GameLean {
  if (!g) return { kind: "none", reason: "Not enough data. ESPN has no research for this game yet." };
  const legs = leanCandidates(g);
  if (!legs.length) return { kind: "none", reason: "Not enough data. No moneyline, spread, or total posted yet." };
  const rows = legs.map((leg) => ({ leg, report: analyzeLeg(leg, g) }));
  const n = (r: LegReport) => r.pros.length + r.cons.length;
  rows.sort((a, b) => b.report.score - a.report.score || n(b.report) - n(a.report));
  const best = rows[0];
  if (n(best.report) < 2) return { kind: "none", reason: "Not enough data. Fewer than two numbers to weigh." };
  if (best.report.score <= 0) return { kind: "none", reason: "No side stands out by the numbers." };
  const points = [
    ...best.report.pros.map((p) => ({ ...p, pro: true })),
    ...best.report.cons.map((p) => ({ ...p, pro: false })),
  ]
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 5);
  return { kind: "lean", leg: best.leg, report: best.report, points };
}
