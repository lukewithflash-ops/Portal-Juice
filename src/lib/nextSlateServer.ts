import "server-only";
import { getSlateFor } from "@/lib/espn";
import { addDay, pricedUpcoming, slateDone } from "@/lib/nextSlate";
import { rankGames, type Game, type Slate } from "@/lib/slate";

/** Null while today still has games to play. Otherwise the next day (within 4) with priced games, or an empty note. */
export async function nextSlate(slate: Pick<Slate, "day" | "games">): Promise<{ label: string | null; games: Game[] } | null> {
  if (!slateDone(slate.games)) return null;
  let out: { label: string | null; games: Game[] } = { label: null, games: [] };
  for (let i = 1; i <= 4; i++) {
    const s = await getSlateFor(addDay(slate.day, i)).catch(() => null);
    if (!s || !s.games.length) continue;
    const priced = rankGames(pricedUpcoming(s.games));
    out = { label: s.dayLabel, games: priced.slice(0, 8) };
    if (priced.length) break;
  }
  return out;
}
