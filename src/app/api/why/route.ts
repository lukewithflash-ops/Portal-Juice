import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { vipState } from "@/lib/vipAccess";
import { buildWhy } from "@/lib/why";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Why panel for one game. Injuries + Portal's similar-spot record for everyone; splits + trends for VIP. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const lg = q.get("lg") ?? "";
  const id = q.get("id") ?? "";
  if (!/^[a-z0-9.-]{2,24}$/i.test(lg) || !/^\d{1,14}$/.test(id)) return NextResponse.json({ error: "bad" }, { status: 400 });
  const vip = (await vipState(await currentUser())).vip;
  const why = await buildWhy(lg, id, vip);
  if (!why) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(why, { headers: { "cache-control": "private, no-store" } });
}
