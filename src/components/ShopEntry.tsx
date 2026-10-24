"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Big obvious entry to the shop + free coin challenges. Hidden when coins are off. */
export default function ShopEntry() {
  const [on, setOn] = useState<null | { bal: number | null; ready: number }>(null);
  useEffect(() => {
    fetch("/api/coins", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.enabled) return;
        const ready = ((j.challenges ?? []) as { done: boolean; claimed: boolean }[]).filter((c) => c.done && !c.claimed).length;
        setOn({ bal: j.signedIn ? Number(j.balance) || 0 : null, ready });
      })
      .catch(() => {});
  }, []);
  if (!on) return null;
  return (
    <Link href="/coins" data-testid="shop-entry" className="shop-entry press relative flex items-center gap-3 overflow-hidden rounded-2xl p-3.5">
      <span className="shop-entry-orb" aria-hidden>🛍️</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-black text-white">Shop & Style</span>
        <span className="block text-[12px] text-zinc-300">New city color sets, animated emotes, jerseys and tags</span>
      </span>
      {on.ready ? <span className="rounded-full bg-[color:var(--portal-green)] px-2 py-0.5 text-[11px] font-black text-black">{on.ready} to claim</span> : on.bal !== null ? <span className="tabular text-[13px] font-black text-[color:var(--gold)]">{on.bal.toLocaleString()} 🪙</span> : null}
    </Link>
  );
}
