import "server-only";
import { getLive } from "@/lib/espn";
import type { LiveSnap } from "@/lib/live";
import { sportLeague } from "@/lib/sports";
import { getMatch } from "@/lib/sportsFetch";
import { tennisSnap } from "@/lib/tennisSnap";

/** A live snapshot for any league. Tennis has no game summary: the match comes from its scoreboard. */
export async function liveSnapAny(league: string, id: string): Promise<LiveSnap | null> {
  if (sportLeague(league)?.kind === "tennis") return getMatch(league, id).then((p) => (p ? tennisSnap(p.match) : null)).catch(() => null);
  return getLive(league, id).catch(() => null);
}
