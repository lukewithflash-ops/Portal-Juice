import "server-only";
import { chatEnabled, redis } from "@/lib/chat";
import { getUser, type User } from "@/lib/auth";
import { stripe, stripeReady } from "@/lib/stripe";

/**
 * Who has VIP. One record per account in Upstash: pj:vip:sub:<uid>.
 * Sources: Stripe (web), Apple (App Store, wired after approval), owner (env allowlist, for testing).
 * There is no public way to grant it.
 */
export type VipSource = "stripe" | "apple" | "owner";
export type VipSub = {
  source: VipSource;
  status: string;
  plan: "monthly" | "yearly" | null;
  /** ISO end of the paid period. */
  periodEnd: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  /** Apple: original transaction id. */
  appleTx?: string | null;
  since: string;
  updatedAt: string;
};

const K = {
  sub: (u: string) => `pj:vip:sub:${u}`,
  cust: (c: string) => `pj:vip:cust:${c}`,
  apple: (tx: string) => `pj:vip:apple:${tx}`,
  wait: "pj:vip:wait",
  members: "pj:vip:members",
};

/** Comma-separated owner emails from env OWNER_EMAILS (or OWNER / VIP_OWNER_EMAILS). */
export function ownerEmails(): string[] {
  return (process.env.OWNER_EMAILS || process.env.VIP_OWNER_EMAILS || process.env.OWNER || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"));
}

export function isOwner(u: Pick<User, "email"> | null): boolean {
  return !!u?.email && ownerEmails().includes(u.email.toLowerCase());
}

export async function getVipSub(uid: string): Promise<VipSub | null> {
  if (!chatEnabled()) return null;
  const raw = (await redis(["GET", K.sub(uid)])) as string | null;
  try {
    return raw ? (JSON.parse(raw) as VipSub) : null;
  } catch {
    return null;
  }
}

export function subActive(s: VipSub | null, now = Date.now()): boolean {
  if (!s) return false;
  if (!["active", "trialing", "past_due"].includes(s.status)) return false;
  return !s.periodEnd || Date.parse(s.periodEnd) + 3 * 86400000 > now;
}

export type VipState = { vip: boolean; source: VipSource | null; plan: VipSub["plan"]; periodEnd: string | null; status: string | null; manage: boolean; earlyAccess: boolean };

export async function vipState(u: User | null): Promise<VipState> {
  if (!u) return { vip: false, source: null, plan: null, periodEnd: null, status: null, manage: false, earlyAccess: false };
  if (isOwner(u)) return { vip: true, source: "owner", plan: null, periodEnd: null, status: "active", manage: false, earlyAccess: true };
  const s = await getVipSub(u.id);
  const vip = subActive(s);
  return { vip, source: s?.source ?? null, plan: s?.plan ?? null, periodEnd: s?.periodEnd ?? null, status: s?.status ?? null, manage: !!s?.customerId && s.source === "stripe", earlyAccess: vip };
}

export async function isVipUid(uid: string): Promise<boolean> {
  const s = await getVipSub(uid);
  if (subActive(s)) return true;
  const u = await getUser(uid).catch(() => null);
  return isOwner(u);
}

export async function saveVipSub(uid: string, s: Omit<VipSub, "since" | "updatedAt">): Promise<void> {
  const prev = await getVipSub(uid);
  const row: VipSub = { ...s, since: prev?.since ?? new Date().toISOString(), updatedAt: new Date().toISOString() };
  await redis(["SET", K.sub(uid), JSON.stringify(row)]);
  if (s.customerId) await redis(["SET", K.cust(s.customerId), uid]);
  if (subActive(row)) await redis(["SADD", K.members, uid]);
  else await redis(["SREM", K.members, uid]);
}

export async function uidForCustomer(customerId: string): Promise<string | null> {
  return ((await redis(["GET", K.cust(customerId)])) as string | null) ?? null;
}

/** Account ids with active paid VIP (owners are added at check time). */
export async function vipMembers(): Promise<string[]> {
  return ((await redis(["SMEMBERS", K.members])) as string[] | null) ?? [];
}

/**
 * Apple hook (StoreKit 2 via Capacitor). After App Store approval, the app sends the signed transaction;
 * the server must verify it with the App Store Server API before calling this. Not reachable until then.
 */
export async function grantFromApple(uid: string, t: { originalTransactionId: string; productId: string; expiresAt: string; revoked?: boolean }): Promise<void> {
  const plan = /year/i.test(t.productId) ? "yearly" : "monthly";
  await redis(["SET", K.apple(t.originalTransactionId), uid]);
  await saveVipSub(uid, { source: "apple", status: t.revoked ? "canceled" : "active", plan, periodEnd: t.expiresAt, appleTx: t.originalTransactionId, customerId: null, subscriptionId: null });
}

export async function joinWaitlist(entry: { uid: string | null; email: string | null }): Promise<number> {
  const key = entry.uid ? `uid:${entry.uid}` : `email:${entry.email}`;
  await redis(["HSET", K.wait, key, JSON.stringify({ ...entry, at: new Date().toISOString() })]);
  return Number(await redis(["HLEN", K.wait])) || 0;
}

export async function onWaitlist(uid: string | null, email: string | null): Promise<boolean> {
  if (uid && Number(await redis(["HEXISTS", K.wait, `uid:${uid}`])) === 1) return true;
  if (email && Number(await redis(["HEXISTS", K.wait, `email:${email}`])) === 1) return true;
  return false;
}

/** Account deleted: stop the web subscription so a deleted account is never billed again, then clear VIP. */
export async function dropVip(uid: string): Promise<void> {
  const s = await getVipSub(uid);
  if (s?.source === "stripe" && s.subscriptionId && subActive(s) && stripeReady()) {
    await stripe(`subscriptions/${s.subscriptionId}`, undefined, "DELETE").catch((e) => console.log(JSON.stringify({ event: "vip.cancel.error", error: String(e).slice(0, 200) })));
  }
  if (s?.customerId) await redis(["DEL", K.cust(s.customerId)]);
  await redis(["DEL", K.sub(uid)]);
  await redis(["SREM", K.members, uid]);
  await redis(["HDEL", K.wait, `uid:${uid}`]);
}
