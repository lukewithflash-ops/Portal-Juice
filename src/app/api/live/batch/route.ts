import { NextResponse } from "next/server";
import { getLive } from "@/lib/espn";
import { LIVE_HEADERS } from "@/lib/liveCache";
import type { LiveSnap } from "@/lib/live";
import { parseBatch, slimSnap } from "@/lib/liveSlim";
import { sportLeague } from "@/lib/sports";
import { getMatch } from "@/lib/sportsFetch";
import { tennisSnap } from "@/lib/tennisSnap";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Read-only. Several live games in one call: /api/live/batch?g=nfl:401,nba:402 (16 max). */
export async function GET(req: Request) {
  const games = parseBatch(new URL(req.url).searchParams.get("g"));
  const snaps: Record<string, LiveSnap | null> = {};
  await Promise.all(
    games.map(async ({ league, id }) => {
      // Tennis has no game summary: the match comes from its scoreboard, set by set.
      const snap = sportLeague(league)?.kind === "tennis"
        ? await getMatch(league, id).then((p) => (p ? tennisSnap(p.match) : null)).catch(() => null)
        : await getLive(league, id).catch(() => null);
      snaps[`${league}/${id}`] = snap ? slimSnap(league, snap) : null;
    })
  );
  return NextResponse.json({ servedAt: new Date().toISOString(), snaps }, { headers: LIVE_HEADERS });
}
