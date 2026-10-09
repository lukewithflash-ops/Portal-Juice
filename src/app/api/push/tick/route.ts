import { NextResponse } from "next/server";
import { tryCheck } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Public nudge for the push check. Safe to call often: the server runs at most one check per 50 seconds
 * (Redis lock), and a check only reads ESPN and sends updates already due.
 */
async function run(source: string) {
  const r = await tryCheck(source).catch(() => ({ ran: false }));
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  return run("app");
}

export async function GET(req: Request) {
  const src = new URL(req.url).searchParams.get("src");
  return run(src === "gh" ? "github" : "ping");
}
