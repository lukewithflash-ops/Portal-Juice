import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/feed";

export const dynamic = "force-dynamic";

/** Read-only. GET the current board. There is no write route. */
export async function GET() {
  const snap = await getSnapshot();
  return NextResponse.json(snap, { headers: { "Cache-Control": "no-store" } });
}
