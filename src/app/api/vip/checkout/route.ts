import { NextResponse } from "next/server";
import { currentUser, rateOk, sameOrigin, SITE } from "@/lib/auth";
import { priceFor, stripe, stripeReady, type Plan } from "@/lib/stripe";
import { getVipSub, vipState } from "@/lib/vipAccess";

export const dynamic = "force-dynamic";

/** Starts Stripe Checkout for VIP. Signed-in accounts only. */
export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  if (!stripeReady()) return NextResponse.json({ error: "VIP opens soon.", waitlist: true }, { status: 503 });
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await rateOk(`pj:vip:co:${u.id}`, 10, 3600))) return NextResponse.json({ error: "Try again later." }, { status: 429 });
  if ((await vipState(u)).vip) return NextResponse.json({ error: "You already have VIP." }, { status: 409 });
  const body = (await req.json().catch(() => ({}))) as { plan?: string };
  const plan: Plan = body.plan === "yearly" ? "yearly" : "monthly";
  const price = priceFor(plan)!;
  const prev = await getVipSub(u.id);
  try {
    const s = await stripe<{ url: string }>("checkout/sessions", {
      mode: "subscription",
      "line_items[0][price]": price,
      "line_items[0][quantity]": 1,
      success_url: `${SITE}/vip?joined=1`,
      cancel_url: `${SITE}/vip`,
      client_reference_id: u.id,
      "metadata[uid]": u.id,
      "subscription_data[metadata][uid]": u.id,
      allow_promotion_codes: true,
      ...(prev?.customerId ? { customer: prev.customerId } : u.email ? { customer_email: u.email } : {}),
    });
    return NextResponse.json({ url: s.url });
  } catch (e) {
    console.log(JSON.stringify({ event: "vip.checkout.error", error: String(e).slice(0, 200) }));
    return NextResponse.json({ error: "Checkout is not available right now." }, { status: 502 });
  }
}
