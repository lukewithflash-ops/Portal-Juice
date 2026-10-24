import { NextResponse } from "next/server";
import { currentUser, sameOrigin } from "@/lib/auth";
import { coinsOn, creditPurchase } from "@/lib/coins";
import { appStoreReady, BUNDLE_ID, lookupTransaction } from "@/lib/appStoreServer";
import { COIN_PACKS } from "@/lib/coinsCore";

export const dynamic = "force-dynamic";

/** POST { transactionId } after a StoreKit consumable purchase. Verified with Apple, credited exactly once. */
export async function POST(req: Request) {
  if (!coinsOn()) return NextResponse.json({ enabled: false }, { status: 404 });
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign in first so the coins land on your account." }, { status: 401 });
  if (!appStoreReady()) return NextResponse.json({ error: "Coin purchases aren't set up yet." }, { status: 501 });
  const b = (await req.json().catch(() => ({}))) as { transactionId?: string };
  const t = await lookupTransaction(String(b.transactionId ?? "")).catch(() => null);
  // TestFlight/review purchases are Sandbox: only credit them when IAP_ALLOW_SANDBOX=1.
  if (t && t.environment === "Sandbox" && process.env.IAP_ALLOW_SANDBOX !== "1") {
    return NextResponse.json({ error: "Test purchases aren't accepted here." }, { status: 400 });
  }
  if (!t || t.bundleId !== BUNDLE_ID || t.type !== "Consumable" || t.revocationDate || !COIN_PACKS.some((p) => p.id === t.productId)) {
    return NextResponse.json({ error: "Apple couldn't confirm that purchase." }, { status: 400 });
  }
  const r = await creditPurchase(u.id, t.transactionId, t.productId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}
