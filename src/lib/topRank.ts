/** Pure ranking for a game's three favorite picks. */
import type { LegInput, LegReport } from "@/lib/breakdown";

export type TopPick = {
  rank: number;
  leg: LegInput;
  title: string;
  sub: string;
  lean: LegReport["lean"];
  score: number;
  /** The heaviest pro, word for word. */
  reason: string;
  pros: number;
  cons: number;
  implied: number | null;
  odds: number | null;
  mark: LegReport["mark"] | null;
};

export type TopPicks = { picks: TopPick[]; considered: number; note: string | null; at: string };

/** Only legs that lean good or strong. Sorted by score, then pro count, then fewer cons. */
export function rankTopPicks(rows: { leg: LegInput; report: LegReport }[], n = 3): TopPicks {
  const good = rows
    .filter((r) => (r.report.lean === "good" || r.report.lean === "strong") && r.report.pros.length)
    .sort(
      (a, b) =>
        b.report.score - a.report.score ||
        b.report.pros.length - a.report.pros.length ||
        a.report.cons.length - b.report.cons.length ||
        (b.report.implied ?? 0) - (a.report.implied ?? 0)
    );
  const picks = good.slice(0, n).map((r, i) => {
    const top = [...r.report.pros].sort((a, b) => b.weight - a.weight)[0];
    return {
      rank: i + 1,
      leg: r.leg,
      title: r.report.title,
      sub: r.report.sub,
      lean: r.report.lean,
      score: r.report.score,
      reason: top.text,
      pros: r.report.pros.length,
      cons: r.report.cons.length,
      implied: r.report.implied,
      odds: r.report.odds,
      mark: r.report.mark ?? null,
    };
  });
  const note =
    picks.length === n
      ? null
      : picks.length === 0
        ? `Not enough data: none of the ${rows.length} legs checked lean good by the numbers.`
        : `Only ${picks.length} of the ${rows.length} legs checked lean good by the numbers.`;
  return { picks, considered: rows.length, note, at: new Date().toISOString() };
}
