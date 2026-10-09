/**
 * Your own log, counted. Private to this device. Never sent to the leaderboard.
 * Everything here comes from stakes and odds you typed in.
 */
import type { Lean } from "@/lib/breakdown";
import type { Pick } from "@/lib/types";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Return on a win, not counting the stake back. */
export function winAmount(stake: number, odds: number): number {
  if (!(stake > 0) || !Number.isFinite(odds) || Math.abs(odds) < 100) return 0;
  return r2(odds > 0 ? (stake * odds) / 100 : (stake * 100) / Math.abs(odds));
}

/** + on a win, − on a loss, 0 on a push or open. */
export function pickNet(p: Pick): number {
  if (p.status === "win") return winAmount(p.stake, p.odds);
  if (p.status === "loss") return -(p.stake > 0 ? p.stake : 0);
  return 0;
}

export function medianStake(picks: Pick[]): number | null {
  const s = picks.map((p) => p.stake).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return r2(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

/** Your set unit wins; otherwise the median of your logged stakes. */
export function baseUnit(picks: Pick[], set: number | null): number | null {
  if (set !== null && Number.isFinite(set) && set > 0) return r2(set);
  return medianStake(picks);
}

export function toUnits(amount: number, unit: number | null): number | null {
  return unit && unit > 0 ? Math.round((amount / unit) * 100) / 100 : null;
}

export type LogSummary = {
  won: number;
  lost: number;
  push: number;
  open: number;
  /** Wins over decided picks, 0–1. Null with nothing decided. */
  hitRate: number | null;
  net: number;
  netUnits: number | null;
  staked: number;
  avgStake: number | null;
  avgUnits: number | null;
  unit: number | null;
};

export function summarize(picks: Pick[], unit: number | null): LogSummary {
  const won = picks.filter((p) => p.status === "win").length;
  const lost = picks.filter((p) => p.status === "loss").length;
  const push = picks.filter((p) => p.status === "push").length;
  const open = picks.filter((p) => p.status === "open").length;
  const net = r2(picks.reduce((s, p) => s + pickNet(p), 0));
  const stakes = picks.map((p) => p.stake).filter((x) => x > 0);
  const staked = r2(stakes.reduce((s, x) => s + x, 0));
  const avgStake = stakes.length ? r2(staked / stakes.length) : null;
  return {
    won,
    lost,
    push,
    open,
    hitRate: won + lost ? won / (won + lost) : null,
    net,
    netUnits: toUnits(net, unit),
    staked,
    avgStake,
    avgUnits: avgStake !== null ? toUnits(avgStake, unit) : null,
    unit,
  };
}

/** Modest scale from the Breakdown lean. Never above 1.5u. */
export const LEAN_SCALE: Record<Lean, number> = { strong: 1.5, good: 1.25, neutral: 1, none: 1, bad: 0.5 };
export const MAX_UNITS = 1.5;

export type UnitSuggestion = { units: number; amount: number; why: string };

export function suggestUnits(unit: number | null, lean: Lean | null): UnitSuggestion | null {
  if (!unit || unit <= 0) return null;
  const scale = lean ? LEAN_SCALE[lean] : 1;
  const units = Math.min(MAX_UNITS, scale);
  const why =
    !lean || lean === "none"
      ? "1u: your usual size"
      : lean === "bad"
        ? "0.5u: Breakdown leans bad"
        : lean === "neutral"
          ? "1u: Breakdown is even"
          : `${units}u: Breakdown ${lean === "strong" ? "strongest lean" : "leans good"} (capped at ${MAX_UNITS}u)`;
  return { units, amount: r2(unit * units), why };
}

const TEAM_MARKET = /spread|money|^ml$|run line|puck line|game total|^total$|winner/i;

/** Props vs teams, from the market words on the pick. */
export function pickKind(p: Pick): "prop" | "team" {
  const m = (p.market ?? "").trim();
  if (m && TEAM_MARKET.test(m)) return "team";
  if (m || p.selection) return "prop";
  return "team";
}

export function money(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const v = Math.abs(n);
  return `${sign}${v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export function unitsText(n: number | null, signed = false): string {
  if (n === null) return "—";
  const s = signed && n > 0 ? "+" : n < 0 ? "−" : "";
  return `${s}${Math.abs(Math.round(n * 100) / 100)}u`;
}
