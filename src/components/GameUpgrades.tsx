"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveArm, LiveSnap } from "@/lib/live";

/* ------------------------------------------------------------ */
/* Red-zone alarm: the stage edges pulse red while inside the 20. */
/* ------------------------------------------------------------ */

export function RedZoneAlarm({ snap }: { snap: LiveSnap | null }) {
  const sit = snap?.situation;
  if (!snap || snap.state !== "in" || !sit?.redZone || !sit.teamId) return null;
  const abbr = sit.teamId === snap.homeId ? snap.homeAbbr : sit.teamId === snap.awayId ? snap.awayAbbr : null;
  if (!abbr) return null;
  // Keyed by drive + team so the alarm flash replays on each new trip inside the 20.
  const drive = snap.drives.find((d) => d.live)?.id ?? sit.teamId;
  return (
    <>
      <div key={"rz" + drive} className="rz-edges" aria-hidden />
      <span key={"rzt" + drive} className="rz-tag" role="status" aria-live="polite">
        🚨 Red zone · {abbr}
        {sit.yardsToEndzone != null ? ` · ${sit.yardsToEndzone} yd${sit.yardsToEndzone === 1 ? "" : "s"} out` : ""}
      </span>
    </>
  );
}

/* ------------------------------------------------------------ */
/* Lead-change shockwave across the scoreboard.                  */
/* ------------------------------------------------------------ */

export type Shock = { n: number; color: string; abbr: string };

export const leadOf = (s: { awayScore: string | null; homeScore: string | null }) => {
  const d = (Number(s.homeScore) || 0) - (Number(s.awayScore) || 0);
  return d > 0 ? 1 : d < 0 ? -1 : 0;
};

/** A real lead change: someone led before, the other side leads now. Ties do not count. */
export function leadFlip(prev: { awayScore: string | null; homeScore: string | null } | null, next: { awayScore: string | null; homeScore: string | null }): "away" | "home" | null {
  if (!prev) return null;
  const was = leadOf(prev);
  const now = leadOf(next);
  if (was === 0 || now === 0 || was === now) return null;
  return now > 0 ? "home" : "away";
}

export function LeadShockwave({ shock }: { shock: Shock }) {
  return (
    <div key={shock.n} className="shock-wrap" style={{ ["--team" as string]: shock.color } as React.CSSProperties} role="status" aria-live="polite">
      <span className="shock-ring" aria-hidden />
      <span className="shock-ring shock-ring-2" aria-hidden />
      <span className="shock-word">Lead change · {shock.abbr}</span>
    </div>
  );
}

/* ------------------------------------------------------------ */
/* Line-move tag: DraftKings spread and total vs the open.        */
/* ------------------------------------------------------------ */

const n1 = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
const signed = (n: number) => (n > 0 ? `+${n1(n)}` : n === 0 ? "PK" : n1(n));

/**
 * The printed spread side is the favorite (or home on a pick'em). Its number going up is a better number
 * for that side (green), down is worse (red). Totals have no side: off-white delta only. Points only.
 */
export function lineMoves(snap: LiveSnap): { spread: { abbr: string; now: number; open: number; move: number; dir: 1 | -1 } | null; total: { now: number; open: number; move: number } | null } {
  if (!/draftkings/i.test(snap.provider ?? "")) return { spread: null, total: null };
  let spread = null;
  if (snap.spreadHome !== null && snap.spreadOpen !== null && snap.spreadHome !== snap.spreadOpen) {
    const home = snap.spreadHome <= 0;
    const now = home ? snap.spreadHome : -snap.spreadHome;
    const open = home ? snap.spreadOpen : -snap.spreadOpen;
    const move = Math.round((now - open) * 10) / 10;
    if (move !== 0) spread = { abbr: home ? snap.homeAbbr : snap.awayAbbr, now, open, move, dir: (move > 0 ? 1 : -1) as 1 | -1 };
  }
  let total = null;
  if (snap.total !== null && snap.totalOpen !== null && snap.total !== snap.totalOpen) {
    total = { now: snap.total, open: snap.totalOpen, move: Math.round((snap.total - snap.totalOpen) * 10) / 10 };
  }
  return { spread, total };
}

export function LineMoveTags({ snap }: { snap: LiveSnap }) {
  const { spread, total } = lineMoves(snap);
  if (!spread && !total) return null;
  return (
    <section className="mt-3 flex flex-wrap items-center gap-2" aria-label="Line moves since open">
      {spread ? (
        <span className={"move-tag " + (spread.dir > 0 ? "is-up" : "is-down")} title="DraftKings spread for the printed side. Green is a better number for that side now, red is worse.">
          <span className="move-arrow" aria-hidden>{spread.move > 0 ? "▲" : "▼"}</span>
          <span className="font-black">{spread.abbr} {signed(spread.now)}</span>
          <span className="opacity-80">moved {n1(Math.abs(spread.move))} since open ({signed(spread.open)})</span>
        </span>
      ) : null}
      {total ? (
        <span className="move-tag is-flat" title="DraftKings total. Totals moves are shown without a side.">
          <span className="move-arrow" aria-hidden>{total.move > 0 ? "▲" : "▼"}</span>
          <span className="font-black">Total {n1(total.now)}</span>
          <span className="opacity-80">moved {n1(Math.abs(total.move))} since open ({n1(total.open)})</span>
        </span>
      ) : null}
      <span className="text-[10px] text-zinc-500">DraftKings</span>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* Win-chance strip: ESPN win probability, tap to replay.         */
/* ------------------------------------------------------------ */

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function WinStrip({ snap, flipped }: { snap: LiveSnap; flipped: boolean }) {
  const pts = snap.win;
  const n = pts.length;
  const [t, setT] = useState(1);
  const raf = useRef<number | null>(null);
  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
  }, []);
  function replay() {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (reducedMotion()) return setT(1);
    const start = performance.now();
    const dur = 2600;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      setT(k);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    setT(0);
    raf.current = requestAnimationFrame(step);
  }
  if (n < 2) return null;
  const W = 100;
  const H = 32;
  const xy = pts.map((v, i) => [(i / (n - 1)) * W, H - 1 - (v / 100) * (H - 2)] as const);
  const upto = Math.max(1, Math.round(t * (n - 1)));
  const shown = xy.slice(0, upto + 1);
  const d = shown.map(([x, y], i) => (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2)).join(" ");
  const [hx, hy] = shown[shown.length - 1];
  const cur = pts[upto];
  const playing = t < 1;
  return (
    <button
      type="button"
      onClick={replay}
      className={"win-strip foil-tile mt-3 block w-full px-3 pt-2 pb-1.5 text-left " + (flipped ? "flip-flash" : "")}
      aria-label="Win chance across the game. Tap to replay."
    >
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em]">
        <span style={{ color: snap.awayColor }}>{snap.awayAbbr} {(100 - cur).toFixed(0)}%</span>
        <span className="text-zinc-500">
          {flipped && !playing ? <span className="text-[color:var(--gold)]">Lead change</span> : playing ? "Replaying" : "Win chance · tap to replay"}
        </span>
        <span style={{ color: snap.homeColor }}>{cur.toFixed(0)}% {snap.homeAbbr}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-1 h-14 w-full" aria-hidden>
        <defs>
          <linearGradient id="ws-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={snap.homeColor} stopOpacity="0.4" />
            <stop offset="0.5" stopColor="#a855f7" stopOpacity="0.08" />
            <stop offset="1" stopColor={snap.awayColor} stopOpacity="0.4" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={W} height={H / 2} fill={snap.homeColor} opacity="0.05" />
        <rect x="0" y={H / 2} width={W} height={H / 2} fill={snap.awayColor} opacity="0.05" />
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.2)" strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" />
        {(snap.winMarks ?? []).map((m) => (
          <line key={m.i} x1={(m.i / (n - 1)) * W} y1="0" x2={(m.i / (n - 1)) * W} y2={H} stroke="rgba(168,85,247,0.35)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={`${d} L ${hx.toFixed(2)} ${H / 2} L 0 ${H / 2} Z`} fill="url(#ws-fill)" />
        <path d={d} fill="none" stroke="#e879f9" strokeWidth="4" opacity="0.25" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <path d={d} fill="none" stroke="#fff" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      {/* The head dot lives outside the stretched SVG so it stays round. */}
      <div className="relative -mt-14 h-14" aria-hidden>
        <span className="ws-head" style={{ left: `${hx}%`, top: `${(hy / H) * 100}%`, ["--team" as string]: cur >= 50 ? snap.homeColor : snap.awayColor } as React.CSSProperties} />
      </div>
      <p className="mt-0.5 text-[10px] text-zinc-500">ESPN win probability, every play{snap.winMarks?.length ? " · lines mark each period" : ""}.</p>
    </button>
  );
}

/* ------------------------------------------------------------ */
/* Pitcher fatigue: real pitch count + fastball velo vs 1st inning. */
/* ------------------------------------------------------------ */

export function PitcherFatigue({ snap, awayColor, homeColor }: { snap: LiveSnap; awayColor: string; homeColor: string }) {
  const arms = (snap.arms ?? []).filter((a) => a.pitches > 0);
  if (!arms.length) return null;
  // Pitching team order: away arm first, matching the stage.
  arms.sort((a, b) => Number(a.teamId === snap.homeId) - Number(b.teamId === snap.homeId));
  return (
    <section className="foil-tile mt-3 p-3" aria-label="Pitcher fatigue">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-purple-200/80">Arm meter</h2>
        <span className="text-[10px] text-zinc-500">Pitch count · velo vs his 1st inning</span>
      </div>
      <ul className="mt-2 space-y-2.5">
        {arms.map((a) => (
          <ArmRow key={a.id} arm={a} color={a.teamId === snap.homeId ? homeColor : awayColor} abbr={a.teamId === snap.homeId ? snap.homeAbbr : snap.awayAbbr} />
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-zinc-500">From ESPN pitch-by-pitch. Bar marks 75 and 100 pitches. Not a prediction.</p>
    </section>
  );
}

function ArmRow({ arm, color, abbr }: { arm: LiveArm; color: string; abbr: string }) {
  const fill = Math.min(100, (arm.pitches / 110) * 100);
  const tone = arm.pitches >= 100 ? "var(--minus)" : arm.pitches >= 75 ? "var(--gold)" : "var(--plus)";
  const drop = arm.firstMph !== null && arm.nowMph !== null ? Math.round((arm.nowMph - arm.firstMph) * 10) / 10 : null;
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-black text-white">
          <span className="mr-1 text-[10px] tracking-wider" style={{ color }}>{abbr}</span>
          {arm.name}
        </span>
        <span className="tabular text-sm font-black" style={{ color: tone }}>
          {arm.pitches} <span className="text-[10px] text-zinc-500">pitches</span>
        </span>
      </div>
      <div className="arm-bar mt-1" aria-label={`${arm.pitches} pitches`}>
        <div className="arm-fill" style={{ width: `${fill}%`, background: tone, color: tone }} />
        <span className="arm-tick" style={{ left: `${(75 / 110) * 100}%` }} />
        <span className="arm-tick" style={{ left: `${(100 / 110) * 100}%` }} />
      </div>
      {drop !== null ? (
        <div className="mt-1 text-[11px] text-zinc-400">
          {arm.pitchType ?? "Fastball"} <span className="tabular text-white">{arm.firstMph}</span> in the {ord(arm.firstInning)} →{" "}
          <span className="tabular text-white">{arm.nowMph}</span> now ·{" "}
          <span className="tabular font-black" style={{ color: drop <= -1.5 ? "var(--minus)" : drop >= 0 ? "var(--plus)" : "var(--flat)" }}>
            {drop > 0 ? "+" : ""}
            {drop} mph
          </span>
        </div>
      ) : arm.firstMph !== null ? (
        <div className="mt-1 text-[11px] text-zinc-400">
          {arm.pitchType ?? "Fastball"} <span className="tabular text-white">{arm.firstMph}</span> mph in the {ord(arm.firstInning)} · the drop shows once he pitches a new inning
        </div>
      ) : null}
    </li>
  );
}

function ord(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
