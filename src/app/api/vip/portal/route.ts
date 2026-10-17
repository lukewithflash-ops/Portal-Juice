import { NextResponse } from "next/server";
import { currentUser, sameOrigin, SITE } from "@/lib/auth";
import { stripe, stripeReady } from "@/lib/stripe";
import { getVipSub } from "@/lib/vipAccess";

export const dynamic = "force-dynamic";

/** Stripe Customer Portal: change plan, update payment method, cancel. */
export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const sub = await getVipSub(u.id);
  if (!stripeReady() || !sub?.customerId) return NextResponse.json({ error: "No web subscription on this account." }, { status: 404 });
  try {
    const s = await stripe<{ url: string }>("billing_portal/sessions", { customer: sub.customerId, return_url: `${SITE}/vip` });
    return NextResponse.json({ url: s.url });
  } catch (e) {
    console.log(JSON.stringify({ event: "vip.portal.error", error: String(e).slice(0, 200) }));
    return NextResponse.json({ error: "Billing is not available right now." }, { status: 502 });
  }
}
