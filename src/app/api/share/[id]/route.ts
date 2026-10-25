import { NextResponse } from "next/server";
import { takeShare } from "@/lib/shareInbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const item = await takeShare(id).catch(() => null);
  if (!item) return NextResponse.json({ error: "That share expired. Share it again." }, { status: 404 });
  return NextResponse.json(item, { headers: { "cache-control": "no-store" } });
}
