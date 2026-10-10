"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { fmtSplit, statRecord, statTip, styleReport, tipDeck } from "@/lib/tips";
import type { Pick } from "@/lib/types";

/** Rotating tip: tap or swipe for the next one. Starts on a random tip. */
export function TipDeck({ picks }: { picks: Pick[] }) {
  const deck = useMemo(() => tipDeck(picks), [picks]);
  const [i, setI] = useState(() => Math.floor(Math.random() * 1000));
  const [x0, setX0] = useState<number | null>(null);
  const tip = deck[i % deck.length];
  const next = (d = 1) => setI((n) => n + d + deck.length);
  return (
    <section
      className="foil-tile relative cursor-pointer select-none p-4 sm:col-span-2"
      onClick={() => next()}
      onTouchStart={(e) => setX0(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (x0 == null) return;
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) next(dx < 0 ? 1 : -1);
        setX0(null);
      }}
      aria-live="polite"
    >
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em]">
        <span className={tip.mine ? "text-[color:var(--gold)]" : "text-purple-200/80"}>💡 {tip.mine ? "Your tip" : "Tip"}</span>
        <span className="text-zinc-500">Tap or swipe ›</span>
      </div>
      <p key={i} className="font-display play-in mt-1.5 text-[15px] font-bold leading-snug tracking-wide text-white">{tip.text}</p>
    </section>
  );
}

export function StyleSection({ picks }: { picks: Pick[] }) {
  const s = useMemo(() => styleReport(picks), [picks]);
  if (!s.enough) {
    return (
      <section className="foil-tile p-4 sm:col-span-2">
        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200/80">Your pick style</h2>
        <p className="mt-1 text-sm text-zinc-400">Settle {s.need} more pick{s.need === 1 ? "" : "s"} (wins or losses) to see your style.</p>
      </section>
    );
  }
  const ctx = [`Style: ${s.summary}`, `Strengths: ${s.pros.map(fmtSplit).join("; ") || "none yet"}`, `Weak spots: ${s.cons.map(fmtSplit).join("; ") || "none yet"}`, ...s.warnings].join(". ");
  return (
    <section className="foil-tile p-4 sm:col-span-2">
      <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200/80">Your pick style</h2>
      <p className="font-display mt-1 text-[15px] font-bold tracking-wide text-white">{s.summary}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--plus)]">Pros</div>
          {s.pros.length ? (
            <ul className="mt-1 space-y-1 text-[13px] text-zinc-100">
              {s.pros.map((p) => <li key={p.label}>▲ {fmtSplit(p)}</li>)}
            </ul>
          ) : (
            <p className="mt-1 text-[12px] text-zinc-500">No split above your average yet.</p>
          )}
        </div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--minus)]">Cons</div>
          {s.cons.length ? (
            <ul className="mt-1 space-y-1 text-[13px] text-zinc-100">
              {s.cons.map((p) => <li key={p.label}>▼ {fmtSplit(p)}</li>)}
            </ul>
          ) : (
            <p className="mt-1 text-[12px] text-zinc-500">No split under 50% yet.</p>
          )}
        </div>
      </div>
      {s.warnings.map((w) => <p key={w} className="mt-2 text-[11px] text-amber-300/90">⚠ {w}</p>)}
      <p className="mt-2 text-[10px] text-zinc-500">Splits with 5+ settled picks. Wins and losses only.</p>
      <Link href={`/ask?style=${encodeURIComponent(ctx.slice(0, 1500))}`} className="portal-toast mt-3 inline-block rounded-lg px-3 py-1.5 text-[12px] font-black text-white">
        ✨ Ask Portal AI about my style
      </Link>
    </section>
  );
}

/** Small tip under a stat picker, plus your own record on that stat. */
export function StatTipLine({ market }: { market: string }) {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const tip = statTip(market);
  const mine = statRecord(picks, market);
  if (!tip && !mine) return null;
  return (
    <p className="col-span-full mt-0.5 text-[11px] leading-snug text-purple-200/80">
      {tip ? <>💡 {tip}</> : null}
      {mine ? <span className="ml-1 text-[color:var(--gold)]">{mine}</span> : null}
    </p>
  );
}
