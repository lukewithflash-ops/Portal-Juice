import type { HistoryLine } from "@/lib/types";

/**
 * Stored, graded lines that power /lines/board.
 *
 * Append only real rows: a closing line from the feed plus the graded result
 * from the final box score. Never hand-write a streak. Empty → the board
 * shows its empty state.
 */
export const HISTORY: HistoryLine[] = [];
