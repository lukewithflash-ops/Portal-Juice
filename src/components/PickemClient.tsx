"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { haptic } from "@/lib/native";

type G = { id: string; league: string; state: string; detail: string; awayAbbr: string; homeAbbr: string; awayScore: string; homeScore: string; winner: "away" | "home" | null };
type S = { signedIn: boolean; games: G[]; mine: Record<string, string>; board: { handle: string; right: number; graded: number; made: number }[]; week: { handle: string; right: number }[]; squad: { id: string; name: string } | null; h2h: H2[]; prize: { day: string; place: number; coins: number; item?: string } | null; prizes: number[] };
type H2 = { day: string; with: string; incoming: boolean; status: string; me: number; them: number; final: boolean; won: boolean };
type Ov = { friends: { handle: string }[]; squads: { id: string; name: string }[] };

export default function PickemClient() {
  const [s, setS] = useState<S | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sq, setSq] = useState<string>("");
  const [ov, setOv] = useState<Ov | null>(null);
  const [rival, setRival] = useState("");
  const load = useCallback(() => fetch("/api/pickem" + (sq ? `?squad=${encodeURIComponent(sq)}` : ""), { cache: "no-store" }).then((r) => r.json()).then(setS).catch(() => {}), [sq]);
  useEffect(() => {
    fetch("/api/friends", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setOv({ friends: d.friends ?? [], squads: d.squads ?? [] })).catch(() => {});
  }, []);
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
  async function act(body: Record<string, string>, done: string) {
    setErr(null);
    setNote(null);
    const r = await fetch("/api/pickem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(d.error ?? "Try again.");
      haptic("error");
    } else {
      setNote(d.coins ? `+${d.coins} coins` : done);
      haptic("success");
      if (d.coins) window.dispatchEvent(new Event("pj-coins"));
    }
    load();
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
      {note ? <p className="text-[13px] font-bold text-[color:var(--portal-green)]">{note}</p> : null}
      {s.prize ? (
        <button type="button" onClick={() => act({ action: "prize" }, "Claimed")} className="press pe-on w-full rounded-2xl py-3 text-[14px] font-black text-black" data-testid="pe-prize">
          🏆 #{s.prize.place} yesterday · claim {s.prize.coins} coins{s.prize.item ? " + Pick-em Champ tag" : ""}
        </button>
      ) : null}
      {err ? <p className="text-[13px] text-[color:var(--minus)]">{err}</p> : null}
      <section>
        <h2 className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-purple-200">Open · pick before start</h2>
        {open.length ? <ul className="space-y-2">{open.map(row)}</ul> : <p className="text-[13px] text-zinc-500">No games left to pick today.</p>}
      </section>
      <section className="panel rounded-2xl p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-black uppercase tracking-[0.18em] text-[color:var(--gold)]">{s.squad ? s.squad.name : "Today\u2019s leaderboard"}</h2>
          {ov?.squads.length ? (
            <select aria-label="Leaderboard" value={sq} onChange={(e) => setSq(e.target.value)} className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-[12px] font-bold text-white">
              <option value="">Everyone</option>
              {ov.squads.map((q) => <option key={q.id} value={q.id}>Squad · {q.name}</option>)}
            </select>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">Yesterday&apos;s top 3 (3+ graded) win {s.prizes.join(" / ")} coins. #1 gets the Pick-em Champ tag.</p>
        {s.board.length ? (
          <ol className="mt-2 space-y-1">
            {s.board.map((r, i) => (
              <li key={r.handle + i} className="flex items-center gap-2 text-[13px]"><span className="tabular w-5 font-black text-zinc-500">{i + 1}</span><span className="flex-1 font-bold text-white">@{r.handle}</span><span className="tabular font-black text-[color:var(--portal-green)]">{r.right}/{r.graded}</span></li>
            ))}
          </ol>
        ) : <p className="mt-1 text-[13px] text-zinc-500">No picks yet today. Be first.</p>}
        {s.week.length ? <p className="mt-3 text-[12px] text-zinc-400">This week: {s.week.slice(0, 5).map((w) => `@${w.handle} ${w.right}`).join(" · ")}</p> : null}
      </section>
      {s.signedIn ? (
        <section className="panel rounded-2xl p-3" data-testid="pe-h2h">
          <h2 className="text-xs font-black uppercase tracking-[0.18em] text-[color:var(--portal-pink,#f472b6)]">Head-to-head</h2>
          <p className="mt-1 text-[11px] text-zinc-500">Challenge a friend on today&apos;s picks. Most right wins {25} coins + Rival Slayer tag. Nothing is put up.</p>
          {s.h2h.length ? (
            <ul className="mt-2 space-y-1.5">
              {s.h2h.map((h) => (
                <li key={h.day + h.with} className="flex items-center gap-2 text-[13px]">
                  <span className="flex-1 font-bold text-white">vs @{h.with} <span className="text-[11px] text-zinc-500">{h.final ? "yesterday" : "today"}</span></span>
                  {h.incoming ? (
                    <>
                      <button type="button" className="press rounded-lg bg-white/10 px-2 py-1 text-[12px] font-black" onClick={() => act({ action: "h2h-accept", handle: h.with }, "You're on")}>Accept</button>
                      <button type="button" className="press rounded-lg px-2 py-1 text-[12px] text-zinc-400" onClick={() => act({ action: "h2h-decline", handle: h.with }, "Declined")}>No</button>
                    </>
                  ) : h.status === "pending" ? <span className="text-[12px] text-zinc-500">waiting</span> : (
                    <span className="tabular font-black text-[color:var(--portal-green)]">{h.me}–{h.them}</span>
                  )}
                  {h.won ? <button type="button" className="press pe-on rounded-lg px-2 py-1 text-[12px] font-black text-black" onClick={() => act({ action: "h2h-claim", handle: h.with }, "Claimed")}>Claim</button> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {ov?.friends.length ? (
            <div className="mt-2 flex gap-2">
              <select aria-label="Friend" value={rival} onChange={(e) => setRival(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-[13px] text-white">
                <option value="">Pick a friend</option>
                {ov.friends.map((f) => <option key={f.handle} value={f.handle}>@{f.handle}</option>)}
              </select>
              <button type="button" disabled={!rival} className="press rounded-lg bg-white/10 px-3 text-[13px] font-black disabled:opacity-40" onClick={() => act({ action: "h2h", handle: rival }, "Challenge sent")}>Challenge</button>
            </div>
          ) : <p className="mt-2 text-[12px] text-zinc-500"><Link href="/friends" className="underline">Add friends</Link> to start a head-to-head.</p>}
        </section>
      ) : null}
      {rest.length ? (
        <section>
          <h2 className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Locked & final</h2>
          <ul className="space-y-2">{rest.map(row)}</ul>
        </section>
      ) : null}
    </div>
  );
}
