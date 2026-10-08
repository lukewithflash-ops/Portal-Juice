import { NextResponse } from "next/server";
import { getLive } from "@/lib/espn";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await ctx.params;
  const snap = await getLive(league, id);
  if (!snap) return NextResponse.json({ error: "No live feed." }, { status: 404 });
  return NextResponse.json(snap, { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=10" } });
}
