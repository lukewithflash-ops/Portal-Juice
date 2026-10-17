import { NextResponse } from "next/server";
import { currentUser, rateOk, sameOrigin } from "@/lib/auth";
import { react } from "@/lib/social";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await rateOk(`frx:${u.id}`, 40, 600))) return NextResponse.json({ error: "Slow down a little." }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { handle?: string; pickId?: string; emote?: string };
  const ok = await react(u.id, String(b.handle ?? ""), String(b.pickId ?? ""), String(b.emote ?? ""));
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not sent." }, { status: 400 });
}
