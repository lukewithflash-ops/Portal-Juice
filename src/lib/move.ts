import { implied } from "./odds";
import type { LineRow } from "./types";

/**
 * Direction of a move, judged by the price for the side shown.
 *  +1 = better number for someone taking this side now (green): −110 → −105, +120 → +130, Over 47.5 → 46.5
 *  -1 = worse number for this side (red): −110 → −120
 *   0 = unchanged, or no side to judge (off-white). A total with no side is never painted.
 */
export type Dir = -1 | 0 | 1;

/** Juice: cheaper (lower implied %) is a better price for this side. */
export function juiceDir(row: Pick<LineRow, "juice" | "prevJuice">): Dir {
  if (row.prevJuice === null || row.prevJuice === row.juice) return 0;
  return implied(row.juice) < implied(row.prevJuice) ? 1 : -1;
}

/**
 * Line, for the side shown: Over → lower number is better. Under → higher is better.
 * Spread (signed, no Over/Under) → higher number is better (−3 → −2.5, +3 → +3.5).
 */
export function lineDir(row: Pick<LineRow, "line" | "prevLine" | "selection">): Dir {
  if (row.prevLine === null) return 0;
  const d = Number((row.line - row.prevLine).toFixed(2));
  if (d === 0) return 0;
  if (row.selection === "Over") return d < 0 ? 1 : -1;
  if (row.selection === "Under") return d > 0 ? 1 : -1;
  return d > 0 ? 1 : -1;
}

/** A logged pick: same rule, judged for the side you logged. */
export function loggedLineDir(side: "Over" | "Under" | "spread", from: number, to: number): Dir {
  return lineDir({ line: to, prevLine: from, selection: side === "spread" ? null : side });
}

/** American price for the printed side: higher payout is better (−110 → −105 green, −110 → −120 red). */
export function priceDir(from: number | null, to: number | null): Dir {
  if (from === null || to === null || from === to) return 0;
  return juiceDir({ juice: to, prevJuice: from });
}

export function moved(row: LineRow): boolean {
  return juiceDir(row) !== 0 || lineDir(row) !== 0;
}

/** A row that has not printed within this window is stale: labelled, never pulsed. */
export const STALE_MS = 10 * 60 * 1000;

export function isStale(row: Pick<LineRow, "updatedAt">, now: number): boolean {
  const t = Date.parse(row.updatedAt);
  return !Number.isFinite(t) || now - t > STALE_MS;
}

export const dirClass = (d: Dir) =>
  d > 0 ? "text-[color:var(--plus)]" : d < 0 ? "text-[color:var(--minus)]" : "text-[color:var(--flat)]";
