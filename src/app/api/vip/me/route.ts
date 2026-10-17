import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { stripeReady } from "@/lib/stripe";
import { vipState } from "@/lib/vipAccess";

export const dynamic = "force-dynamic";

/** Small: is this account VIP. Drives the header badge and the paywalls. */
export async function GET() {
  const u = await currentUser();
  const s = await vipState(u);
  return NextResponse.json({ vip: s.vip, source: s.source, plan: s.plan, periodEnd: s.periodEnd, manage: s.manage, earlyAccess: s.earlyAccess, signedIn: !!u, stripeReady: stripeReady() }, { headers: { "cache-control": "private, no-store" } });
}
