"use client";
import { useEffect, useSyncExternalStore } from "react";
import { getAccount, getServerAccount, subscribeAccount } from "@/lib/syncClient";

export type VipMe = { loaded: boolean; vip: boolean; source: string | null; plan: string | null; periodEnd: string | null; manage: boolean; earlyAccess: boolean; signedIn: boolean; stripeReady: boolean };

const EMPTY: VipMe = { loaded: false, vip: false, source: null, plan: null, periodEnd: null, manage: false, earlyAccess: false, signedIn: false, stripeReady: false };
let me: VipMe = EMPTY;
let forUid: string | null | undefined;
let inflight: Promise<void> | null = null;
const ls = new Set<() => void>();

export async function refreshVip(): Promise<void> {
  if (inflight) return inflight;
  inflight = fetch("/api/vip/me", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (j) {
        me = { ...EMPTY, ...j, loaded: true };
        ls.forEach((l) => l());
      }
    })
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

const sub = (cb: () => void) => {
  ls.add(cb);
  return () => ls.delete(cb);
};

/** VIP status for this account. Refetches when the signed-in account changes. */
export function useVip(): VipMe {
  const a = useSyncExternalStore(subscribeAccount, getAccount, getServerAccount);
  const v = useSyncExternalStore(sub, () => me, () => EMPTY);
  const uid = a.ready ? a.user?.id ?? null : undefined;
  useEffect(() => {
    if (uid === undefined || uid === forUid) return;
    forUid = uid;
    refreshVip();
  }, [uid]);
  return v;
}
