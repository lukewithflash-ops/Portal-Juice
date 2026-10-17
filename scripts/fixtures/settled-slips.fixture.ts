/**
 * Settled-slip regression cases. Games are copied from ESPN scoreboards (Oct 2026): the window the matcher sees.
 * Case 1 is the user's "Settled" tab tennis slip (4 "Winner" legs with matchup rows and green checks).
 */
import type { SlateGame, SlipRow } from "../../src/lib/slipImport";

const ml = (subject: string, o: Partial<SlipRow> = {}): SlipRow => ({ subject, kind: "moneyline", market: "moneyline", line: null, selection: null, odds: null, league: null, date: null, settled: true, ...o });

export const NOW = Date.parse("2026-10-17T07:00:00Z");

export const GAMES: SlateGame[] = [
  // ESPN atp 202610: Shanghai QF, Medvedev d. Paul 6-3 1-6 6-3.
  { league: "atp", id: "184980", start: "2026-10-16T10:10Z", state: "post", away: { id: "3203", abbr: "T. Paul", name: "Tommy Paul" }, home: { id: "2383", abbr: "D. Medvedev", name: "Daniil Medvedev" }, sets: { away: ["3", "6", "3"], home: ["6", "1", "6"] }, winner: "home", event: "Rolex Shanghai Masters" },
  // ESPN atp: Antwerp R1, not played yet. Fearnley's only October match ESPN lists.
  { league: "atp", id: "185500", start: "2026-10-19T04:00Z", state: "pre", away: { id: "2794", abbr: "H. Gaston", name: "Hugo Gaston" }, home: { id: "9886", abbr: "J. Fearnley", name: "Jacob Fearnley" }, event: "BNP Paribas Fortis European Open" },
  // ESPN ufc: a finished fight the old matcher grabbed for "M. Kasnikowski".
  { league: "ufc", id: "600051", start: "2026-10-11T02:00Z", state: "post", away: { id: "4021", abbr: "N. Price", name: "Niko Price" }, home: { id: "4900", abbr: "L. Shahbazyan", name: "Laureano Shahbazyan" } },
  // Case 2: NBA preseason final.
  { league: "nba", id: "401809001", start: "2026-10-15T23:30Z", state: "post", away: { id: "2", abbr: "BOS", name: "Boston Celtics" }, home: { id: "20", abbr: "PHI", name: "Philadelphia 76ers" } },
  { league: "nba", id: "401809050", start: "2026-10-21T23:30Z", state: "pre", away: { id: "20", abbr: "PHI", name: "Philadelphia 76ers" }, home: { id: "18", abbr: "NY", name: "New York Knicks" } },
  // Case 3: two fights for one fighter: a final and a booked rematch.
  { league: "ufc", id: "600060", start: "2026-10-11T03:00Z", state: "post", away: { id: "5001", abbr: "A. Pereira", name: "Alex Pereira" }, home: { id: "5002", abbr: "M. Ankalaev", name: "Magomed Ankalaev" } },
  { league: "ufc", id: "600099", start: "2026-10-25T03:00Z", state: "pre", away: { id: "5001", abbr: "A. Pereira", name: "Alex Pereira" }, home: { id: "5003", abbr: "J. Hill", name: "Jamahal Hill" } },
  // Case 4: WTA final and the same player's next match.
  { league: "wta", id: "186900", start: "2026-10-12T08:00Z", state: "post", away: { id: "2746", abbr: "S. Kenin", name: "Sofia Kenin" }, home: { id: "1382", abbr: "H. Watson", name: "Heather Watson" }, sets: { away: ["6", "7"], home: ["4", "6"] }, winner: "away", event: "Kinoshita Group Japan Open" },
  { league: "wta", id: "186938", start: "2026-10-17T05:00Z", state: "in", away: { id: "2746", abbr: "S. Kenin", name: "Sofia Kenin" }, home: { id: "13738", abbr: "M. Yamaguchi", name: "Mei Yamaguchi" }, sets: { away: ["2", "5"], home: ["6", "0"] } },
];

export const CASES = {
  tennisSettled: [
    ml("D. Medvedev", { team: "Medved...", opponent: "Paul", sport: "tennis", mark: "win" }),
    ml("Z. Piros", { team: "Piros", opponent: "Giusti...", sport: "tennis", mark: "win" }),
    ml("M. Kasnikowski", { team: "Kasnik...", opponent: "Travag...", sport: "tennis", mark: "win" }),
    ml("J. Fearnley", { team: "Fearnl...", opponent: "Mrva", sport: "tennis", mark: "win" }),
  ],
  /** Settled team moneyline; the slip's check disagrees with ESPN (BOS lost). */
  nbaSettled: [ml("Celtics", { opponent: "76ers", mark: "win", league: "nba" })],
  /** Settled fight: the opponent picks the finished fight, not the booked one. */
  ufcSettled: [ml("A. Pereira", { opponent: "Ankalaev", sport: "mma", mark: "win" })],
  /** Settled tennis prop with a printed date: the final, never the live match. */
  wtaPropSettled: [{ subject: "S. Kenin", kind: "prop", market: "total games", line: 22.5, selection: "Over", odds: -115, league: "wta", date: "2026-10-12", settled: true, opponent: "Watson", mark: "win" } as SlipRow],
};
