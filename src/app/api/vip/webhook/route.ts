import { NextResponse } from "next/server";
import { planOfPrice, stripe, verifyStripeSignature } from "@/lib/stripe";
import { saveVipSub, uidForCustomer } from "@/lib/vipAccess";

export const dynamic = "force-dynamic";

type Sub = {
  id: string;
  customer: string;
  status: string;
  metadata?: Record<string, string>;
  current_period_end?: number;
  items?: { data?: { price?: { id?: string }; current_period_end?: number }[] };
};

async function store(sub: Sub, uidHint: string | null) {
  const uid = uidHint || sub.metadata?.uid || (await uidForCustomer(sub.customer));
  if (!uid) return false;
  const item = sub.items?.data?.[0];
  const end = sub.current_period_end ?? item?.current_period_end ?? null;
  await saveVipSub(uid, {
    source: "stripe",
    status: sub.status,
    plan: planOfPrice(item?.price?.id),
    periodEnd: end ? new Date(end * 1000).toISOString() : null,
    customerId: sub.customer,
    subscriptionId: sub.id,
  });
  return true;
}

/** Stripe webhook: keeps each account's VIP status in sync. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret)) return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  const ev = JSON.parse(payload) as { id: string; type: string; data: { object: Record<string, unknown> } };
  const o = ev.data.object;
  let ok = true;
  try {
    if (ev.type === "checkout.session.completed" && o.mode === "subscription" && typeof o.subscription === "string") {
      const sub = await stripe<Sub>(`subscriptions/${o.subscription}`);
      ok = await store(sub, (o.client_reference_id as string) || null);
    } else if (ev.type.startsWith("customer.subscription.")) {
      ok = await store(o as unknown as Sub, null);
    }
  } catch (e) {
    console.log(JSON.stringify({ event: "vip.webhook.error", type: ev.type, error: String(e).slice(0, 200) }));
    return NextResponse.json({ error: "Retry." }, { status: 500 });
  }
  console.log(JSON.stringify({ event: "vip.webhook", type: ev.type, id: ev.id, ok }));
  return NextResponse.json({ received: true });
}
