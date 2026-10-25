"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { LivePlayer, LiveSnap } from "@/lib/live";
import { TONE_COLOR, type Leg } from "@/lib/motivation";
import { headshotFor } from "@/lib/faces";

type Log = { avg: number; n: number; last5: { v: number; opp: string; home: boolean; date: string }[] } | null;

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 .'-]/g, "").trim();
const GROUP: Record<string, string> = { passing: "Passing", rushing: "Rushing", receiving: "Receiving", fumbles: "Fumbles", defensive: "Defense", interceptions: "Interceptions", kickReturns: "Kick returns", puntReturns: "Punt returns", kicking: "Kicking", punting: "Punting", batting: "Batting", pitching: "Pitching", skaters: "Skater", goalies: "Goalie", forwards: "Skater", defenses: "Skater" };
const groupLabel = (g: string) => GROUP[g] ?? (g ? g.charAt(0).toUpperCase() + g.slice(1).replace(/([A-Z])/g, " $1") : "Box score");

/** Find the leg's player in the live box: ESPN id first, then the exact name. */
export function findBoxPlayer(snap: LiveSnap | null, athleteId: string | null | undefined, name: string): { p: LivePlayer; abbr: string } | null {
  if (!snap) return null;
  for (const b of snap.boxes ?? []) for (const p of b.players) if (athleteId && p.id === athleteId) return { p, abbr: b.abbr };
  const n = norm(name);
  for (const b of snap.boxes ?? []) for (const p of b.players) if (norm(p.name) === n) return { p, abbr: b.abbr };
  return null;
}

/** Plays that name him: full name, or ESPN's "J.Allen" form. Last name alone only when nobody else in the box shares it. */
function hisPlays(snap: LiveSnap | null, name: string) {
  if (!snap?.plays?.length) return [];
  const parts = name.replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, "").trim().split(/\s+/);
  const first = parts[0] ?? "";
  const last = parts.slice(1).join(" ") || first;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const others = (snap.boxes ?? []).flatMap((b) => b.players).filter((p) => norm(p.name) !== norm(name) && norm(p.name).endsWith(" " + norm(last))).length;
  const pats = [new RegExp(`\\b${esc(name)}\\b`, "i"), new RegExp(`\\b${esc(first.charAt(0))}\\.\\s?${esc(last)}\\b`, "i")];
  if (!others && last.length > 3) pats.push(new RegExp(`\\b${esc(last)}\\b`, "i"));
  return snap.plays.filter((pl) => pats.some((r) => r.test(pl.text))).slice(-40).reverse();
}

export default function PlayerSheet({ leg, market, league, snap, onClose }: { leg: Leg; market?: string; league: string; snap: LiveSnap | null; onClose: () => void }) {
  const [log, setLog] = useState<Log | undefined>(undefined);
  const box = findBoxPlayer(snap, leg.athleteId, leg.name);
  const plays = useMemo(() => hisPlays(snap, box?.p.name ?? leg.name), [snap, box?.p.name, leg.name]);
  const id = leg.athleteId ?? box?.p.id ?? null;
  useEffect(() => {
    if (!id || !/^\d+$/.test(id)) return;
    const before = (snap?.start ?? new Date().toISOString()).slice(0, 10);
    let dead = false;
    fetch(`/api/player-stats?league=${encodeURIComponent(league)}&athleteId=${id}&market=${encodeURIComponent(market || leg.market)}&before=${before}`)
      .then((r) => r.json())
      .then((j: { log: Log }) => !dead && setLog(j.log ?? null))
      .catch(() => !dead && setLog(null));
    return () => {
      dead = true;
    };
  }, [id, league, market, leg.market, snap?.start]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const color = TONE_COLOR[leg.tone];
  const face = headshotFor(league, id);
  const lineText = leg.lineText ?? String(leg.line);
  const lines = (box?.p.lines ?? []).filter((l) => l.cells.some((c) => c && c !== "0" && c !== "--" && c !== "0-0" && c !== "0/0" && c !== "0.0"));
  const pct = leg.value === null ? 0 : Math.max(0, Math.min(1, leg.value / Math.max(leg.line, 0.5)));

  return createPortal(
    <>
      <div className="sheet-scrim" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label={`${leg.name} live stats`} className="sheet player-sheet mx-auto max-w-lg" data-testid="player-sheet" style={{ ["--team" as string]: color } as React.CSSProperties}>
        <div className="flex items-center gap-3">
          {face ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={face} alt="" width={56} height={56} className="h-14 w-14 flex-none rounded-full object-cover" style={{ border: `2px solid ${color}`, boxShadow: `0 0 14px ${color}` }} referrerPolicy="no-referrer" />
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black leading-tight text-white">{box?.p.name ?? leg.name}</h2>
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              {[box?.abbr, box?.p.pos, box?.p.jersey ? `#${box.p.jersey}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="press grid h-9 w-9 flex-none place-items-center rounded-full bg-white/10 text-lg text-white">×</button>
        </div>

        <section className="player-sheet-tile mt-3 rounded-2xl p-3" data-testid="ps-progress">
          <div className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: leg.side === "Over" ? "var(--plus)" : "#38bdf8" }}>
            Your line · {leg.plus ? "" : leg.side + " "}{lineText} {leg.market}
          </div>
          <div className="mt-1 flex items-end justify-between gap-2">
            <span className="tabular text-4xl font-black leading-none" style={{ color }}>
              {leg.value ?? "—"}<span className="text-base text-zinc-500">/{lineText}</span>
            </span>
            {leg.pace !== null && !leg.final ? <span className="tabular text-sm font-black text-zinc-200">Pace {leg.pace}</span> : leg.final ? <span className="text-sm font-black text-zinc-300">Final</span> : null}
          </div>
          <div className="spot-meter mt-2"><div className="spot-fill" style={{ width: `${Math.min(100, pct * 80)}%`, background: color }} /><span className="spot-tick" style={{ left: "80%" }} /></div>
          {leg.progress ? <p className="mt-1.5 text-[12px] font-bold text-zinc-300">{leg.progress}</p> : null}
          {leg.pace !== null && !leg.final ? <p className="mt-0.5 text-[10px] text-zinc-500">Pace is his current rate stretched to a full game. Not a prediction.</p> : null}
        </section>

        {lines.length ? (
          <section className="mt-3" data-testid="ps-box">
            <h3 className="mb-1.5 text-[10px] font-black uppercase tracking-[0.2em] tone-gold">Live box score</h3>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="player-sheet-tile rounded-xl p-2.5">
                  <div className="mb-1 text-[10px] font-black uppercase tracking-wider text-zinc-400">{groupLabel(l.group)}</div>
                  <div className="grid grid-cols-4 gap-x-2 gap-y-1.5">
                    {l.labels.map((lab, j) => (l.cells[j] ? (
                      <div key={j} className="min-w-0 text-center">
                        <div className="tabular text-[15px] font-black text-white">{l.cells[j]}</div>
                        <div className="truncate text-[9px] font-bold uppercase tracking-wider text-zinc-500">{lab}</div>
                      </div>
                    ) : null))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : box ? null : <p className="mt-3 text-[12px] text-zinc-500">Not in the live box score yet.</p>}

        {log ? (
          <section className="mt-3" data-testid="ps-season">
            <h3 className="mb-1.5 text-[10px] font-black uppercase tracking-[0.2em] tone-gold">{leg.market} this season</h3>
            <div className="player-sheet-tile rounded-xl p-2.5">
              <div className="flex items-baseline justify-between">
                <span className="tabular text-2xl font-black text-white">{log.avg}</span>
                <span className="text-[11px] text-zinc-400">avg · {log.n} game{log.n === 1 ? "" : "s"}</span>
              </div>
              {log.last5.length ? (
                <>
                  <div className="mt-2 text-[10px] font-black uppercase tracking-wider text-zinc-500">Last {log.last5.length}</div>
                  <div className="mt-1 grid grid-cols-5 gap-1.5">
                    {log.last5.map((g, i) => {
                      const hit = leg.side === "Over" ? g.v > leg.line : g.v < leg.line;
                      return (
                        <div key={i} className="rounded-lg py-1 text-center" style={{ background: hit ? "rgba(57,255,136,.12)" : "rgba(255,255,255,.05)", border: `1px solid ${hit ? "rgba(57,255,136,.5)" : "rgba(255,255,255,.1)"}` }}>
                          <div className="tabular text-[14px] font-black" style={{ color: hit ? "var(--plus)" : "#e4e4e7" }}>{g.v}</div>
                          <div className="text-[9px] font-bold text-zinc-500">{g.opp ? `${g.home ? "vs" : "@"} ${g.opp}` : ""}</div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-500">Green beat your line of {lineText}. ESPN game log.</p>
                </>
              ) : null}
            </div>
          </section>
        ) : log === undefined && id ? <div className="skel mt-3 h-20 rounded-xl" aria-hidden /> : null}

        {plays.length ? (
          <section className="mt-3" data-testid="ps-plays">
            <h3 className="mb-1.5 text-[10px] font-black uppercase tracking-[0.2em] tone-gold">His plays this game · {plays.length}</h3>
            <ol className="space-y-1.5">
              {plays.map((pl) => (
                <li key={pl.id} className="player-sheet-tile flex gap-2 rounded-xl px-2.5 py-2 text-[12px] leading-snug">
                  <span className="tabular w-14 flex-none text-[10px] font-black text-zinc-500">{[pl.period, pl.clock].filter(Boolean).join(" · ")}</span>
                  <span className={pl.scoring ? "font-bold text-[color:var(--plus)]" : "text-zinc-200"}>{pl.text}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        <p className="mt-3 text-center text-[10px] text-zinc-600">Live from the ESPN box score and play-by-play.</p>
      </div>
    </>,
    document.body
  );
}
