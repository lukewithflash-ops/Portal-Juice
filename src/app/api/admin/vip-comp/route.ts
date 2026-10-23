import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { redis } from "@/lib/chat";
import { getUser } from "@/lib/auth";
import { grantComp, vipState } from "@/lib/vipAccess";

export const dynamic = "force-dynamic";

function authed(req: Request): boolean {
  const want = process.env.PJ_ADMIN_SECRET || "";
  const got = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (want.length < 24 || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** Owner-only: look up accounts by @handle and (unless dry) grant lifetime comp VIP. */
export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { handles?: string[]; dry?: boolean };
  const out: Record<string, unknown> = {};
  for (const raw of body.handles ?? []) {
    const h = String(raw).replace(/^@/, "").trim().toLowerCase();
    const uid = (await redis(["GET", `pj:hdl:${h}`])) as string | null;
    if (!uid) { out[h] = { match: null }; continue; }
    const u = await getUser(uid).catch(() => null);
    if (!body.dry) await grantComp(uid);
    const st = u ? await vipState(u) : null;
    out[h] = { uid, providers: u?.providers ?? null, hasEmail: !!u?.email, granted: !body.dry, vip: st?.vip ?? null, source: st?.source ?? null };
  }
  return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
}
