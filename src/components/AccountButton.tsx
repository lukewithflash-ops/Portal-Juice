"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { getAccount, getServerAccount, subscribeAccount } from "@/lib/syncClient";

/** Header: your initial when signed in (with a sync dot), "Sign in" when not. */
export default function AccountButton() {
  const a = useSyncExternalStore(subscribeAccount, getAccount, getServerAccount);
  if (!a.ready) return <span className="h-6 w-6 shrink-0" aria-hidden />;
  if (!a.user) {
    return (
      <Link href="/account" className="acct-signin shrink-0 rounded-lg px-1.5 py-1 text-[11px] font-black text-white" data-testid="account-button">
        Sign in
      </Link>
    );
  }
  const label = a.user.name || a.user.email || "Private account";
  const initial = (a.user.name || a.user.email || "P").trim()[0]?.toUpperCase() ?? "P";
  return (
    <Link href="/account" className="acct-avatar relative shrink-0" aria-label={`Account: ${label}`} data-testid="account-button" data-signed="1">
      {a.user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.user.image} alt="" width={26} height={26} className="h-[26px] w-[26px] rounded-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[12px] font-black text-white">{initial}</span>
      )}
      <span className={"acct-dot " + (a.status === "error" || a.status === "offline" ? "acct-dot-warn" : a.status === "syncing" ? "acct-dot-sync" : "")} aria-hidden />
    </Link>
  );
}
