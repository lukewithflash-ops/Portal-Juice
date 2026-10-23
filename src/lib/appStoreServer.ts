import "server-only";
import { createSign } from "node:crypto";

/**
 * App Store Server API (shared by coin packs and, later, VIP subscriptions). Needs an In-App Purchase key from
 * App Store Connect → Users and Access → Integrations → In-App Purchase: APPSTORE_IAP_KEY_ID, APPSTORE_IAP_ISSUER_ID,
 * APPSTORE_IAP_KEY_P8 (PEM). We ask Apple for the transaction by id over TLS, so the answer is Apple's, not the device's.
 */
export const BUNDLE_ID = "app.portaljuice";

export function appStoreReady() {
  return !!(process.env.APPSTORE_IAP_KEY_ID && process.env.APPSTORE_IAP_ISSUER_ID && process.env.APPSTORE_IAP_KEY_P8);
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function token(): string {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "ES256", kid: process.env.APPSTORE_IAP_KEY_ID, typ: "JWT" }));
  const body = b64u(JSON.stringify({ iss: process.env.APPSTORE_IAP_ISSUER_ID, iat: now, exp: now + 600, aud: "appstoreconnect-v1", bid: BUNDLE_ID }));
  const pem = String(process.env.APPSTORE_IAP_KEY_P8).replace(/\\n/g, "\n");
  const sig = createSign("SHA256").update(`${head}.${body}`).sign({ key: pem, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64u(sig)}`;
}

export type AppleTxn = { transactionId: string; originalTransactionId: string; productId: string; bundleId: string; type: string; revocationDate?: number; appAccountToken?: string; environment: string; expiresDate?: number };

/** Looks a transaction up in production, then sandbox (TestFlight). Null when Apple doesn't know it. */
export async function lookupTransaction(id: string): Promise<AppleTxn | null> {
  if (!/^\d{1,30}$/.test(id)) return null;
  for (const host of ["https://api.storekit.itunes.apple.com", "https://api.storekit-sandbox.itunes.apple.com"]) {
    const r = await fetch(`${host}/inApps/v1/transactions/${id}`, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" });
    if (r.status === 404) continue;
    if (!r.ok) throw new Error(`appstore ${r.status}`);
    const j = (await r.json()) as { signedTransactionInfo?: string };
    const payload = j.signedTransactionInfo?.split(".")[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as AppleTxn;
  }
  return null;
}
