"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";

const MAX_AUTO = 3;

/**
 * Shown when ESPN's feed hiccups on a game page. Retries in place (no bounce to /games),
 * a few times on its own, then hands the user a button.
 */
export default function GameRetry({ reset }: { reset: () => void }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  const retry = () => {
    setTries((n) => n + 1);
    startTransition(() => {
      router.refresh();
      reset();
    });
  };
  useEffect(() => {
    if (tries >= MAX_AUTO) return;
    const t = setTimeout(retry, 1500 + tries * 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tries]);
  return (
    <div className="foil-tile mx-auto mt-10 max-w-sm p-6 text-center" role="status" aria-live="polite">
      <span className="portal-ring mx-auto block" aria-hidden style={{ width: "2.6rem", height: "2.6rem" }} />
      <p className="mt-4 text-base font-black text-[color:var(--flat)]">The live feed blinked.</p>
      <p className="mt-1 text-sm text-zinc-400">{tries < MAX_AUTO ? "Reconnecting to ESPN…" : "ESPN is slow right now."}</p>
      <div className="mt-4 flex justify-center gap-2">
        <button type="button" onClick={retry} className="rounded-lg border border-[color:var(--plus)]/60 px-3 py-1.5 text-xs font-black text-[color:var(--plus)]">
          Try again
        </button>
        <Link href="/games" className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-black text-white">
          All games
        </Link>
      </div>
    </div>
  );
}
