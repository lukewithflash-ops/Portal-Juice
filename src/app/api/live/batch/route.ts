import { NextResponse } from "next/server";
import { liveSnapAny } from "@/lib/liveAny";
import { LIVE_HEADERS } from "@/lib/liveCache";
import type { LiveSnap } from "@/lib/live";
import { parseBatch, slimSnap } from "@/lib/liveSlim";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Read-only. Several live games in one call: /api/live/batch?g=nfl:401,nba:402 (16 max). */
export async function GET(req: Request) {
  const games = parseBatch(new URL(req.url).searchParams.get("g"));
  const snaps: Record<string, LiveSnap | null> = {};
  await Promise.all(
    games.map(async ({ league, id }) => {
      // Tennis has no game summary: the match comes from its scoreboard, set by set.
      const snap = await liveSnapAny(league, id);
      snaps[`${league}/${id}`] = snap ? slimSnap(league, snap) : null;
    })
  );
  return NextResponse.json({ servedAt: new Date().toISOString(), snaps }, { headers: LIVE_HEADERS });
}
