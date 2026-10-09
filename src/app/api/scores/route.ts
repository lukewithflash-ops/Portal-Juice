import { NextResponse } from "next/server";
import { getScores } from "@/lib/espn";
import { LIVE_HEADERS } from "@/lib/liveCache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Read-only. Score, clock, and state for today's games. */
export async function GET() {
  const data = await getScores();
  return NextResponse.json(data, { headers: LIVE_HEADERS });
}
