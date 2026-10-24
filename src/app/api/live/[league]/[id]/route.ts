import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getLive } from "@/lib/espn";
import { LIVE_HEADERS } from "@/lib/liveCache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Conditional reads: the client sends the last ETag; an unchanged game answers 304 with no body. */
export async function GET(req: Request, ctx: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await ctx.params;
  const snap = await getLive(league, id);
  if (!snap) return NextResponse.json({ error: "No live feed." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const body = JSON.stringify(snap);
  const etag = `"${createHash("sha1").update(body).digest("base64url").slice(0, 20)}"`;
  const h = { ...LIVE_HEADERS, ETag: etag, "Access-Control-Expose-Headers": "ETag" };
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: h });
  return new NextResponse(body.slice(0, -1) + `,"servedAt":"${new Date().toISOString()}"}`, { headers: { ...h, "content-type": "application/json" } });
}
