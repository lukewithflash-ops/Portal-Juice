import type { Pick } from "@/lib/types";

export const UNIT_NOTE = "A sizing hint from your own slips. Not advice.";

export type UnitHint = {
  /** Median of stakes the user logged. 1 unit = this. */
  unit: number;
  /** How many logged picks had a stake. */
  count: number;
  total: number;
  totalUnits: number;
  openTotal: number;
  openUnits: number;
};

function round(n: number, d = 2) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** Built only from stakes already logged on this device. Null when none were logged. */
export function unitHint(picks: Pick[]): UnitHint | null {
  const staked = picks.filter((p) => Number.isFinite(p.stake) && p.stake > 0);
  if (!staked.length) return null;
  const sorted = staked.map((p) => p.stake).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const unit = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const total = staked.reduce((s, p) => s + p.stake, 0);
  const openTotal = staked.filter((p) => p.status === "open").reduce((s, p) => s + p.stake, 0);
  return {
    unit: round(unit),
    count: staked.length,
    total: round(total),
    totalUnits: round(total / unit, 1),
    openTotal: round(openTotal),
    openUnits: round(openTotal / unit, 1),
  };
}
