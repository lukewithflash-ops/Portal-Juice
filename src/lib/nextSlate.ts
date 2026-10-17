/** When today's slate is done, the next one with a real number goes on top. Pure. */
import type { Game } from "@/lib/slate";

export const NEXT_EMPTY = "Next slate posts when ESPN sends a number.";

/** True when nothing today is still to play or in progress (all final, or no games). */
export function slateDone(games: Pick<Game, "state">[]): boolean {
  return !games.some((g) => g.state === "pre" || g.state === "in");
}

/** Upcoming games that carry a real ESPN number (total or spread or moneyline). */
export function pricedUpcoming<T extends Pick<Game, "state" | "price">>(games: T[]): T[] {
  return games.filter((g) => g.state === "pre" && !!g.price && (g.price.total != null || g.price.spreadHome != null || g.price.homeMl != null || g.price.awayMl != null));
}

export function addDay(day: string, n: number): string {
  const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8) + n));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
