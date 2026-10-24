import { NextResponse } from "next/server";
import { currentUser, sameOrigin } from "@/lib/auth";
import { redis } from "@/lib/chat";
import { coinsOn, markActivity } from "@/lib/coins";
import { laDay } from "@/lib/coinsCore";
import { liveSnapAny } from "@/lib/liveAny";

export const dynamic = "force-dynamic";
const NEED = 60; // minutes of live play with the game open

/** Heartbeat from an open, visible live game page, once a minute. Counts at most one minute per 55s, only while the real game is live. */
export async function POST(req: Request) {
  if (!coinsOn()) return NextResponse.json({ ok: false });
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.json({ ok: false });
  const b = (await req.json().catch(() => ({}))) as { league?: string; id?: string };
  const league = String(b.league ?? ""), id = String(b.id ?? "");
  if (!/^[a-z0-9.-]{2,24}$/.test(league) || !/^\d{4,14}$/.test(id)) return NextResponse.json({ error: "Bad game." }, { status: 400 });
  // One counted minute per account per 55s, across all games (no multi-tab farming).
  if ((await redis(["SET", `pj:watch:tick:${u.id}`, "1", "NX", "EX", 55])) !== "OK") return NextResponse.json({ ok: true, counted: false });
  const s = await liveSnapAny(league, id);
  if (!s || s.state !== "in") return NextResponse.json({ ok: true, counted: false });
  const k = `pj:watch:${u.id}:${laDay()}:${league}:${id}`;
  const n = Number(await redis(["INCR", k]));
  await redis(["EXPIRE", k, 2 * 86400]);
  if (n >= NEED) await markActivity(u.id, "watch").catch(() => {});
  return NextResponse.json({ ok: true, counted: true, minutes: n, need: NEED });
}
