import { NextResponse } from "next/server";
import { getTopPicks } from "@/lib/topPicks";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request, { params }: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await params;
  if (!/^[a-z]+$/.test(league) || !/^\d+$/.test(id)) return NextResponse.json({ error: "Bad game." }, { status: 400 });
  const live = new URL(req.url).searchParams.get("live") === "1";
  const data = await getTopPicks(league, id, live);
  return NextResponse.json(data, { headers: { "Cache-Control": `public, s-maxage=${live ? 60 : 300}, stale-while-revalidate=600` } });
}
