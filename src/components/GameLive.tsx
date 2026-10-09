"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import GameChat from "@/components/GameChat";
import Mark from "@/components/Mark";
import type { LivePlay, LiveSnap } from "@/lib/live";
import {
  currentDrive,
  isBigPlay,
  leadChanged,
  scoringRun,
  trackProps,
  type TrackProp,
  type TrackRow,
} from "@/lib/tracker";

export default function GameLive({
  league,
  id,
  away,
  home,
  props,
}: {
  league: string;
  id: string;
  away: string;
  home: string;
  props: TrackProp[];
}) {
  const [snap, setSnap] = useState<LiveSnap | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [tab, setTab] = useState<"play" | "lines" | "chat">("play");
  const last = useRef<string | null>(null);

  useEffect(() => {
    let stop = false;
    const pull = async () => {
      try {
        const res = await fetch("/api/live/" + league + "/" + id);
        if (!res.ok) return;
        const data = (await res.json()) as LiveSnap;
        if (stop) return;
        const newest = data.plays.length ? data.plays[data.plays.length - 1].id : null;
        if (last.current && newest && newest !== last.current) setFresh(newest);
        last.current = newest;
        setSnap(data);
      } catch {
        /* keep the last snap */
      }
    };
    pull();
    const timer = setInterval(pull, 12000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [league, id]);

  const rows = useMemo(() => trackProps(props, snap, league), [props, snap, league]);
  const top = rows.slice(0, 8);
  const rest = rows.slice(8);
  const plays = snap ? [...snap.plays].reverse() : [];
  const banner = plays.find((p) => p.id === fresh && isBigPlay(p)) ?? null;
  const run = snap ? scoringRun(snap.plays) : null;
  const flipped = snap ? leadChanged(snap.plays) : false;
  const awayColor = snap?.awayColor || "#7c3aed";
  const homeColor = snap?.homeColor || "#39ff14";

  return (
    <div className="game-stage">
      <div className={tab === "chat" ? "max-lg:hidden" : ""}>
        <div className={tab === "lines" ? "max-lg:hidden" : ""}>
          <ScoreHero snap={snap} away={away} home={home} awayColor={awayColor} homeColor={homeColor} flipped={flipped} />
          {banner ? <BigBanner play={banner} snap={snap} awayColor={awayColor} homeColor={homeColor} /> : null}
          {snap ? (
            <Stage league={league} snap={snap} awayColor={awayColor} homeColor={homeColor} run={run} />
          ) : (
            <p className="mt-3 text-sm text-zinc-500">Waiting on the live feed.</p>
          )}
          <PlayList plays={plays.slice(0, 14)} fresh={fresh} snap={snap} awayColor={awayColor} homeColor={homeColor} />
        </div>
        <div className={tab === "play" ? "max-lg:hidden" : ""}>
          <Tracker top={top} rest={rest} state={snap?.state ?? "pre"} />
        </div>
      </div>
      <div className={tab !== "chat" ? "max-lg:hidden lg:block" : "lg:block"}>
        <GameChat league={league} id={id} awayColor={awayColor} homeColor={homeColor} />
      </div>
      <div className="mt-3 flex gap-1 lg:hidden">
        {(
          [
            ["play", "Play"],
            ["lines", "Live vs line"],
            ["chat", "Chat"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={
              "flex-1 rounded-lg px-2 py-2 text-[11px] font-bold uppercase tracking-wider " +
              (tab === key ? "bg-white/10 text-white" : "text-zinc-500")
            }
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScoreHero({
  snap,
  away,
  home,
  awayColor,
  homeColor,
  flipped,
}: {
  snap: LiveSnap | null;
  away: string;
  home: string;
  awayColor: string;
  homeColor: string;
  flipped: boolean;
}) {
  const awayScore = snap?.awayScore ?? "—";
  const homeScore = snap?.homeScore ?? "—";
  return (
    <div className={"foil-tile p-4 " + (flipped ? "lead-flash" : "")}>
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
        <span className={snap?.state === "in" ? "pill pill-win" : "pill pill-push"}>
          {snap?.state === "in" ? "Live" : snap?.state === "post" ? "Final" : "Soon"}
          {snap?.clock ? " " + snap.clock : ""}
        </span>
        <span>{snap?.detail || ""}</span>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <div>
          <div className="text-sm font-black" style={{ color: awayColor }}>{away}</div>
          <div className="big-num text-5xl font-black text-[color:var(--flat)]">{awayScore}</div>
        </div>
        <div className="pb-2 text-zinc-600">@</div>
        <div className="text-right">
          <div className="text-sm font-black" style={{ color: homeColor }}>{home}</div>
          <div className="big-num text-5xl font-black text-[color:var(--flat)]">{homeScore}</div>
        </div>
      </div>
      {snap && snap.win.length > 1 ? <WinLine snap={snap} away={away} home={home} /> : null}
    </div>
  );
}

function WinLine({ snap, away, home }: { snap: LiveSnap; away: string; home: string }) {
  const pts = snap.win.slice(-36);
  const d = pts.map((n, i) => {
    const x = (i / Math.max(1, pts.length - 1)) * 100;
    const y = 28 - (n / 100) * 26;
    return x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");
  const last = pts[pts.length - 1];
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-zinc-500">
        <span>{away} {last != null ? (100 - last).toFixed(0) : "—"}%</span>
        <span>Win chance</span>
        <span>{last != null ? last.toFixed(0) : "—"}% {home}</span>
      </div>
      <svg viewBox="0 0 100 30" className="h-10 w-full" aria-hidden>
        <polyline points={d} fill="none" stroke={snap.homeColor} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function Stage({
  league,
  snap,
  awayColor,
  homeColor,
  run,
}: {
  league: string;
  snap: LiveSnap;
  awayColor: string;
  homeColor: string;
  run: { teamId: string; us: number; them: number } | null;
}) {
  if (league === "nfl" || league === "ncaaf") return <Field snap={snap} />;
  if (league === "nba") return <Court snap={snap} awayColor={awayColor} homeColor={homeColor} run={run} />;
  if (league === "nhl") return <Rink snap={snap} awayColor={awayColor} homeColor={homeColor} run={run} />;
  return run ? <RunChip snap={snap} run={run} /> : null;
}

function Field({ snap }: { snap: LiveSnap }) {
  const drive = currentDrive(snap.plays);
  if (!drive) return <p className="mt-3 text-[11px] text-zinc-500">No yard line posted yet.</p>;
  const color = drive.teamId === snap.homeId ? snap.homeColor : snap.awayColor;
  const ball = 100 - drive.ball;
  const startPlay = [...snap.plays].reverse().find((p) => p.teamId === drive.teamId && p.yardsToEndzone !== null);
  const start = startPlay?.yardsToEndzone != null ? 100 - startPlay.yardsToEndzone : ball;
  const first = drive.firstDown === null ? null : 100 - drive.firstDown;
  const abbr = drive.teamId === snap.homeId ? snap.homeAbbr : snap.awayAbbr;
  return (
    <div className="foil-tile mt-3 p-3">
      <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-400">
        <span style={{ color }}>{abbr} drive · {drive.plays} plays{drive.yards !== null ? " · " + drive.yards + " yds" : ""}</span>
        {drive.redZone ? <span className="text-[color:var(--minus)]">Red zone</span> : null}
      </div>
      <svg viewBox="0 0 100 22" className="h-16 w-full">
        <rect x="0" y="2" width="100" height="18" fill="#0c3b1e" rx="1" />
        {drive.redZone ? <rect x="80" y="2" width="20" height="18" fill="rgba(255,59,92,0.28)" /> : null}
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((x) => (
          <line key={x} x1={x} y1="2" x2={x} y2="20" stroke="rgba(255,255,255,0.35)" strokeWidth="0.3" />
        ))}
        <line x1={Math.min(start, ball)} y1="11" x2={Math.max(start, ball)} y2="11" stroke={color} strokeWidth="1.2" />
        {first !== null ? <line x1={first} y1="3" x2={first} y2="19" stroke="#f5c542" strokeWidth="0.7" /> : null}
        <circle className="ball-mark" cx={ball} cy="11" r="1.8" fill="#f5c542" style={{ transformOrigin: ball + "px 11px" }} />
      </svg>
    </div>
  );
}

function Court({
  snap,
  awayColor,
  homeColor,
  run,
}: {
  snap: LiveSnap;
  awayColor: string;
  homeColor: string;
  run: { teamId: string; us: number; them: number } | null;
}) {
  const shots = [...snap.plays].reverse().filter((p) => p.scoring && p.x !== null && p.y !== null).slice(0, 8);
  return (
    <div className="foil-tile mt-3 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Court</span>
        {run ? <RunChip snap={snap} run={run} /> : null}
      </div>
      <svg viewBox="0 0 50 36" className="h-40 w-full">
        <rect x="0" y="0" width="50" height="36" fill="#14243d" rx="1" />
        <rect x="1" y="1" width="48" height="34" fill="none" stroke="rgba(255,255,255,0.35)" />
        <path d="M4 8 Q25 20 46 8" fill="none" stroke="rgba(255,255,255,0.35)" />
        <line x1="17" y1="0" x2="17" y2="12" stroke="rgba(255,255,255,0.35)" />
        <line x1="33" y1="0" x2="33" y2="12" stroke="rgba(255,255,255,0.35)" />
        {shots.map((p) => (
          <circle
            key={p.id}
            cx={p.x as number}
            cy={Math.max(0, Math.min(35, (p.y as number)))}
            r={p.points >= 3 ? 1.5 : 1}
            fill={p.teamId === snap.homeId ? homeColor : awayColor}
            opacity="0.9"
          />
        ))}
      </svg>
    </div>
  );
}

function Rink({
  snap,
  awayColor,
  homeColor,
  run,
}: {
  snap: LiveSnap;
  awayColor: string;
  homeColor: string;
  run: { teamId: string; us: number; them: number } | null;
}) {
  const shots = [...snap.plays].reverse().filter((p) => p.x !== null && p.y !== null && (p.scoring || /shot/i.test(p.typeText))).slice(0, 10);
  return (
    <div className="foil-tile mt-3 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Ice</span>
        {run ? <RunChip snap={snap} run={run} /> : null}
      </div>
      <svg viewBox="-100 -42 200 84" className="h-28 w-full">
        <rect x="-98" y="-40" width="196" height="80" rx="18" fill="#10243a" stroke="rgba(255,255,255,0.3)" />
        <line x1="0" y1="-40" x2="0" y2="40" stroke="rgba(255,59,92,0.7)" />
        <line x1="-30" y1="-40" x2="-30" y2="40" stroke="rgba(57,255,20,0.45)" />
        <line x1="30" y1="-40" x2="30" y2="40" stroke="rgba(57,255,20,0.45)" />
        {shots.map((p) => (
          <circle key={p.id} cx={p.x as number} cy={(p.y as number) * -1} r="2.2" fill={p.teamId === snap.homeId ? homeColor : awayColor} />
        ))}
      </svg>
    </div>
  );
}

function RunChip({ snap, run }: { snap: LiveSnap; run: { teamId: string; us: number; them: number } }) {
  const abbr = run.teamId === snap.homeId ? snap.homeAbbr : snap.awayAbbr;
  const color = run.teamId === snap.homeId ? snap.homeColor : snap.awayColor;
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider" style={{ color, border: "1px solid " + color }}>
      {abbr} {run.us}–{run.them} run
    </span>
  );
}

function BigBanner({
  play,
  snap,
  awayColor,
  homeColor,
}: {
  play: LivePlay;
  snap: LiveSnap | null;
  awayColor: string;
  homeColor: string;
}) {
  const color = play.teamId && snap?.homeId === play.teamId ? homeColor : awayColor;
  return (
    <div className="banner-in mt-3 rounded-xl px-3 py-3 text-sm font-black text-black" style={{ background: color }}>
      {play.points > 0 ? "+" + play.points + "  " : ""}
      {play.text}
    </div>
  );
}

function PlayList({
  plays,
  fresh,
  snap,
  awayColor,
  homeColor,
}: {
  plays: LivePlay[];
  fresh: string | null;
  snap: LiveSnap | null;
  awayColor: string;
  homeColor: string;
}) {
  if (!plays.length) return null;
  return (
    <ol className="mt-3 space-y-1.5">
      {plays.map((p) => {
        const color = p.teamId && snap?.homeId === p.teamId ? homeColor : p.teamId ? awayColor : "#a1a1aa";
        const big = isBigPlay(p);
        return (
          <li
            key={p.id}
            className={
              "foil-tile px-3 py-2 text-sm " +
              (p.id === fresh ? "play-in " : "") +
              (p.scoring ? "score-flash " : "") +
              (big ? "gold-edge" : "")
            }
            style={p.scoring ? ({ ["--flash" as string]: color } as React.CSSProperties) : undefined}
          >
            <div className="flex items-baseline justify-between gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
              <span style={{ color }}>{p.period} {p.clock}</span>
              {p.scoring ? <span className="font-black" style={{ color }}>+{p.points}</span> : null}
            </div>
            <p className="mt-0.5 text-[color:var(--flat)]">{p.text}</p>
            {p.awayScore !== null && p.homeScore !== null ? (
              <p className="tabular text-[10px] text-zinc-500">
                {snap?.awayAbbr} {p.awayScore} · {snap?.homeAbbr} {p.homeScore}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Tracker({ top, rest, state }: { top: TrackRow[]; rest: TrackRow[]; state: string }) {
  return (
    <section className="mt-4" aria-label="Live versus line">
      <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-purple-200/80">Live vs line</h2>
      <p className="mt-1 mb-2 text-[11px] text-zinc-500">
        Box score against the posted line. Green is on pace. Gold cleared it. Red is behind. Not a pick.
      </p>
      {top.length === 0 ? (
        <p className="panel rounded-xl px-4 py-4 text-sm text-zinc-400">
          {state === "pre" ? "No recent average loaded. The bar starts when the box score does." : "No live stat matched a posted line."}
        </p>
      ) : (
        <ul className="space-y-2">
          {top.map((row) => (
            <TrackTile key={row.id} row={row} />
          ))}
        </ul>
      )}
      {rest.length > 0 ? (
        <details className="fold mt-2">
          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-zinc-500">Show all tracked</summary>
          <ul className="mt-2 space-y-2">
            {rest.map((row) => (
              <TrackTile key={row.id} row={row} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function TrackTile({ row }: { row: TrackRow }) {
  const fill = row.value === null ? 0 : Math.max(0, Math.min(100, (row.value / row.line) * 100));
  const color =
    row.tone === "gold" ? "var(--gold)" : row.tone === "green" ? "var(--plus)" : row.tone === "red" ? "var(--minus)" : "#a1a1aa";
  return (
    <li className={"foil-tile px-3 py-2 " + (row.tone === "gold" ? "gold-burst gold-edge" : "")}>
      <div className="flex items-center gap-2">
        <Mark team={row.team} headshotUrl={row.headshot} label={row.name} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-[color:var(--flat)]">{row.name}</div>
          <div className="truncate text-[11px] text-zinc-500">{row.market} · line {row.line}</div>
        </div>
        <div className="text-right">
          <div className="tabular text-lg font-black" style={{ color }}>
            {row.value === null ? "—" : row.value}
            <span className="text-xs text-zinc-500">/{row.line}</span>
          </div>
          {row.stamp ? <div className="text-[10px] font-black tracking-wider" style={{ color }}>{row.stamp}</div> : null}
          {row.pace !== null ? <div className="text-[10px] text-zinc-500">pace {row.pace}</div> : null}
          {row.valueLabel === "last 5" ? <div className="text-[10px] text-zinc-500">last 5</div> : null}
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: fill + "%", background: color, transition: "width 700ms ease" }} />
      </div>
    </li>
  );
}
