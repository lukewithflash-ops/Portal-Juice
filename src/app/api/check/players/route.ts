import { NextResponse } from "next/server";
import { gameRoster } from "@/lib/research";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const league = u.searchParams.get("league") ?? "";
  const id = u.searchParams.get("id") ?? "";
  if (!/^[a-z]+$/.test(league) || !/^\d+$/.test(id)) return NextResponse.json({ error: "Bad game." }, { status: 400 });
  const data = await gameRoster(league, id);
  return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" } });
}
