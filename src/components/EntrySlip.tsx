"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useState } from "react";
import { gameRoute } from "@/lib/gameRoute";
import { headshotFor } from "@/lib/faces";
import type { LivePlayer, LiveSnap } from "@/lib/live";
import type { Leg, SlipLive } from "@/lib/motivation";
import { playerByName } from "@/lib/tracker";
import { sportLeague } from "@/lib/sports";

const LABEL: Record<string, string> = { nfl: "NFL", nba: "NBA", mlb: "MLB", nhl: "NHL", ncaaf: "CFB", wnba: "WNBA", ncaam: "NCAAM", ncaaw: "NCAAW", epl: "EPL", ucl: "UCL", laliga: "LALIGA", seriea: "SERIE A", bundesliga: "BUNDES", mls: "MLS" };

function statusText(s: LiveSnap | undefined): { text: string; live: boolean } {
  if (!s) return { text: "", live: false };
  if (s.state === "post") return { text: "Final", live: false };
  if (s.state === "pre") return { text: s.detail || "Not started", live: false };
  return { text: s.detail || s.clock || "Live", live: true };
}

function teamOf(snap: LiveSnap | undefined, p: LivePlayer | null): string | null {
  if (!snap || !p) return null;
  return snap.boxes.find((b) => b.players.some((x) => x.id === p.id))?.abbr ?? null;
}

function LegRow({ leg, snap }: { leg: Leg; snap: LiveSnap | undefined }) {
  const p = snap ? playerByName(snap.boxes, leg.name) : null;
  const face = p?.headshot ?? headshotFor(leg.league, leg.athleteId ?? p?.id ?? null);
  const hit = leg.status === "cleared";
  const miss = leg.status === "missed";
  const value = leg.value ?? 0;
  const fill = leg.line > 0 ? Math.max(0, Math.min(100, (value / leg.line) * 100)) : 0;
  const meta = [teamOf(snap, p), p?.position, p?.jersey ? `#${p.jersey}` : null].filter(Boolean).join(" · ");
  const ring = hit ? "#a3ff3c" : miss ? "var(--minus)" : "rgba(196,181,253,.45)";
  return (
    <li className="entry-leg py-2.5" data-hit={hit ? "1" : undefined}>
      <div className="flex items-center gap-3">
        <div className="relative h-12 w-12 flex-none overflow-hidden rounded-full border-2 bg-zinc-900" style={{ borderColor: ring, boxShadow: hit ? "0 0 14px rgba(163,255,60,.55)" : "0 0 10px rgba(168,85,247,.35)" }}>
          {face ? <img src={face} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span className="grid h-full w-full place-items-center text-xs font-black text-purple-200">{leg.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-white">{leg.name}</div>
          {meta ? <div className="truncate text-[11px] text-zinc-400">{meta}</div> : null}
        </div>
        <div className="flex-none rounded-lg border border-purple-300/25 bg-black/40 px-2.5 py-1.5 text-center">
          <div className="tabular text-sm font-black text-white">
            <span aria-label={leg.side} className={leg.side === "Over" ? "text-[color:var(--plus)]" : "text-[color:var(--minus)]"}>{leg.side === "Over" ? "↑" : "↓"}</span> {leg.line}
          </div>
          <div className="max-w-[8.5rem] truncate text-[10px] text-zinc-400">{leg.market}</div>
        </div>
      </div>
      <div className="relative mt-2.5 h-2 rounded-full bg-white/10">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${fill}%`, background: hit ? "#a3ff3c" : miss ? "var(--minus)" : "linear-gradient(90deg,#c4b5fd,#fff)", boxShadow: hit ? "0 0 10px rgba(163,255,60,.7)" : "0 0 8px rgba(196,181,253,.5)" }} />
        {leg.value !== null ? (
          <span className="tabular absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 px-2 text-[11px] font-black" style={{ left: `clamp(16px, ${fill}%, calc(100% - 16px))`, borderColor: hit ? "#a3ff3c" : "#fff", background: "#0b0614", color: hit ? "#a3ff3c" : "#fff" }}>
            {Math.round(value * 100) / 100}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function lastName(n: string) {
  return n.trim().split(/\s+/).slice(-1)[0]?.toLowerCase() ?? "";
}

/** PrizePicks-style entry: legs grouped by game, with a Pulse feed of plays that involve the slip's players. */
export function EntrySlip({ slip, snaps, compact = false }: { slip: SlipLive; snaps: Record<string, LiveSnap>; compact?: boolean }) {
  const [tab, setTab] = useState<"entry" | "pulse">("entry");
  const games = [...new Set(slip.legs.map((l) => `${l.league}/${l.gameId}`))];
  const names = slip.legs.map((l) => lastName(l.name)).filter((n) => n.length > 2);
  const pulse = games
    .flatMap((g) => (snaps[g]?.plays ?? []).map((p) => ({ ...p, g })))
    .filter((p) => names.some((n) => p.text.toLowerCase().includes(n)))
    .slice(-25)
    .reverse();
  return (
    <div className="entry-slip rounded-2xl border border-purple-400/30 bg-[#0d0718]/95 shadow-[0_0_24px_rgba(124,58,237,.25)]">
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-purple-200">{slip.total}-Pick entry</div>
        <div className="tabular text-[11px] font-bold text-zinc-400">
          {slip.hit} hit{slip.missed ? ` · ${slip.missed} missed` : ""}
        </div>
      </div>
      {!compact ? (
        <div className="mt-1 flex border-b border-white/10 text-sm font-bold" role="tablist">
          {(["entry", "pulse"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={`flex-1 py-2 capitalize ${tab === t ? "border-b-2 border-purple-400 text-white" : "text-purple-300/70"}`}>
              {t}
            </button>
          ))}
        </div>
      ) : null}
      {tab === "entry" ? (
        <div className="space-y-2 p-2">
          {games.map((g) => {
            const [league, id] = g.split("/");
            const s = snaps[g];
            const st = statusText(s);
            const legs = slip.legs.filter((l) => `${l.league}/${l.gameId}` === g);
            return (
              <div key={g} className="rounded-xl border border-white/10 bg-white/[0.03]">
                <Link href={gameRoute(league, id ?? "")} className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5 text-[11px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="rounded border border-white/20 px-1.5 py-0.5 font-black text-zinc-200">{LABEL[league] ?? sportLeague(league)?.label ?? league.toUpperCase()}</span>
                    <span className="tabular truncate text-zinc-300">
                      {s ? (
                        <>
                          {s.awayAbbr} <b className="text-white">{s.awayScore ?? 0}</b> vs {s.homeAbbr} <b className="text-white">{s.homeScore ?? 0}</b>
                        </>
                      ) : (
                        "Game"
                      )}
                    </span>
                  </span>
                  {st.text ? (
                    <span className="flex flex-none items-center gap-1 font-bold text-zinc-200">
                      {st.live ? <span className="h-2 w-2 animate-pulse rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" /> : null}
                      {st.text}
                    </span>
                  ) : null}
                </Link>
                <ul className="divide-y divide-white/10 px-3">
                  {legs.map((l) => (
                    <LegRow key={l.pickId} leg={l} snap={s} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <ul className="max-h-80 space-y-1.5 overflow-y-auto p-3 text-[12px]" aria-label="Pulse">
          {pulse.length ? (
            pulse.map((p) => (
              <li key={`${p.g}-${p.id}`} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                <span className="tabular mr-2 font-black text-purple-200">{p.clock}</span>
                <span className={p.scoring ? "font-bold text-[color:var(--gold)]" : "text-zinc-200"}>{p.text.trim()}</span>
              </li>
            ))
          ) : (
            <li className="text-zinc-500">No plays with your players yet.</li>
          )}
        </ul>
      )}
    </div>
  );
}
