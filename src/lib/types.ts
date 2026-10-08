/** Sports in launch order. A sport renders only when it has rows. */
export const SPORT_ORDER = ["NFL", "NBA", "MLB", "NHL", "SOCCER"] as const;
export type Sport = (typeof SPORT_ORDER)[number];

export const SPORT_LABEL: Record<Sport, string> = {
  NFL: "NFL",
  NBA: "NBA",
  MLB: "MLB",
  NHL: "NHL",
  SOCCER: "Soccer",
};

/**
 * One row on the /lines board.
 * Data contract: every field comes from the feed. Nothing is filled in by the UI.
 */
export type LineRow = {
  id: string;
  sport: Sport;
  /** "prop" = player market, "side" = spread / total for a game */
  kind: "prop" | "side";
  /** Player name, or side label (e.g. "Boston Celtics", "BOS @ CLE"). */
  subject: string;
  /** Team abbreviation for the subject (or away team for a total). */
  team: string;
  /** Opponent abbreviation. */
  opponent: string;
  /** True when `team` is the home side. */
  home: boolean;
  /** Market label, e.g. "Pass Yds", "Spread", "Total". */
  market: string;
  /** "Over" | "Under" for O/U markets, null for spreads. */
  selection: "Over" | "Under" | null;
  /** Current number. */
  line: number;
  /** Number at the previous feed pull. null = no previous pull stored. */
  prevLine: number | null;
  /** American odds for the shown selection. */
  juice: number;
  /** American odds at the previous pull. */
  prevJuice: number | null;
  /** Book short code that holds this price (DK, FD, MGM, CZ, BR…). */
  book: string;
  /** ISO kickoff / tip time. */
  startsAt: string;
  /**
   * Licensed feed or league-allowed headshot only. Anything else is dropped
   * by sanitizeRow() and the card shows the team mark.
   */
  headshotUrl: string | null;
  /** ISO time this row last printed from the feed. Old prints render as stale. */
  updatedAt: string;
  /** Print history for this line, oldest first. Shown on tap; nothing else. */
  prints: Print[];
};

export type Print = { at: string; line: number; juice: number };

/** Sports that actually have rows, in launch order. */
export function liveSports(rows: { sport: Sport }[]): Sport[] {
  return SPORT_ORDER.filter((s) => rows.some((r) => r.sport === s));
}

export type LinesSnapshot = {
  /** ISO time the snapshot was pulled. */
  pulledAt: string;
  /** What `prevLine` / `prevJuice` refers to for this pull. */
  previousPull: string;
  /** Feed name, or null when no feed is connected. */
  source: string | null;
  rows: LineRow[];
};

/** A graded, stored line used by /lines/board. */
export type HistoryLine = {
  id: string;
  sport: Sport;
  /** ISO date of the game. */
  date: string;
  kind: "prop" | "side";
  /** Player name (prop) or team name (side). */
  subject: string;
  team: string;
  opponent: string;
  /** "Rec Yds", "Spread"… */
  market: string;
  /**
   * Closing line. Props: the over/under number.
   * Sides: the subject team's closing spread (e.g. -3.5).
   */
  closingLine: number;
  /**
   * Graded result. Props: the player's actual stat.
   * Sides: subject team's final margin (team score − opponent score).
   */
  result: number;
  headshotUrl: string | null;
};

export type PickStatus = "open" | "win" | "loss" | "push";

/** A pick the user already placed at a legal book, logged on this device. */
export type Pick = {
  id: string;
  sport: Sport;
  /** Player or side, as the user wrote it on the ticket. */
  subject: string;
  line: number;
  odds: number;
  stake: number;
  book: string;
  date: string;
  status: PickStatus;
  createdAt: string;
};
