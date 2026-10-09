import { NextResponse } from "next/server";
import { getSportSlate } from "@/lib/sportsFetch";

export const revalidate = 15;

export async function GET(_req: Request, { params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  try {
    const slate = await getSportSlate(league);
    if (!slate) return NextResponse.json({ error: "Unknown league." }, { status: 404 });
    return NextResponse.json(slate, { headers: { "Cache-Control": "s-maxage=15, stale-while-revalidate=30" } });
  } catch {
    return NextResponse.json({ error: "ESPN did not answer." }, { status: 502 });
  }
}
