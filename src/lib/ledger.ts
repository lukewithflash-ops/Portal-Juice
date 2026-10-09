/**
 * Your own log, counted: wins, losses, pushes, open. Private to this device. Never sent to the leaderboard.
 * No profit, units, or sizing: stakes may be stored on this device but are never totaled or shown as winnings.
 */
import type { Pick } from "@/lib/types";

export type LogSummary = { won: number; lost: number; push: number; open: number };

export function summarize(picks: Pick[]): LogSummary {
  return {
    won: picks.filter((p) => p.status === "win").length,
    lost: picks.filter((p) => p.status === "loss").length,
    push: picks.filter((p) => p.status === "push").length,
    open: picks.filter((p) => p.status === "open").length,
  };
}

const TEAM_MARKET = /spread|money|^ml$|run line|puck line|game total|^total$|winner/i;

/** Props vs teams, from the market words on the pick. */
export function pickKind(p: Pick): "prop" | "team" {
  const m = (p.market ?? "").trim();
  if (m && TEAM_MARKET.test(m)) return "team";
  if (m || p.selection) return "prop";
  return "team";
}
