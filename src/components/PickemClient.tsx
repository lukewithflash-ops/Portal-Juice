"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { haptic } from "@/lib/native";

type G = { id: string; league: string; state: string; detail: string; awayAbbr: string; homeAbbr: string; awayScore: string; homeScore: string; winner: "away" | "home" | null };
type S = { signedIn: boolean; games: G[]; mine: Record<string, string>; board: { handle: string; right: number; graded: number; made: number }[]; week: { handle: string; right: number }[] };

export default function PickemClient() {
  const [s, setS] = useState<S | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => fetch("/api/pickem", { cache: "no-store" }).then((r) => r.json()).then(setS).catch(() => {}), []);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  if (!s) return <div className="skel h-40" />;
  async function pick(id: string, side: "away" | "home") {
    setErr(null);
    setS((c) => (c ? { ...c, mine: { ...c.mine, [id]: side } } : c));
    const r = await fetch("/api/pickem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, side }) });
    if (!r.ok) {
      setErr((await r.json().catch(() => ({}))).error ?? "Try again.");
      haptic("error");
      load();
    } else haptic("success");
  }
  const open = s.games.filter((g) => g.state === "pre");
  const rest = s.games.filter((g) => g.state !== "pre");
  const row = (g: G) => {
    const m = s.mine[g.id];
    const lock = g.state !== "pre";
    const btn = (side: "away" | "home", abbr: string, score: string) => (
      <button type="button" disabled={lock || !s.signedIn} onClick={() => pick(g.id, side)} className={"press flex-1 rounded-xl border py-2 text-[14px] font-black " + (m === side ? "pe-on border-transparent text-black" : "border-white/15 bg-white/[0.04] text-white") + (g.winner === side ? " pe-win" : "")}>
        {abbr}{g.state !== "pre" ? <span className="tabular ml-1 opacity-80">{score}</span> : null}
      </button>
    );
    return (
      <li key={g.id} className="panel rounded-2xl p-2.5" data-testid="pickem-game">
        <p className="mb-1.5 flex justify-between text-[11px] font-bold uppercase text-zinc-500"><span>{g.league}</span><span>{g.detail}</span></p>
        <div className="flex gap-2">{btn("away", g.awayAbbr, g.awayScore)}{btn("home", g.homeAbbr, g.homeScore)}</div>
        {m && g.winner ? <p className={"mt-1 text-[12px] font-black " + (m === g.winner ? "text-[color:var(--gold)]" : "text-zinc-500")}>{m === g.winner ? "🎯 Called it" : "Missed"}</p> : null}
      </li>
    );
  };
  return (
    <div className="space-y-4" data-testid="pickem">
      {!s.signedIn ? <p className="panel rounded-2xl p-3 text-sm text-zinc-300">Sign in to play. <Link href="/account" className="font-bold text-purple-200 underline">Sign in</Link></p> : null}
      {err ? <p className="text-[13px] text-[color:var(--minus)]">{err}</p> : null}
      <section>
        <h2 className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-purple-200">Open · pick before start</h2>
        {open.length ? <ul className="space-y-2">{open.map(row)}</ul> : <p className="text-[13px] text-zinc-500">No games left to pick today.</p>}
      </section>
      <section className="panel rounded-2xl p-3">
        <h2 className="text-xs font-black uppercase tracking-[0.18em] text-[color:var(--gold)]">Today&apos;s leaderboard</h2>
        {s.board.length ? (
          <ol className="mt-2 space-y-1">
            {s.board.map((r, i) => (
              <li key={r.handle + i} className="flex items-center gap-2 text-[13px]"><span className="tabular w-5 font-black text-zinc-500">{i + 1}</span><span className="flex-1 font-bold text-white">@{r.handle}</span><span className="tabular font-black text-[color:var(--portal-green)]">{r.right}/{r.graded}</span></li>
            ))}
          </ol>
        ) : <p className="mt-1 text-[13px] text-zinc-500">No picks yet today. Be first.</p>}
        {s.week.length ? <p className="mt-3 text-[12px] text-zinc-400">This week: {s.week.slice(0, 5).map((w) => `@${w.handle} ${w.right}`).join(" · ")}</p> : null}
      </section>
      {rest.length ? (
        <section>
          <h2 className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Locked & final</h2>
          <ul className="space-y-2">{rest.map(row)}</ul>
        </section>
      ) : null}
    </div>
  );
}
