"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LEAN_NOTE, type LegInput, type LegReport, type ParlayReport } from "@/lib/breakdown";

type Res = { reports: LegReport[]; parlay: ParlayReport | null };

const LEAN_WORD: Record<LegReport["lean"], string> = { strong: "Strong", good: "Good", neutral: "Even", bad: "Weak", none: "Not enough data" };

/** One saved slip in the Log: a Break it down button, plus a collapsed summary read from the same engine. */
export default function SlipSummary({ legs, href, auto }: { legs: LegInput[]; href: string; auto: boolean }) {
  const [res, setRes] = useState<Res | null>(null);
  const [want, setWant] = useState(auto);
  useEffect(() => {
    if (!want || res) return;
    let off = false;
    fetch("/api/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ legs }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!off && d?.reports) setRes(d);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [want, res, legs]);
  const p = res?.parlay;
  const head = res
    ? `${res.reports.filter((r) => r.lean === "strong" || r.lean === "good").length} lean good · ${res.reports.filter((r) => r.lean === "bad").length} weak${p?.combined != null ? ` · ${(p.combined * 100).toFixed(1)}% combined from the prices` : ""}`
    : want
      ? "Reading the numbers…"
      : "Tap to summarize";
  return (
    <details className="panel rounded-xl px-3 py-2" onToggle={(e) => (e.currentTarget.open ? setWant(true) : null)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-xs font-black text-white">{legs.length}-leg slip</span>
          <span className="block text-[11px] text-zinc-400">{head}</span>
        </span>
        <Link href={href} onClick={(e) => e.stopPropagation()} className="shrink-0 rounded-lg bg-[color:var(--gold)] px-2.5 py-1.5 text-[11px] font-black text-black">
          Break it down
        </Link>
      </summary>
      {res ? (
        <ul className="mt-2 space-y-1">
          {res.reports.map((r, i) => {
            const tone = p?.strongest === i ? "tone-gold" : p?.weakest === i ? "text-[color:var(--minus)]" : r.lean === "good" || r.lean === "strong" ? "text-[color:var(--plus)]" : r.lean === "bad" ? "text-[color:var(--minus)]" : "text-zinc-400";
            return (
              <li key={i} className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="min-w-0 text-zinc-200">{r.title}</span>
                <span className={"shrink-0 font-bold " + tone}>
                  {p?.strongest === i ? "Strongest" : p?.weakest === i ? "Weakest" : LEAN_WORD[r.lean]}
                </span>
              </li>
            );
          })}
          {p?.sameGame ? <li className="text-[10px] text-zinc-500">Same-game legs are linked, so the real combined chance can differ.</li> : null}
          <li className="text-[10px] text-zinc-500">{LEAN_NOTE}</li>
        </ul>
      ) : null}
    </details>
  );
}
