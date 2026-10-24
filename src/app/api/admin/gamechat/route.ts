import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminDelete, adminMute, adminReports, adminRoom, adminWipe, validRoom } from "@/lib/gameChat";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store" };

function authed(req: Request): boolean {
  const want = process.env.PJ_ADMIN_SECRET || "";
  const got = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (want.length < 24 || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** Owner-only. GET ?room=league:id → room messages; GET → report queue. */
export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const roomQ = new URL(req.url).searchParams.get("room");
  if (roomQ) {
    const [l, ...rest] = roomQ.split(":");
    const room = validRoom(l, rest.join(":"));
    if (!room) return NextResponse.json({ error: "Bad room." }, { status: 400 });
    return NextResponse.json({ room, msgs: await adminRoom(room) }, { headers: H });
  }
  return NextResponse.json({ reports: await adminReports() }, { headers: H });
}

/** POST { action: "delete", room, id } | { action: "mute", handle, hours } (0 = unmute) | { action: "wipe", room }. */
export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; room?: string; id?: string; handle?: string; hours?: number };
  const parse = () => {
    const [l, ...rest] = String(b.room ?? "").split(":");
    return validRoom(l ?? "", rest.join(":"));
  };
  if (b.action === "delete" || b.action === "wipe") {
    const room = parse();
    if (!room) return NextResponse.json({ error: "Bad room." }, { status: 400 });
    if (b.action === "delete") await adminDelete(room, String(b.id ?? ""));
    else await adminWipe(room);
    return NextResponse.json({ ok: true }, { headers: H });
  }
  if (b.action === "mute") {
    const uid = await adminMute(String(b.handle ?? "").replace(/^@/, ""), Number(b.hours ?? 24));
    return NextResponse.json({ ok: Boolean(uid) }, { status: uid ? 200 : 404, headers: H });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
