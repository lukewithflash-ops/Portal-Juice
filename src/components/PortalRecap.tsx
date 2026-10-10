"use client";

import { useState } from "react";
import type { Pick } from "@/lib/types";

type R = { v?: number; wrong?: string[]; next?: string[]; text: string; result: "hit" | "miss" | "push" | "unknown"; value: number | null; line: number; facts: string[] } | { error: string };
const KEY = "pj-recap3:";

/** Post-game recap from Portal AI, from the real box score and the numbers on the pick. Cached on device and server. */
export default function PortalRecap({ pick, auto = false }: { pick: Pick; auto?: boolean }) {
  const k = KEY + pick.id;
  const [r, setR] = useState<R | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as R) : null;
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const res = await fetch("/api/recap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pick }) });
      const j = (await res.json()) as R;
      setR(j);
      if (!("error" in j)) localStorage.setItem(k, JSON.stringify(j));
    } catch {
      setR({ error: "Couldn't reach Portal AI." });
    } finally {
      setBusy(false);
    }
  }
  if (!r) {
    return (
      <button type="button" onClick={load} disabled={busy} className="portal-toast mt-2 w-full rounded-lg px-3 py-2 text-left text-[12px] font-black text-white" data-auto={auto ? "1" : undefined}>
        {busy ? "Portal AI is reading the box score…" : "✨ Portal recap"}
      </button>
    );
  }
  if ("error" in r) {
    return (
      <p className="mt-2 text-[12px] text-zinc-400">
        {r.error}{" "}
        <button type="button" onClick={load} className="font-bold text-white">Retry</button>
      </p>
    );
  }
  const c = r.result === "hit" ? "var(--gold)" : r.result === "miss" ? "var(--minus)" : "#c084fc";
  return (
    <div className="portal-toast mt-2 rounded-lg px-3 py-2" style={{ ["--glow" as string]: c } as React.CSSProperties}>
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: c }}>
        <span>✨ Portal recap</span>
        <span>{r.result === "hit" ? "Hit" : r.result === "miss" ? "Miss" : r.result === "push" ? "Push" : ""}{r.value != null ? ` · ${r.value}/${r.line}` : ""}</span>
      </div>
      <p className="mt-1 text-[13px] leading-snug text-zinc-100">{r.text}</p>
      {r.wrong?.length ? (
        <div className="mt-2">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--minus)]">{r.result === "hit" ? "What almost went wrong" : "What went wrong"}</div>
          <ul className="mt-0.5 space-y-0.5 text-[12px] text-zinc-200">
            {r.wrong.map((w) => <li key={w}>▸ {w}</li>)}
          </ul>
        </div>
      ) : null}
      {r.next?.length ? (
        <div className="mt-2">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--plus)]">Next time</div>
          <ul className="mt-0.5 space-y-0.5 text-[12px] text-zinc-200">
            {r.next.map((w) => <li key={w}>✓ {w}</li>)}
          </ul>
        </div>
      ) : null}
      <p className="mt-1 text-[10px] text-zinc-500">Pick numbers are season-to-date, figured after the game. Not a guarantee.</p>
      {r.facts.length ? <p className="mt-1 text-[10px] text-zinc-500">Box: {r.facts.join(" · ")}</p> : null}
    </div>
  );
}
