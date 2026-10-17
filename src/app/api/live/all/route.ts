import { NextResponse } from "next/server";
import { getAllLive } from "@/lib/allLive";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Read-only. Every game in progress across all leagues the site lists. */
export async function GET() {
  const data = await getAllLive();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store, max-age=0", "CDN-Cache-Control": "public, max-age=2", "Vercel-CDN-Cache-Control": "public, max-age=2" },
  });
}
