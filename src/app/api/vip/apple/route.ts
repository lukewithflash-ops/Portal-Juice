import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Apple in-app subscription hook (StoreKit 2 via Capacitor). Not live yet: needs the App Store Connect
 * subscription products, the App Store Server API key (issuer id, key id, .p8) to verify the signed
 * transaction, and App Store Server Notifications V2 pointed here. On a verified transaction this calls
 * grantFromApple(uid, ...) in vipAccess.
 */
export async function POST() {
  return NextResponse.json({ error: "In-app subscription is not set up yet." }, { status: 501 });
}
