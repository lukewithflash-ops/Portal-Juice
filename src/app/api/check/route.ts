import { NextResponse } from "next/server";
import { runBreakdown } from "@/lib/checkRun";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Read-only. Breaks down up to 6 legs from real ESPN numbers. */
export async function POST(req: Request) {
  let body: { legs?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const r = await runBreakdown(Array.isArray(body.legs) ? body.legs : []);
  if (!r) return NextResponse.json({ error: "Add a leg first." }, { status: 400 });
  return NextResponse.json({ ...r, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
