"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Header coin balance; tap to open the shop. Hidden when coins are off or signed out. */
export default function CoinPill() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch("/api/coins", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => !stop && setN(j?.enabled && j?.signedIn ? Number(j.balance) || 0 : null))
        .catch(() => {});
    load();
    window.addEventListener("pj-look", load);
    window.addEventListener("pj-coins", load);
    return () => {
      stop = true;
      window.removeEventListener("pj-look", load);
      window.removeEventListener("pj-coins", load);
    };
  }, []);
  if (n === null) return null;
  return (
    <Link href="/coins" data-testid="coin-pill" aria-label={`${n} coins. Open the shop`} className="coin-pill press tabular inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-black text-[color:var(--gold)]">
      <span className="coin-dot" aria-hidden />
      {n.toLocaleString()}
    </Link>
  );
}
