/** Where a game link really lives. Every league the site lists has a page; anything else falls back to /games. Pure. */
import { leagueById } from "@/lib/slate";
import { sportLeague } from "@/lib/sports";

export function gameRoute(league: string, id: string): string {
  const l = (league || "").toLowerCase();
  if (!id) return "/games";
  if (leagueById(l)) return `/games/${l}/${id}`;
  if (sportLeague(l)) return `/sports/${l}/${id}`;
  return "/games";
}
