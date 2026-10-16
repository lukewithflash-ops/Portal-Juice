import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The deploy this server runs. The app reloads when it differs from the one it loaded. */
export function GET() {
  return NextResponse.json({ build: process.env.NEXT_PUBLIC_BUILD_ID ?? null }, { headers: { "cache-control": "no-store" } });
}
