"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const KEY = "pj-welcome-v1";
const SLIDES = [
  { icon: "🌀", title: "Welcome to Portal Juice", body: "Every live game, drawn play by play in neon. Real numbers from the feed, nothing made up." },
  { icon: "📈", title: "Track your picks live", body: "Log a pick and watch it fill up in real time, with run alerts and clutch moments. Lines from DraftKings." },
  { icon: "💬", title: "Chat in every game", body: "Animated emotes, squads, Game Day Pick-em and call-the-next-score. Earn coins for style." },
  { icon: "🚀", title: "It's Launch Week", body: "Grab the limited Launch Week tag plus 50 coins free in Coins. Ends Nov 8." },
];

/** First open only: short onboarding with a portal burst. Portaled to body so no transformed parent traps it. */
export default function LaunchWelcome() {
  const [i, setI] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (!localStorage.getItem(KEY) && !navigator.webdriver) setI(0);
      } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, []);
  if (i === null) return null;
  const done = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setI(null);
  };
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;
  return createPortal(
    <div className="welcome fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-4 pb-[calc(env(safe-area-inset-bottom)+20px)] backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Welcome" data-testid="welcome">
      <div className="welcome-card relative w-full max-w-md overflow-hidden rounded-3xl p-6 text-center">
        <div className="welcome-burst" aria-hidden>{Array.from({ length: 16 }, (_, k) => <span key={k} style={{ ["--a" as string]: `${k * 22.5}deg`, animationDelay: `${(k % 4) * 60}ms` } as React.CSSProperties} />)}</div>
        <div key={i} className="welcome-icon portal-ring mx-auto mb-3 grid h-20 w-20 place-items-center text-[38px]">{s.icon}</div>
        <h2 className="wordmark text-[24px] font-black">{s.title}</h2>
        <p className="mt-2 text-[15px] leading-snug text-zinc-300">{s.body}</p>
        <div className="mt-4 flex justify-center gap-1.5" aria-hidden>{SLIDES.map((_, k) => <span key={k} className="h-1.5 w-5 rounded-full" style={{ background: k === i ? "var(--portal-green)" : "rgba(255,255,255,.2)" }} />)}</div>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={done} className="press flex-1 rounded-2xl border border-white/15 py-3 text-[14px] font-bold text-zinc-300">Skip</button>
          {last ? (
            <Link href="/coins" onClick={done} className="press flex-[2] rounded-2xl py-3 text-[15px] font-black text-black" style={{ background: "linear-gradient(135deg,#39ff14,#c026ff)" }}>Claim Launch Week drop</Link>
          ) : (
            <button type="button" onClick={() => setI(i + 1)} className="press flex-[2] rounded-2xl py-3 text-[15px] font-black text-black" style={{ background: "linear-gradient(135deg,#39ff14,#22d3ee)" }}>Next</button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
