import type { HistoryLine } from "../../src/lib/types";

/**
 * TEST FIXTURE ONLY. Synthetic names, never imported by the app, never
 * rendered. Exists so the board math can be checked without inventing a
 * streak on the live site.
 */
const mk = (
  id: string,
  subject: string,
  market: string,
  date: string,
  closingLine: number,
  result: number,
  kind: HistoryLine["kind"] = "prop"
): HistoryLine => ({
  id,
  sport: "NFL",
  date,
  kind,
  subject,
  team: "TST",
  opponent: "OPP",
  market,
  closingLine,
  result,
  headshotUrl: null,
});

const days = (n: number) => `2026-09-${String(n).padStart(2, "0")}`;

export const FIXTURE: HistoryLine[] = [
  // Player A: cleared the last 4, missed the one before → streak 4, n=6
  mk("a1", "Fixture Player A", "Rec Yds", days(1), 50.5, 60),
  mk("a2", "Fixture Player A", "Rec Yds", days(2), 50.5, 40),
  mk("a3", "Fixture Player A", "Rec Yds", days(3), 50.5, 51),
  mk("a4", "Fixture Player A", "Rec Yds", days(4), 52.5, 70),
  mk("a5", "Fixture Player A", "Rec Yds", days(5), 55.5, 56),
  mk("a6", "Fixture Player A", "Rec Yds", days(6), 58.5, 80),
  // Player B: 6 lines, 1 hit → would be cold but under 8 samples → hidden from cold
  ...[1, 2, 3, 4, 5, 6].map((d) =>
    mk(`b${d}`, "Fixture Player B", "Rush Yds", days(d), 60.5, d === 1 ? 70 : 30)
  ),
  // Player C: 9 lines, 2 hits → cold, eligible (n ≥ 8)
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) =>
    mk(`c${d}`, "Fixture Player C", "Pass Yds", days(d), 240.5, d <= 2 ? 300 : 200)
  ),
  // Team T: covered last 3 (margin + spread > 0), push before that breaks it
  mk("t1", "Fixture Team", "Spread", days(1), -3, 3, "side"), // push
  mk("t2", "Fixture Team", "Spread", days(2), -3.5, 7, "side"),
  mk("t3", "Fixture Team", "Spread", days(3), 2.5, 0, "side"),
  mk("t4", "Fixture Team", "Spread", days(4), -1.5, 10, "side"),
];
