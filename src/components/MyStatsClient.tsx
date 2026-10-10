"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import MascotSlot from "@/components/MascotSlot";
import { myStats, type Group, type Tally } from "@/lib/myStats";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { SPORT_LABEL, type Sport } from "@/lib/types";

const rec = (t: Tally) => `${t.w}-${t.l}${t.p ? `-${t.p}` : ""}`;
const pctColor = (pct: number | null) => (pct == null ? "#a1a1aa" : pct >= 55 ? "var(--gold)" : pct >= 50 ? "var(--plus)" : "var(--minus)");

function Rows({ title, groups, label = (k: string) => k }: { title: string; groups: Group[]; label?: (k: string) => string }) {
  if (!groups.length) return null;
  return (
    <section className="foil-tile p-4">
      <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200/80">{title}</h2>
      <ul className="mt-2 space-y-1.5">
        {groups.slice(0, 8).map((g) => {
          const pct = g.t.pct;
          return (
            <li key={g.key} className="text-[13px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-bold capitalize text-zinc-100">{label(g.key)}</span>
                <span className="tabular shrink-0 text-zinc-400">
                  {rec(g.t)} <b style={{ color: pctColor(pct) }}>{pct == null ? "—" : pct + "%"}</b>
                </span>
              </div>
              <div className="xp-bar mt-1 h-1.5 overflow-hidden rounded-full">
                <div className="xp-fill h-full rounded-full" style={{ width: (pct ?? 0) + "%", background: pctColor(pct), color: pctColor(pct) }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Heatmap({ days }: { days: Map<string, Tally> }) {
  const today = new Date();
  const cells = Array.from({ length: 70 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (69 - i));
    const key = d.toLocaleDateString("en-CA");
    return { key, t: days.get(key) ?? null };
  });
  return (
    <section className="foil-tile p-4">
      <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200/80">Last 10 weeks</h2>
      <div className="mt-2 grid grid-flow-col grid-rows-7 gap-1" style={{ gridTemplateColumns: "repeat(10, 1fr)" }}>
        {cells.map(({ key, t }) => {
          const net = t ? t.w - t.l : 0;
          const bg = !t ? "rgba(255,255,255,0.05)" : net > 0 ? "#39ff14" : net < 0 ? "#ff3b5c" : "#a855f7";
          return <span key={key} title={t ? `${key}: ${rec(t)}` : key} className="aspect-square rounded-[3px]" style={{ background: bg, opacity: t ? Math.min(1, 0.45 + 0.15 * (t.w + t.l + t.p)) : 1, boxShadow: t ? `0 0 6px ${bg}` : undefined }} />;
        })}
      </div>
      <p className="mt-2 text-[10px] text-zinc-500">Green: more wins that day. Red: more losses. Purple: even.</p>
    </section>
  );
}

export default function MyStatsClient() {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const s = useMemo(() => myStats(picks), [picks]);
  if (!picks.length) {
    return (
      <p className="panel flex items-center gap-3 rounded-xl px-4 py-5 text-sm text-zinc-400">
        <MascotSlot size={44} pose="empty" />
        No picks logged yet. <Link href="/lines/portfolio" className="font-bold text-white">Log a pick</Link>
      </p>
    );
  }
  const { current, longestWin, longestLoss } = s.streak;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <section className="foil-tile p-4 sm:col-span-2">
        <div className="flex items-center gap-4">
          <div className="portal-ring-stat flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full" style={{ boxShadow: `0 0 0 4px #7c3aed, 0 0 26px #a855f7, inset 0 0 20px #7c3aed` }}>
            <span className="tabular text-2xl font-black" style={{ color: pctColor(s.all.pct) }}>{s.all.pct == null ? "—" : s.all.pct + "%"}</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Win %</span>
          </div>
          <div className="min-w-0">
            <div className="tabular text-3xl font-black text-[color:var(--flat)]">{rec(s.all)}</div>
            <div className="text-[11px] text-zinc-400">W-L{s.all.p ? "-P" : ""} · {s.all.open} open · Win % = W ÷ (W + L)</div>
            <div className="mt-1 text-sm font-black" style={{ color: current > 0 ? "var(--plus)" : current < 0 ? "var(--minus)" : "#a1a1aa" }}>
              {current > 0 ? `🔥 ${current} straight wins` : current < 0 ? `${-current} straight losses` : "No streak"}
            </div>
            <div className="text-[11px] text-zinc-500">Longest: {longestWin} W · {longestLoss} L</div>
          </div>
        </div>
        {s.last20.length ? (
          <div className="mt-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-200/80">Last {s.last20.length}</div>
            <div className="mt-1 flex gap-1">
              {s.last20.map((r, i) => (
                <span key={i} className="flex h-6 flex-1 items-center justify-center rounded text-[10px] font-black text-black" style={{ background: r === "win" ? "#39ff14" : r === "loss" ? "#ff3b5c" : "#a855f7", boxShadow: `0 0 6px ${r === "win" ? "#39ff14" : r === "loss" ? "#ff3b5c" : "#a855f7"}` }}>
                  {r === "win" ? "W" : r === "loss" ? "L" : "P"}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      {s.best.length || s.worst.length ? (
        <section className="foil-tile p-4 sm:col-span-2">
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200/80">Best and worst stats</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
            {s.best.map((g) => (
              <span key={"b" + g.key} className="rounded-full border border-[color:var(--gold)] px-2 py-0.5 font-bold capitalize text-[color:var(--gold)]">▲ {g.key} {rec(g.t)}</span>
            ))}
            {s.worst.map((g) => (
              <span key={"w" + g.key} className="rounded-full border border-[color:var(--minus)] px-2 py-0.5 font-bold capitalize text-[color:var(--minus)]">▼ {g.key} {rec(g.t)}</span>
            ))}
          </div>
        </section>
      ) : null}
      <Rows title="By sport" groups={s.bySport} label={(k) => SPORT_LABEL[k as Sport] ?? k} />
      <Rows title="Props vs team picks" groups={s.byKind} />
      <Rows title="Over vs under" groups={s.bySide} />
      <Rows title="By stat" groups={s.byStat} />
      <Rows title="By book" groups={s.byBook} />
      <Heatmap days={s.days} />
    </div>
  );
}
