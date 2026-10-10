"use client";

import { useEffect, useRef, useState } from "react";
import { fightFx, golfFx, tennisFx } from "@/lib/matchFx";

const FX = { tennis: tennisFx, fight: fightFx, golf: golfFx };

/**
 * Neon flash for head-to-head sports when the score changes between refreshes.
 * Tennis: a new set or game. UFC: a new round or the finish. Golf rows use `kind="golf"`.
 */
export default function MatchFx({ sig, kind, children, small = false }: { sig: string; kind: keyof typeof FX; children: React.ReactNode; small?: boolean }) {
  const label = FX[kind];
  const prev = useRef(sig);
  const [flash, setFlash] = useState<{ n: number; text: string } | null>(null);
  useEffect(() => {
    if (prev.current === sig) return;
    const text = label(prev.current, sig);
    prev.current = sig;
    if (!text) return;
    const t = setTimeout(() => setFlash((f) => ({ n: (f?.n ?? 0) + 1, text })), 0);
    const off = setTimeout(() => setFlash(null), 1400);
    return () => (clearTimeout(t), clearTimeout(off));
  }, [sig, label]);
  return (
    <div key={flash?.n ?? 0} className={"relative rounded-2xl " + (flash ? "match-flash" : "")}>
      {children}
      {flash ? (
        <div className="ot-intro rounded-2xl" aria-live="polite">
          <span style={{ fontSize: small ? "0.7rem" : "1.6rem" }}>{flash.text}</span>
        </div>
      ) : null}
    </div>
  );
}
