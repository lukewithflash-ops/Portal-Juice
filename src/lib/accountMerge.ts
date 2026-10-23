import "server-only";
import { redis } from "@/lib/chat";
import { deleteAccount, getUser } from "@/lib/auth";
import { pushChanges, readDoc } from "@/lib/cloud";
import { LIST_COLS, type SyncPush } from "@/lib/syncCore";
import { getVipSub, subActive } from "@/lib/vipAccess";

/**
 * Move-to-the-app: the device was already signed in to its own (usually fresh) account and just joined
 * another one with a code. Fold the old account into the joined one, then retire the old one.
 * Joined account wins on conflicts (handle, singles); picks/notes/follows merge by id (no duplicates).
 * VIP moves over when the joined account has none active, or when the old one is lifetime comp.
 */
export async function mergeAccounts(fromId: string, intoId: string): Promise<{ moved: { items: number; vip: boolean; handle: boolean } }> {
  const moved = { items: 0, vip: false, handle: false };
  if (fromId === intoId) return { moved };
  const from = await getUser(fromId);
  if (!from) return { moved };

  // Cloud picks / notes / follows / settings.
  const [src, dst] = await Promise.all([readDoc(fromId), readDoc(intoId)]);
  const push: SyncPush = { cols: {}, singles: {} };
  for (const col of LIST_COLS) {
    const put = { ...(src.cols[col]?.items ?? {}) };
    moved.items += Object.keys(put).length;
    push.cols[col] = { put, del: {} };
  }
  for (const [k, v] of Object.entries(src.singles ?? {})) {
    const have = dst.singles?.[k as keyof typeof dst.singles];
    if (v && v.v !== null && (!have || have.v === null)) (push.singles as Record<string, unknown>)[k] = v;
  }
  if (moved.items || Object.keys(push.singles ?? {}).length) await pushChanges(intoId, push);

  // VIP (comp included).
  const [sv, dv] = await Promise.all([getVipSub(fromId), getVipSub(intoId)]);
  const take = subActive(sv) && (!subActive(dv) || (sv!.source === "comp" && dv?.source !== "comp"));
  if (take && sv) {
    await redis(["SET", `pj:vip:sub:${intoId}`, JSON.stringify({ ...sv, updatedAt: new Date().toISOString() })]);
    await redis(["SADD", "pj:vip:members", intoId]);
    if (sv.customerId) await redis(["SET", `pj:vip:cust:${sv.customerId}`, intoId]);
    if (sv.appleTx) await redis(["SET", `pj:vip:apple:${sv.appleTx}`, intoId]);
    // Detach from the old account so deleting it below never cancels the moved subscription.
    await redis(["DEL", `pj:vip:sub:${fromId}`]);
    await redis(["SREM", "pj:vip:members", fromId]);
    moved.vip = true;
  }

  // Handle: the joined account keeps its own; take the old one only if the joined account has none
  // or just an auto-made one and the old handle was picked by hand.
  const [sp, dp] = await Promise.all([prof(fromId), prof(intoId)]);
  if (sp && (!dp || (dp.auto && !sp.auto))) {
    await redis(["SET", `pj:hdl:${sp.handle.toLowerCase()}`, intoId]);
    if (dp) await redis(["DEL", `pj:hdl:${dp.handle.toLowerCase()}`]);
    await redis(["SET", `pj:prof:${intoId}`, JSON.stringify({ ...sp, share: dp?.share ?? sp.share })]);
    await redis(["DEL", `pj:prof:${fromId}`]);
    moved.handle = true;
  }

  // Old account still holding its own paid VIP (joined one had VIP too): keep it rather than cancel billing.
  if (subActive(sv) && !take) return { moved };
  await deleteAccount(from);
  return { moved };
}

type P = { handle: string; share: boolean; auto?: boolean };
async function prof(uid: string): Promise<P | null> {
  const raw = (await redis(["GET", `pj:prof:${uid}`])) as string | null;
  try {
    return raw ? (JSON.parse(raw) as P) : null;
  } catch {
    return null;
  }
}
