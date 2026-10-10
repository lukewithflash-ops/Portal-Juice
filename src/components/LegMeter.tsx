"use client";

import { useState } from "react";
import { chanceTone, CHANCE_NOTE, type Chance } from "@/lib/chance";
import { slipChance, TONE_COLOR, type Leg, type SlipLive } from "@/lib/motivation";

const CHANCE_COLOR = { gold: "var(--gold)", green: "var(--plus)", red: "var(--minus)", flat: "#a1a1aa" } as const;

/** "62% ▲" with the arrow showing which way it last moved. */
export function ChanceBadge({ chance, size = "sm" }: { chance: Chance | null | undefined; size?: "sm" | "lg" }) {
  const pct = chance?.pct ?? null;
  const [seen, setSeen] = useState<{ pct: number | null; dir: number }>({ pct, dir: 0 });
  if (seen.pct !== pct) setSeen({ pct, dir: seen.pct == null || pct == null ? 0 : Math.sign(pct - seen.pct) });
  if (pct == null) return null;
  const color = CHANCE_COLOR[chanceTone(pct)];
  return (
    <span
      key={pct}
      title={`Chance to hit (${chance?.source}). ${CHANCE_NOTE}`}
      className={"chance-pop tabular inline-flex items-baseline gap-0.5 font-black " + (size === "lg" ? "text-lg" : "text-[11px]")}
      style={{ color }}
    >
      {pct >= 99.9 ? "100" : pct < 1 && pct > 0 ? "<1" : Math.round(pct)}%
      {seen.dir > 0 ? <span aria-label="up">▲</span> : seen.dir < 0 ? <span aria-label="down">▼</span> : null}
    </span>
  );
}

const STAMP: Partial<Record<Leg["status"], string>> = { cleared: "Hit!", missed: "Missed" };

/** One leg: name, live value vs line, meter, pace, and a short line about the last change. */
export function LegMeter({ leg, mini = false }: { leg: Leg; mini?: boolean }) {
  const color = TONE_COLOR[leg.tone];
  const cleared = leg.status === "cleared";
  if (mini) {
    return (
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2 text-[11px]">
          <span className="truncate font-bold text-white">{leg.name}</span>
          <span className="tabular shrink-0 font-black" style={{ color }}>
            <ChanceBadge chance={leg.chance} />{" "}
            {leg.value ?? "—"}
            <span className="font-semibold text-white/60">/{leg.line}</span>
            {cleared ? " ✓" : ""}
          </span>
        </div>
        <div className={"xp-bar mt-0.5 h-1.5 overflow-hidden rounded-full " + (cleared ? "level-up" : "")}>
          <div className="xp-fill h-full rounded-full" style={{ width: leg.fill + "%", background: color, color }} />
        </div>
      </div>
    );
  }
  return (
    <li className={"foil-tile relative list-none px-3 py-2 " + (cleared ? "gold-burst gold-edge" : "")}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-[color:var(--flat)]">
            {cleared ? <span className="mr-1 inline-block animate-bounce">🏆</span> : null}
            {leg.name}
          </div>
          <div className="text-[11px] text-zinc-400">{leg.progress}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="tabular text-xl font-black" style={{ color }}>
            {leg.value ?? "—"}
            <span className="text-xs text-zinc-500">/{leg.line}</span>
          </div>
          <div className="flex justify-end">
            <ChanceBadge chance={leg.chance} />
          </div>
          {STAMP[leg.status] ? (
            <div className="text-[10px] font-black uppercase tracking-wider" style={{ color }}>
              {STAMP[leg.status]}
            </div>
          ) : leg.pace !== null ? (
            <div className="text-[10px] text-zinc-500">pace {leg.pace}</div>
          ) : null}
        </div>
      </div>
      <div className="xp-bar mt-2 h-2.5 overflow-hidden rounded-full">
        <div className="xp-fill h-full rounded-full" style={{ width: leg.fill + "%", background: color, color }} />
      </div>
      {cleared ? <div key={leg.pickId + "lvl"} className="level-up pointer-events-none absolute inset-0" aria-hidden /> : null}
      {leg.hype ? (
        <p key={leg.hype + leg.value} className="play-in mt-1.5 text-xs font-black" style={{ color: cleared ? "var(--gold)" : color }}>
          {leg.hype}
        </p>
      ) : null}
    </li>
  );
}

export function SlipCount({ slip }: { slip: SlipLive }) {
  const all = slip.hit === slip.total && slip.total > 0;
  const combo = slip.total > 1 ? slipChance(slip) : null;
  return (
    <span className="inline-flex items-center gap-1.5">
    {combo != null ? (
      <span className="text-[10px] text-zinc-400" title={`All legs together. Same-game legs move together, so this is rough. ${CHANCE_NOTE}`}>
        All legs <ChanceBadge chance={{ pct: combo, source: "pace" }} />
      </span>
    ) : null}
    <span
      className="tabular rounded-full border px-2 py-0.5 text-[11px] font-black"
      style={{
        borderColor: all ? "var(--gold)" : slip.missed ? "var(--minus)" : "rgba(255,255,255,0.2)",
        color: all ? "var(--gold)" : "var(--flat)",
      }}
    >
      {slip.hit} of {slip.total} legs hit
    </span>
    </span>
  );
}
