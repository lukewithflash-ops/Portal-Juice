import { implied } from "./odds";
import type { LineRow } from "./types";

/**
 * Direction of a move relative to the side shown.
 *  +1 = the market moved FOR this side (green)
 *  -1 = the market moved AGAINST this side (red)
 *   0 = unchanged (off-white)
 */
export type Dir = -1 | 0 | 1;

/** Juice: price got more expensive (higher implied %) → moved for this side. */
export function juiceDir(row: Pick<LineRow, "juice" | "prevJuice">): Dir {
  if (row.prevJuice === null || row.prevJuice === row.juice) return 0;
  return implied(row.juice) > implied(row.prevJuice) ? 1 : -1;
}

/**
 * Line: Over → number up is for the side. Under → number down.
 * Spread → more negative (laying more) is for the side.
 */
export function lineDir(row: Pick<LineRow, "line" | "prevLine" | "selection">): Dir {
  if (row.prevLine === null) return 0;
  const d = Number((row.line - row.prevLine).toFixed(2));
  if (d === 0) return 0;
  if (row.selection === "Over") return d > 0 ? 1 : -1;
  if (row.selection === "Under") return d < 0 ? 1 : -1;
  return d < 0 ? 1 : -1;
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
