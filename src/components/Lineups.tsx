"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState, useSyncExternalStore } from "react";
import { headshotFor } from "@/lib/faces";
import type { LivePlayer, LiveSnap } from "@/lib/live";
import { lineupOf } from "@/lib/lineup";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { sportLeague } from "@/lib/sports";

function Chip({ p, league, mine, dim }: { p: LivePlayer; league: string; mine: boolean; dim?: boolean }) {
  const face = p.headshot ?? headshotFor(league, p.id);
  return (
    <li
      className={`flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-[11px] ${mine ? "your-player border-[color:var(--gold)] text-white" : dim ? "border-white/10 text-zinc-500" : "border-purple-300/30 text-zinc-100"}`}
      title={p.position ?? undefined}
    >
      <span className="h-5 w-5 flex-none overflow-hidden rounded-full bg-zinc-800">{face ? <img src={face} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}</span>
      {p.jersey ? <span className="tabular text-[10px] text-zinc-500">#{p.jersey}</span> : null}
      <span className="truncate font-bold">{p.name}</span>
      {mine ? <span aria-label="On your picks">⭐</span> : null}
    </li>
  );
}

/** On the field/court now vs bench, plus the subs feed. Your players glow gold. */
export default function Lineups({ league, gameId, snap }: { league: string; gameId: string; snap: LiveSnap | null }) {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const [showBench, setShowBench] = useState(false);
  const soccer = sportLeague(league)?.kind === "soccer";
  const lu = useMemo(() => lineupOf(league, snap, soccer), [league, snap, soccer]);
  const mineNames = useMemo(() => picks.filter((p) => p.gameId === gameId).map((p) => p.subject.toLowerCase()), [picks, gameId]);
  const isMine = (p: LivePlayer) => mineNames.some((n) => n === p.name.toLowerCase() || (n.length > 3 && p.name.toLowerCase().includes(n)));
  if (lu.mode === "none" || !lu.teams.length) return null;
  const onLabel = soccer ? "On the pitch" : ["nba", "wnba", "ncaam", "ncaaw"].includes(league) ? "On the court" : league === "nhl" ? "On the ice" : "On the field";
  return (
    <section className="mt-4 rounded-2xl border border-purple-400/25 bg-[#0d0718]/90 p-3 shadow-[0_0_18px_rgba(124,58,237,.2)]" aria-label="Lineups">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-xs font-black uppercase tracking-[0.22em] text-purple-200">Lineups</h2>
        {lu.offense ? (
          <span className="text-[11px] font-bold text-zinc-300">
            🏈 {lu.offense} offense · {lu.defense} defense on
          </span>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {lu.teams.map((t) => (
          <div key={t.abbr}>
            <div className="mb-1 text-[11px] font-black uppercase tracking-wider text-zinc-300">{t.abbr}</div>
            {t.on.length ? (
              <>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--plus)]">{onLabel} · {t.on.length}</div>
                <ul className="flex flex-wrap gap-1">{t.on.map((p) => <Chip key={p.id} p={p} league={league} mine={isMine(p)} />)}</ul>
              </>
            ) : null}
            {t.bench.length ? (
              <>
                <button type="button" onClick={() => setShowBench((v) => !v)} className="mt-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300">
                  {lu.mode === "roster" ? "Played" : "Bench"} · {t.bench.length} {showBench ? "▴" : "▾"}
                </button>
                {showBench || t.bench.some(isMine) ? (
                  <ul className="mt-1 flex flex-wrap gap-1">{(showBench ? t.bench : t.bench.filter(isMine)).map((p) => <Chip key={p.id} p={p} league={league} mine={isMine(p)} dim />)}</ul>
                ) : null}
              </>
            ) : null}
          </div>
        ))}
      </div>
      {lu.subs.length ? (
        <div className="mt-3">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Subs</div>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-[11px]">
            {[...lu.subs].reverse().slice(0, 30).map((s, i) => {
              const mine = mineNames.some((n) => [s.inName, s.outName].some((x) => x && x.toLowerCase().includes(n)));
              return (
                <li key={`${s.text}-${i}`} className={`flex gap-2 rounded-lg border px-2 py-1 ${mine ? "border-[color:var(--gold)]/60" : "border-white/10"}`}>
                  <span className="tabular w-14 flex-none font-black text-purple-200">{s.clock}</span>
                  <span className="min-w-0">
                    {s.teamAbbr ? <b className="mr-1 text-zinc-400">{s.teamAbbr}</b> : null}
                    <span className="text-[color:var(--plus)]">▲ {s.inName ?? "?"}</span> <span className="text-[color:var(--minus)]">▼ {s.outName ?? "?"}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {lu.note ? <p className="mt-2 text-[10px] text-zinc-500">{lu.note}</p> : null}
    </section>
  );
}
