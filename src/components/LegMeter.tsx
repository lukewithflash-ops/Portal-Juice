"use client";

import { TONE_COLOR, type Leg, type SlipLive } from "@/lib/motivation";

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
            {leg.value ?? "—"}
            <span className="font-semibold text-white/60">/{leg.line}</span>
            {cleared ? " ✓" : ""}
          </span>
        </div>
        <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/40">
          <div className="h-full rounded-full" style={{ width: leg.fill + "%", background: color, transition: "width 700ms ease" }} />
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
          {STAMP[leg.status] ? (
            <div className="text-[10px] font-black uppercase tracking-wider" style={{ color }}>
              {STAMP[leg.status]}
            </div>
          ) : leg.pace !== null ? (
            <div className="text-[10px] text-zinc-500">pace {leg.pace}</div>
          ) : null}
        </div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: leg.fill + "%", background: color, transition: "width 700ms ease" }} />
      </div>
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
  return (
    <span
      className="tabular rounded-full border px-2 py-0.5 text-[11px] font-black"
      style={{
        borderColor: all ? "var(--gold)" : slip.missed ? "var(--minus)" : "rgba(255,255,255,0.2)",
        color: all ? "var(--gold)" : "var(--flat)",
      }}
    >
      {slip.hit} of {slip.total} legs hit
    </span>
  );
}
