import { NextResponse } from "next/server";
import { getRacePage } from "@/lib/racingFetch";
import { LIVE_HEADERS } from "@/lib/liveCache";

export const dynamic = "force-dynamic";

/** One race weekend: running order, status, reads. Short cache while live. */
export async function GET(req: Request, { params }: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await params;
  const s = new URL(req.url).searchParams.get("s");
  const page = await getRacePage(league, id, s).catch(() => null);
  if (!page) return NextResponse.json({ error: "not found" }, { status: 404 });
  const live = page.event.state === "in";
  return NextResponse.json(page, { headers: live ? LIVE_HEADERS : { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
}
