import { sportLeague } from "@/lib/sports";
/** ESPN headshot for a league and athlete id. Same CDN the rest of the site uses. */
const SLUG: Record<string, string> = { nfl: "nfl", nba: "nba", mlb: "mlb", nhl: "nhl", ncaaf: "college-football", wnba: "wnba", ncaam: "mens-college-basketball", ncaaw: "womens-college-basketball" };

export function headshotFor(league: string, athleteId: string | null | undefined): string | null {
  if (!athleteId || !/^\d+$/.test(athleteId)) return null;
  const slug = SLUG[league] ?? (sportLeague(league)?.kind === "soccer" ? "soccer" : null);
  return slug ? `https://a.espncdn.com/i/headshots/${slug}/players/full/${athleteId}.png` : null;
}
