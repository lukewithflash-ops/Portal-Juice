import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { currentUser } from "@/lib/auth";
import { isOwner } from "@/lib/vipAccess";
import { runTeamData, snapMoney } from "@/lib/teamData";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const eq = (a: string, b: string) => a.length === b.length && a.length >= 16 && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Admin: PJ_ADMIN_SECRET bearer, or a signed-in owner. Fails closed. */
async function allowed(req: Request): Promise<boolean> {
  const got = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (got && (eq(got, process.env.CRON_SECRET || "") || eq(got, process.env.PJ_ADMIN_SECRET || ""))) return true;
  return isOwner(await currentUser().catch(() => null));
}

/** Cron: pull new ESPN finals + DraftKings closing lines, recompute VIP Data. A Redis lock keeps one run at a time. */
export async function GET(req: Request) {
  if (!(await allowed(req))) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const lg = new URL(req.url).searchParams.get("lg");
  const money = await snapMoney().catch((e) => ({ error: String(e) }));
  const r = await runTeamData({ budgetMs: 240_000, leagues: lg ? [lg] : undefined }).catch((e) => ({ ran: false, why: String(e) }));
  return NextResponse.json({ ...r, money }, { headers: { "cache-control": "no-store" } });
}
