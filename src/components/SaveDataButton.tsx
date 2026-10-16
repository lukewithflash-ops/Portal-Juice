"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { getAccount, getServerAccount, subscribeAccount, syncNow } from "@/lib/syncClient";

/** "Save my data": signed in, saves now; signed out, goes to sign-in and comes back. */
export default function SaveDataButton({ back }: { back: string }) {
  const a = useSyncExternalStore(subscribeAccount, getAccount, getServerAccount);
  const [msg, setMsg] = useState<string | null>(null);
  if (!a.ready) return null;
  if (!a.user) {
    return (
      <Link href={`/account?next=${encodeURIComponent(back)}`} className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--plus)]/50 px-2.5 py-1 text-[12px] font-black text-white" data-testid="save-data-link">
        ☁ Save my data · Sign in
      </Link>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={async () => {
          await syncNow({ full: true });
          setMsg(getAccount().status === "ok" ? "Saved" : "Will retry");
          setTimeout(() => setMsg(null), 2200);
        }}
        className="rounded-lg border border-[color:var(--plus)]/50 px-2.5 py-1 text-[12px] font-black text-white"
        data-testid="save-data-inline"
      >
        ☁ Save my data
      </button>
      <span className="text-[11px] text-zinc-500">{msg ?? (a.status === "ok" ? "Synced" : a.status === "syncing" ? "Syncing…" : "")}</span>
    </span>
  );
}
