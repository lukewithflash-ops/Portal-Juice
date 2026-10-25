"use client";
import { useEffect, useMemo, useState } from "react";
import type { LiveSnap } from "@/lib/live";
import { inBreak, nextBall } from "@/lib/breakNext";
import { headshotFor } from "@/lib/faces";

type Leader = { team: string; color: string; name: string; stat: string; face: string | null };

const n = (v: string | undefined) => {
  const x = Number(String(v ?? "").split("/")[0]);
  return Number.isFinite(x) ? x : null;
};

/** Real box-score leaders so far (ESPN box, no estimates). */
function leaders(league: string, snap: LiveSnap, colors: Record<string, string>): Leader[] {
  const out: Leader[] = [];
  const football = league === "nfl" || league === "ncaaf";
  for (const b of snap.boxes) {
    const pick = (label: string, read: (m: Record<string, string>, p: LiveSnap["boxes"][number]["players"][number]) => number | null, fmt: (v: number, m: Record<string, string>) => string) => {
      let best: { p: (typeof b.players)[number]; v: number } | null = null;
      for (const p of b.players) {
        const v = read(p.statMap, p);
        if (v !== null && v > 0 && (!best || v > best.v)) best = { p, v };
      }
      if (best) out.push({ team: b.abbr, color: colors[b.abbr] ?? b.color, name: best.p.name, stat: fmt(best.v, best.p.statMap) + " " + label, face: best.p.headshot ?? headshotFor(league, best.p.id) ?? null });
    };
    if (football) {
      pick("pass yds", (m) => n(m.passingYards), (v, m) => `${v}${m["completions/passingAttempts"] ? " (" + m["completions/passingAttempts"] + ")" : ""}`);
      pick("rush yds", (m) => n(m.rushingYards), (v) => String(v));
      pick("rec yds", (m) => n(m.receivingYards), (v) => String(v));
    } else {
      pick("pts", (m) => n(m.points ?? m.PTS), (v) => String(v));
      pick("reb", (m) => n(m.rebounds ?? m.REB), (v) => String(v));
      pick("ast", (m) => n(m.assists ?? m.AST), (v) => String(v));
    }
  }
  return out;
}

export default function BreakPanel({ league, snap, awayColor, homeColor }: { league: string; snap: LiveSnap; awayColor: string; homeColor: string }) {
  const on = inBreak(snap.state, snap.detail);
  const colors = { [snap.awayAbbr]: awayColor, [snap.homeAbbr]: homeColor };
  const ball = on ? nextBall(league, snap.period, snap.detail, snap.brk, { away: snap.awayId, home: snap.homeId }) : null;
  const list = useMemo(() => (on ? leaders(league, snap, colors) : []), [on, league, snap]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!on || list.length < 2) return;
    const t = setInterval(() => setI((x) => x + 1), 3200);
    return () => clearInterval(t);
  }, [on, list.length]);
  if (!on) return null;
  const half = /halftime/i.test(snap.detail);
  const bTeam = ball ? (ball.teamId === snap.awayId ? { abbr: snap.awayAbbr, name: snap.awayName, color: awayColor } : { abbr: snap.homeAbbr, name: snap.homeName, color: homeColor }) : null;
  const cur = list.length ? list[i % list.length] : null;
  return (
    <section className="break-panel mt-3" style={{ ["--bc" as string]: bTeam?.color ?? "#a855f7" } as React.CSSProperties} data-testid="break-panel" aria-label={half ? "Halftime" : snap.detail}>
      <div className="break-ring" aria-hidden />
      <div className="relative flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-200">{half ? "Halftime" : snap.detail}</span>
        <span className="flex items-center gap-1 text-[10px] font-bold text-zinc-400"><span className="break-dot" aria-hidden /> Live break</span>
      </div>
      {bTeam && ball ? (
        <div className="relative mt-2 flex items-center gap-3">
          <span className="break-ball" aria-hidden>{league === "nfl" || league === "ncaaf" ? "🏈" : "🏀"}</span>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">{ball.line}</div>
            <div className="truncate text-xl font-black" style={{ color: bTeam.color, textShadow: `0 0 18px ${bTeam.color}` }}>{bTeam.name ?? bTeam.abbr}</div>
            <div className="text-[10px] text-zinc-500">{ball.why}</div>
          </div>
        </div>
      ) : null}
      <div className="relative mt-2 flex items-center justify-center gap-4 text-sm font-black">
        <span style={{ color: awayColor }}>{snap.awayAbbr} {snap.awayScore ?? ""}</span>
        <span className="text-zinc-600">·</span>
        <span style={{ color: homeColor }}>{snap.homeAbbr} {snap.homeScore ?? ""}</span>
      </div>
      {cur ? (
        <div className="relative mt-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{half ? "First-half leaders" : "Leaders so far"} · ESPN box</div>
          <div key={i} className="break-leader mt-1 flex items-center gap-2">
            {cur.face ? <img src={cur.face} alt="" className="h-8 w-8 rounded-full object-cover" style={{ boxShadow: `0 0 0 2px ${cur.color}` }} /> : <span className="h-8 w-8 rounded-full" style={{ background: cur.color }} />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-black text-white">{cur.name} <span className="text-[10px] font-bold" style={{ color: cur.color }}>{cur.team}</span></div>
              <div className="text-xs font-bold text-zinc-300">{cur.stat}</div>
            </div>
            <span className="text-[10px] text-zinc-600">{(i % list.length) + 1}/{list.length}</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
