import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { currentUser, rateOk, sameOrigin } from "@/lib/auth";
import { chatEnabled, reportNote } from "@/lib/chat";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await ctx.params;
  if (!/^[a-z0-9.-]{2,30}$/.test(league) || !/^\d+$/.test(id)) return NextResponse.json({ error: "No game." }, { status: 404 });
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  if (!chatEnabled()) return NextResponse.json({ error: "Chat opens soon." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (typeof body.id !== "string" || !/^[a-z0-9-]{8,40}$/i.test(body.id)) return NextResponse.json({ error: "Bad message." }, { status: 400 });
  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0]!.trim().slice(0, 64);
  if (!(await rateOk(`chatrep:${ip}`, 20, 3600))) return NextResponse.json({ error: "Too many reports." }, { status: 429 });
  const u = await currentUser().catch(() => null);
  const who = u ? `u:${u.id}` : `ip:${createHash("sha256").update(ip).digest("hex").slice(0, 16)}`;
  const hidden = await reportNote(league, id, body.id, who);
  return NextResponse.json({ ok: true, hidden });
}
