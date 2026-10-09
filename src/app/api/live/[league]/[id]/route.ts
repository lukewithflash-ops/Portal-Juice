import { NextResponse } from "next/server";
import { getLive } from "@/lib/espn";
import { LIVE_HEADERS } from "@/lib/liveCache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, ctx: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await ctx.params;
  const snap = await getLive(league, id);
  if (!snap) return NextResponse.json({ error: "No live feed." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ...snap, servedAt: new Date().toISOString() }, { headers: LIVE_HEADERS });
}
