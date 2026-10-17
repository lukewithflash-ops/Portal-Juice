import { NextResponse } from "next/server";
import { rateOk, sameOrigin } from "@/lib/auth";
import { chatEnabled, reactNote } from "@/lib/chat";
import { EMOTES } from "@/lib/questsCore";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await ctx.params;
  if (!/^[a-z0-9.-]{2,30}$/.test(league) || !/^\d+$/.test(id)) return NextResponse.json({ error: "No game." }, { status: 404 });
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  if (!chatEnabled()) return NextResponse.json({ error: "Chat opens soon." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; emote?: unknown };
  if (typeof body.id !== "string" || !/^[a-z0-9-]{8,40}$/i.test(body.id)) return NextResponse.json({ error: "Bad message." }, { status: 400 });
  if (typeof body.emote !== "string" || !EMOTES.some((e) => e.id === body.emote)) return NextResponse.json({ error: "Bad emote." }, { status: 400 });
  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0]!.trim().slice(0, 64);
  if (!(await rateOk(`chatrx:${ip}`, 40, 300))) return NextResponse.json({ error: "Easy on the reactions." }, { status: 429 });
  await reactNote(league, id, body.id, body.emote);
  return NextResponse.json({ ok: true });
}
