import "server-only";
import { createHash } from "node:crypto";
import { redis } from "@/lib/chat";
import { verifyAppleJws, type AppleNotification, type AppleTx } from "@/lib/appleJws";
import { grantFromApple, getVipSub, saveVipSub } from "@/lib/vipAccess";

/** In-app VIP (StoreKit 2). Off until IAP_ENABLED=1, which is only set once Apple approves the products. */
export const BUNDLE_ID = "app.portaljuice";
export const IAP_PRODUCTS = {
  monthly: process.env.IAP_PRODUCT_MONTHLY || "app.portaljuice.vip.monthly",
  yearly: process.env.IAP_PRODUCT_YEARLY || "app.portaljuice.vip.yearly",
};
export function iapEnabled() {
  return process.env.IAP_ENABLED === "1";
}

/** Stable UUID tied to the account, passed to StoreKit as appAccountToken so Apple's notifications name the account. */
export function appAccountToken(uid: string): string {
  const h = createHash("sha256").update(`pj-aat:${uid}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const K = { aat: (t: string) => `pj:vip:aat:${t}`, apple: (tx: string) => `pj:vip:apple:${tx}`, seen: (id: string) => `pj:vip:apple:note:${id}` };

export async function rememberToken(uid: string) {
  await redis(["SET", K.aat(appAccountToken(uid)), uid]);
}

function okTx(t: AppleTx | null): t is AppleTx {
  if (!t || t.bundleId !== BUNDLE_ID) return false;
  if (!Object.values(IAP_PRODUCTS).includes(t.productId)) return false;
  // Sandbox purchases only count when explicitly allowed (TestFlight / review testing).
  if (t.environment === "Sandbox" && process.env.IAP_ALLOW_SANDBOX !== "1") return false;
  return true;
}

async function apply(uid: string, t: AppleTx, status?: string) {
  const expired = !!t.revocationDate || (t.expiresDate ? t.expiresDate < Date.now() : false);
  await grantFromApple(uid, { originalTransactionId: t.originalTransactionId, productId: t.productId, expiresAt: new Date(t.expiresDate ?? Date.now()).toISOString(), revoked: !!t.revocationDate });
  if (status) {
    const s = await getVipSub(uid);
    if (s) await saveVipSub(uid, { ...s, status: expired && status === "active" ? "expired" : status });
  }
}

/** App sends the signed transaction right after purchase or restore. Must belong to this signed-in account. */
export async function claimTransaction(uid: string, jws: string): Promise<{ ok: true; expiresAt: string | null } | { error: string }> {
  const t = verifyAppleJws<AppleTx>(jws);
  if (!okTx(t)) return { error: "bad-transaction" };
  if (t.appAccountToken && t.appAccountToken !== appAccountToken(uid)) return { error: "other-account" };
  const owner = (await redis(["GET", K.apple(t.originalTransactionId)])) as string | null;
  if (owner && owner !== uid) return { error: "other-account" };
  await apply(uid, t, "active");
  return { ok: true, expiresAt: t.expiresDate ? new Date(t.expiresDate).toISOString() : null };
}

/** App Store Server Notifications v2. */
export async function handleNotification(signedPayload: string): Promise<{ ok: boolean; why?: string }> {
  const n = verifyAppleJws<AppleNotification>(signedPayload);
  if (!n?.data?.signedTransactionInfo) return { ok: !!n, why: n ? "no-tx" : "bad-sig" };
  if (n.data.bundleId && n.data.bundleId !== BUNDLE_ID) return { ok: false, why: "bundle" };
  const fresh = await redis(["SET", K.seen(n.notificationUUID), "1", "NX", "EX", 7 * 86400]);
  if (fresh === null) return { ok: true, why: "dup" };
  const t = verifyAppleJws<AppleTx>(n.data.signedTransactionInfo);
  if (!okTx(t)) return { ok: true, why: "ignored" };
  const uid = ((await redis(["GET", K.apple(t.originalTransactionId)])) as string | null) ?? (t.appAccountToken ? ((await redis(["GET", K.aat(t.appAccountToken)])) as string | null) : null);
  if (!uid) return { ok: true, why: "unknown-account" };
  const type = n.notificationType;
  const status = ["EXPIRED", "REVOKE", "REFUND", "GRACE_PERIOD_EXPIRED"].includes(type) ? "canceled" : type === "DID_FAIL_TO_RENEW" ? (n.subtype === "GRACE_PERIOD" ? "past_due" : "canceled") : "active";
  await apply(uid, t, status);
  console.log(JSON.stringify({ event: "vip.apple.note", type, subtype: n.subtype ?? null, status }));
  return { ok: true };
}
