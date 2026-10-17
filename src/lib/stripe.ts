import "server-only";

/**
 * Stripe over plain REST (no SDK). Keys only from env:
 * STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY.
 */
export type Plan = "monthly" | "yearly";

export function stripeReady(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_MONTHLY && process.env.STRIPE_PRICE_YEARLY && process.env.STRIPE_WEBHOOK_SECRET);
}

export function priceFor(plan: Plan): string | null {
  return (plan === "yearly" ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY) || null;
}

export function planOfPrice(price: string | null | undefined): Plan | null {
  if (!price) return null;
  if (price === process.env.STRIPE_PRICE_YEARLY) return "yearly";
  if (price === process.env.STRIPE_PRICE_MONTHLY) return "monthly";
  return null;
}

function form(obj: Record<string, string | number | boolean | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) p.append(k, String(v));
  return p.toString();
}

export async function stripe<T = Record<string, unknown>>(path: string, body?: Record<string, string | number | boolean | undefined>, method?: "GET" | "POST" | "DELETE"): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("stripe-not-configured");
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: method ?? (body ? "POST" : "GET"),
    headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded", "stripe-version": "2024-06-20" },
    body: body ? form(body) : undefined,
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(`stripe ${r.status}: ${j?.error?.message ?? "error"}`);
  return j;
}

export { verifyStripeSignature } from "@/lib/stripeSig";
