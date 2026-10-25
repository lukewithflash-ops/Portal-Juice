"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Gift = { from: string; note: string; coins: number; ts: number };

/** A gift note shows once on the next open, then lives on in coin history. In dev, ?giftPreview=1 renders a sample (nothing is saved). */
export default function GiftNotePopup() {
  const [g, setG] = useState<Gift | null>(null);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    const t = setTimeout(async () => {
      const q = new URLSearchParams(location.search);
      if (process.env.NODE_ENV !== "production" && q.get("giftPreview") === "1") {
        setPreview(true);
        setG({ from: q.get("from") || "portaljuice", note: q.get("note") || "Thanks for being here.", coins: Number(q.get("coins")) || 100, ts: Date.now() });
        return;
      }
      try {
        const r = await fetch("/api/coins", { cache: "no-store" });
        const j = (await r.json()) as { gift?: Gift | null };
        if (j.gift?.note) setG(j.gift);
      } catch {}
    }, 900);
    return () => clearTimeout(t);
  }, []);
  if (!g) return null;
  const close = () => {
    setG(null);
    if (!preview) fetch("/api/coins", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "gift-seen" }) }).catch(() => null);
  };
  return createPortal(
    <div className="welcome fixed inset-0 z-[210] flex items-center justify-center bg-black/75 p-5 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Gift" data-testid="gift-note">
      <div className="gift-panel welcome-panel relative w-full max-w-sm overflow-hidden rounded-3xl p-6 text-center">
        <div className="welcome-burst" aria-hidden>{Array.from({ length: 16 }, (_, k) => <span key={k} style={{ ["--a" as string]: `${k * 22.5}deg`, animationDelay: `${(k % 4) * 60}ms` } as React.CSSProperties} />)}</div>
        <div className="welcome-icon mx-auto mb-3 grid h-20 w-20 place-items-center text-[40px]">🎁</div>
        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-pink-300">A gift for you</p>
        <p className="tabular mt-2 text-4xl font-black text-[color:var(--plus)] drop-shadow-[0_0_14px_rgba(57,255,136,.6)]">+{g.coins.toLocaleString()} coins</p>
        <p className="mt-4 text-[17px] font-bold leading-snug text-white">“{g.note}”</p>
        <p className="mt-2 text-sm font-black text-purple-200">from @{g.from}</p>
        <button type="button" onClick={close} className="press mt-6 w-full rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 py-3 text-base font-black text-white shadow-[0_0_24px_rgba(192,38,255,.6)]">Thank you!</button>
        <p className="mt-2 text-[11px] text-zinc-500">Saved in your coin history.</p>
      </div>
    </div>,
    document.body
  );
}
