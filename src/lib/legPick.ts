/** Turn a Breakdown leg into a Log pick. Stake starts blank (0); you fill it in. */
import { statLabel, type LegInput } from "@/lib/breakdown";
import type { Pick, Sport } from "@/lib/types";

const SPORT: Record<string, Sport> = { nfl: "NFL", ncaaf: "NFL", nba: "NBA", wnba: "NBA", ncaam: "NBA", ncaaw: "NBA", mlb: "MLB", nhl: "NHL" };

export function sportOf(league: string): Sport {
  return SPORT[league] ?? "SOCCER";
}

export function pickFromLeg(
  leg: LegInput,
  teams: { home: string; away: string },
  extra: { stake?: number; book?: string; slipId?: string; odds?: number | null; date?: string } = {}
): Pick {
  const now = new Date();
  const side = leg.side === "away" ? teams.away : teams.home;
  const subject =
    leg.kind === "prop" ? leg.athleteName ?? "Player" : leg.kind === "total" ? `${teams.away} @ ${teams.home}` : leg.team ?? side;
  const market =
    leg.kind === "prop" ? (leg.stat ? statLabel(leg.league, leg.stat) : leg.market ?? "") : leg.kind === "total" ? "Total" : leg.kind === "spread" ? "Spread" : "Moneyline";
  const odds = extra.odds ?? leg.odds ?? 0;
  return {
    id: crypto.randomUUID(),
    sport: sportOf(leg.league),
    subject,
    line: leg.kind === "moneyline" ? 0 : leg.line ?? 0,
    odds: odds && Math.abs(odds) >= 100 ? Math.round(odds) : 0,
    stake: extra.stake && extra.stake > 0 ? extra.stake : 0,
    book: extra.book?.trim() || "Not set",
    date: extra.date ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    status: "open",
    createdAt: now.toISOString(),
    league: leg.league,
    gameId: leg.gameId,
    market,
    selection: leg.kind === "prop" || leg.kind === "total" ? (leg.pick === "under" ? "Under" : "Over") : null,
    slipId: extra.slipId,
  };
}
