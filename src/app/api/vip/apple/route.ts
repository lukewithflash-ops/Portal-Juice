import { NextResponse } from "next/server";
import { currentUser, sameOrigin } from "@/lib/auth";
import { appAccountToken, claimTransaction, iapEnabled, IAP_PRODUCTS, rememberToken } from "@/lib/appleIap";

export const dynamic = "force-dynamic";

/** In-app VIP config for the signed-in account: product ids and the appAccountToken to pass to StoreKit. */
export async function GET() {
  if (!iapEnabled()) return NextResponse.json({ enabled: false });
  const u = await currentUser();
  if (!u) return NextResponse.json({ enabled: true, signedIn: false, products: IAP_PRODUCTS });
  await rememberToken(u.id);
  return NextResponse.json({ enabled: true, signedIn: true, products: IAP_PRODUCTS, appAccountToken: appAccountToken(u.id) });
}

/** App posts { jws } (StoreKit 2 jwsRepresentation) after a purchase or restore. Verified against Apple's root. */
export async function POST(req: Request) {
  if (!iapEnabled()) return NextResponse.json({ error: "In-app subscription is not switched on yet." }, { status: 501 });
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "bad-origin" }, { status: 403 });
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "sign-in" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { jws?: unknown } | null;
  if (typeof b?.jws !== "string" || b.jws.length > 20000) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  const r = await claimTransaction(u.id, b.jws);
  return NextResponse.json(r, { status: "error" in r ? 400 : 200 });
}
