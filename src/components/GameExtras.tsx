"use client";

import { useEffect, useState } from "react";
import type { LiveSnap } from "@/lib/live";
import { clockSecs } from "@/lib/liveClock";

/** Points each side scored over the last 10 scoring plays ESPN logged. Real plays only, no model. */
export function momentumOf(snap: LiveSnap): { away: number; home: number; n: number } | null {
  // Score changes between consecutive plays, as ESPN logged them (no model). Last 10 scoring changes.
  const ev: { away: number; home: number }[] = [];
  let pa: number | null = null, ph: number | null = null;
  for (const p of snap.plays) {
    if (p.awayScore == null || p.homeScore == null) continue;
    if (pa !== null && ph !== null && (p.awayScore > pa || p.homeScore > ph)) ev.push({ away: Math.max(0, p.awayScore - pa), home: Math.max(0, p.homeScore - ph) });
    pa = p.awayScore;
    ph = p.homeScore;
  }
  const last = ev.slice(-10);
  if (last.length < 2) return null;
  const away = last.reduce((t, e) => t + e.away, 0), home = last.reduce((t, e) => t + e.home, 0);
  return away + home ? { away, home, n: last.length } : null;
}

/** Late and close, by the real clock and score. */
export function isClutch(league: string, snap: LiveSnap): boolean {
  if (snap.state !== "in") return false;
  const m = Math.abs(Number(snap.awayScore ?? 0) - Number(snap.homeScore ?? 0));
  const per = snap.period ?? 0;
  const secs = clockSecs(snap.clock) ?? 9999;
  if (["nba", "wnba"].includes(league)) return per >= 4 && secs <= 300 && m <= 5;
  if (["ncaam", "ncaaw"].includes(league)) return per >= 2 && secs <= 300 && m <= 5;
  if (["nfl", "ncaaf"].includes(league)) return per >= 4 && secs <= 300 && m <= 8;
  if (league === "nhl") return per >= 3 && secs <= 300 && m <= 1;
  return false;
}

export function MomentumMeter({ league, snap, awayColor, homeColor }: { league: string; snap: LiveSnap; awayColor: string; homeColor: string }) {
  const mo = momentumOf(snap);
  const clutch = isClutch(league, snap);
  if (!mo && !clutch) return null;
  const tot = mo ? mo.away + mo.home : 1;
  const pct = mo ? (mo.away / tot) * 100 : 50;
  return (
    <section className="momentum panel rounded-2xl px-3 py-2.5" data-testid="momentum">
      <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-[0.16em]">
        <span className="text-purple-200">Momentum</span>
        {clutch ? <span className="clutch-chip" data-testid="clutch">⚡ Clutch time</span> : <span className="text-zinc-500">{mo ? `last ${mo.n} scores` : ""}</span>}
      </div>
      {mo ? (
        <>
          <div className="momentum-bar relative mt-2 h-3 overflow-hidden rounded-full" style={{ background: homeColor }}>
            <span className="absolute inset-y-0 left-0 transition-[width] duration-700" style={{ width: `${pct}%`, background: awayColor }} />
            <span className="momentum-knob absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full" style={{ left: `calc(${pct}% - 8px)` }} aria-hidden />
          </div>
          <div className="tabular mt-1 flex justify-between text-[12px] font-bold text-zinc-300">
            <span>{snap.awayAbbr} {mo.away}</span>
            <span>{mo.home} {snap.homeAbbr}</span>
          </div>
        </>
      ) : null}
    </section>
  );
}

type Call = { side: "away" | "home"; result: "open" | "hit" | "miss" | "void" } | null;

/** Free fun call: who scores next. Coins only (a daily challenge), never money. Settled by the real score. */
export function NextScoreCall({ league, id, snap }: { league: string; id: string; snap: LiveSnap }) {
  const [call, setCall] = useState<Call>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const score = `${snap.awayScore}-${snap.homeScore}`;
  useEffect(() => {
    let stop = false;
    fetch(`/api/calls?league=${league}&id=${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (stop || !j) return;
        if (j.signedIn === false) setSignedIn(false);
        setCall(j.call ?? null);
      })
      .catch(() => {});
    return () => { stop = true; };
  }, [league, id, score]);
  if (snap.state !== "in") return null;
  async function make(side: "away" | "home") {
    setMsg(null);
    const r = await fetch("/api/calls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ league, id, side }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(j.error ?? "Try again.");
    setCall(j.call);
    window.dispatchEvent(new Event("pj-coins"));
  }
  return (
    <section className="panel rounded-2xl px-3 py-2.5" data-testid="next-score">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-purple-200">Call the next score</p>
        <span className="text-[10px] text-zinc-500">For fun · coins challenge</span>
      </div>
      {!signedIn ? (
        <p className="mt-1 text-[12px] text-zinc-400">Sign in to make calls and earn coins.</p>
      ) : call && call.result === "open" ? (
        <p className="mt-1.5 text-[13px] font-bold text-white">You called <span className="text-[color:var(--portal-green)]">{call.side === "away" ? snap.awayAbbr : snap.homeAbbr}</span>. Waiting on the next score…</p>
      ) : (
        <>
          {call ? <p className={"mt-1 text-[12px] font-black " + (call.result === "hit" ? "text-[color:var(--gold)]" : "text-zinc-400")}>{call.result === "hit" ? "🎯 Called it! Claim it in Coins." : call.result === "miss" ? "Missed that one. Call again." : "No clean call. Try again."}</p> : null}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => make("away")} className="press rounded-xl border border-white/15 bg-white/[0.05] py-2 text-[14px] font-black text-white">{snap.awayAbbr}</button>
            <button type="button" onClick={() => make("home")} className="press rounded-xl border border-white/15 bg-white/[0.05] py-2 text-[14px] font-black text-white">{snap.homeAbbr}</button>
          </div>
        </>
      )}
      {msg ? <p className="mt-1 text-[12px] text-[color:var(--minus)]">{msg}</p> : null}
    </section>
  );
}
