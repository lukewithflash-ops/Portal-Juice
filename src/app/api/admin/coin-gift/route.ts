import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { redis } from "@/lib/chat";
import { balance, giftWithNote } from "@/lib/coins";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function authed(req: Request): boolean {
  const want = process.env.PJ_ADMIN_SECRET || "";
  const got = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (want.length < 24 || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

async function view(uid: string) {
  const [bal, log, gift] = await Promise.all([balance(uid), redis(["LRANGE", `pj:coin:log:${uid}`, 0, 4]), redis(["GET", `pj:coin:gift:${uid}`])]);
  return { balance: bal, recent: ((log as string[] | null) ?? []).map((r) => JSON.parse(r)), popupPending: !!gift };
}

/** Owner-only: a one-time coin gift with a note (ledger row + popup). dry → read balance/history/popup state only. */
export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { uid?: string; coins?: number; from?: string; note?: string; key?: string; dry?: boolean };
  const uid = String(b.uid || "").trim();
  if (!uid || !(await getUser(uid).catch(() => null))) return NextResponse.json({ error: "No such account." }, { status: 400 });
  if (b.dry) return NextResponse.json({ uid, ...(await view(uid)) }, { headers: { "cache-control": "no-store" } });
  if (!b.key) return NextResponse.json({ error: "key required" }, { status: 400 });
  const r = await giftWithNote(uid, Number(b.coins), String(b.from || ""), String(b.note || ""), String(b.key));
  return NextResponse.json({ uid, result: r, ...(await view(uid)) }, { headers: { "cache-control": "no-store" } });
}
