"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import GameChat from "@/components/GameChat";
import Mark from "@/components/Mark";
import MyProps from "@/components/MyProps";
import type { LivePlay, LiveSnap } from "@/lib/live";
import {
  currentDrive,
  isBigPlay,
  isShotAttempt,
  leadChanged,
  playKind,
  playerFromText,
  scoringRun,
  trackProps,
  type PlayKind,
  type TrackProp,
  type TrackRow,
} from "@/lib/tracker";

/** Lift near-black team colors so they read on the dark stage. Same hue, more light. */
function visible(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum >= 0.22) return "#" + m[1];
  const k = lum < 0.06 ? 0.72 : 0.45;
  r = Math.round(r + (255 - r) * k);
  g = Math.round(g + (255 - g) * k);
  b = Math.round(b + (255 - b) * k);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

type Run = { teamId: string; us: number; them: number } | null;

const ICON: Record<PlayKind, string> = {
  three: "③",
  dunk: "💥",
  bucket: "🏀",
  miss: "○",
  ft: "•",
  rebound: "↺",
  turnover: "⇄",
  foul: "✋",
  block: "⛔",
  steal: "⚡",
  sub: "⇅",
  td: "🏈",
  fg: "🥅",
  pass: "➶",
  rush: "➜",
  sack: "✖",
  punt: "⤴",
  pick: "🛑",
  goal: "🚨",
  shot: "◎",
  save: "🧤",
  penalty: "⚑",
  hit: "⚾",
  out: "∅",
  period: "⏱",
  other: "·",
};

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
  const [freshIds, setFreshIds] = useState<string[]>([]);
  const [cinema, setCinema] = useState<LivePlay | null>(null);
  const [bump, setBump] = useState<{ away: number; home: number }>({ away: 0, home: 0 });
  const [tab, setTab] = useState<"play" | "lines" | "chat">("play");
  const seen = useRef<Set<string> | null>(null);
  const scores = useRef<{ away: string | null; home: string | null }>({ away: null, home: null });

  useEffect(() => {
    let stop = false;
    let cinemaTimer: ReturnType<typeof setTimeout> | null = null;
    const pull = async () => {
      try {
        const res = await fetch("/api/live/" + league + "/" + id);
        if (!res.ok) return;
        const data = (await res.json()) as LiveSnap;
        if (stop) return;
        const first = seen.current === null;
        const prior = seen.current ?? new Set<string>();
        const added = first ? [] : data.plays.filter((p) => !prior.has(p.id));
        seen.current = new Set(data.plays.map((p) => p.id));
        setFreshIds(added.map((p) => p.id));
        const big = [...added].reverse().find(isBigPlay);
        if (big) {
          setCinema(big);
          if (cinemaTimer) clearTimeout(cinemaTimer);
          cinemaTimer = setTimeout(() => setCinema(null), 4300);
        }
        if (!first) {
          setBump((b) => ({
            away: data.awayScore !== scores.current.away ? b.away + 1 : b.away,
            home: data.homeScore !== scores.current.home ? b.home + 1 : b.home,
          }));
        }
        scores.current = { away: data.awayScore, home: data.homeScore };
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
      if (cinemaTimer) clearTimeout(cinemaTimer);
    };
  }, [league, id]);

  const rows = useMemo(() => trackProps(props, snap, league), [props, snap, league]);
  const top = rows.slice(0, 8);
  const rest = rows.slice(8);
  const plays = snap ? [...snap.plays].reverse() : [];
  const run = snap ? scoringRun(snap.plays) : null;
  const flipped = snap ? leadChanged(snap.plays) : false;
  const awayColor = visible(snap?.awayColor || "#7c3aed");
  const homeColor = visible(snap?.homeColor || "#39ff14");
  const shown = snap ? { ...snap, awayColor, homeColor } : null;
  const bigChips = plays.filter(isBigPlay).slice(0, 3);
  const vars = { ["--away" as string]: awayColor, ["--home" as string]: homeColor } as React.CSSProperties;

  return (
    <div className="game-stage">
      <div className={tab === "chat" ? "max-lg:hidden" : ""}>
        <MyProps league={league} gameId={id} snap={snap} />
        <div className={tab === "lines" ? "max-lg:hidden" : ""} style={vars}>
          <Hero
            league={league}
            snap={snap}
            away={away}
            home={home}
            awayColor={awayColor}
            homeColor={homeColor}
            cinema={cinema}
            bump={bump}
            freshIds={freshIds}
          />
          {shown && shown.win.length > 1 ? <Momentum snap={shown} flipped={flipped} /> : null}
          {shown ? <PossessionStrip league={league} snap={shown} run={run} /> : null}
          {bigChips.length ? <BigChips plays={bigChips} snap={shown} /> : null}
          {top.length > 0 ? (
            <div className="lg:hidden">
              <Tracker top={top.slice(0, 3)} rest={[]} state={snap?.state ?? "pre"} />
            </div>
          ) : null}
          <Feed plays={plays.slice(0, 30)} freshIds={freshIds} snap={snap} awayColor={awayColor} homeColor={homeColor} />
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

function teamColor(snap: LiveSnap | null, teamId: string | null, awayColor: string, homeColor: string) {
  if (!teamId || !snap) return "#a1a1aa";
  return teamId === snap.homeId ? homeColor : teamId === snap.awayId ? awayColor : "#a1a1aa";
}

function Hero({
  league,
  snap,
  away,
  home,
  awayColor,
  homeColor,
  cinema,
  bump,
  freshIds,
}: {
  league: string;
  snap: LiveSnap | null;
  away: string;
  home: string;
  awayColor: string;
  homeColor: string;
  cinema: LivePlay | null;
  bump: { away: number; home: number };
  freshIds: string[];
}) {
  const live = snap?.state === "in";
  return (
    <div className="tv-hero">
      <div className="tv-bug">
        <div className="tv-team">
          <span className="h-10 w-1.5 rounded-full" style={{ background: awayColor, boxShadow: `0 0 14px ${awayColor}` }} />
          <div>
            <div className="text-xs font-black tracking-wider" style={{ color: awayColor }}>{snap?.awayAbbr || away}</div>
            <span key={"a" + bump.away} className={"tv-score " + (bump.away ? "score-bump" : "")}>{snap?.awayScore ?? "—"}</span>
          </div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white">
            {live ? <span className="tv-live-dot" aria-hidden /> : null}
            {live ? "Live" : snap?.state === "post" ? "Final" : "Soon"}
          </div>
          <div className="tabular mt-0.5 text-sm font-black text-[color:var(--flat)]">{live && snap?.clock ? snap.clock : ""}</div>
          <div className="text-[10px] text-zinc-400">{snap?.detail || ""}</div>
        </div>
        <div className="tv-team justify-end text-right">
          <div>
            <div className="text-xs font-black tracking-wider" style={{ color: homeColor }}>{snap?.homeAbbr || home}</div>
            <span key={"h" + bump.home} className={"tv-score " + (bump.home ? "score-bump" : "")}>{snap?.homeScore ?? "—"}</span>
          </div>
          <span className="h-10 w-1.5 rounded-full" style={{ background: homeColor, boxShadow: `0 0 14px ${homeColor}` }} />
        </div>
      </div>
      <div className="tv-surface">
        {snap ? (
          <Surface league={league} snap={snap} awayColor={awayColor} homeColor={homeColor} freshIds={freshIds} />
        ) : (
          <p className="w-full pb-6 text-center text-sm text-zinc-500">Waiting on the live feed.</p>
        )}
      </div>
      {cinema ? <Cinema play={cinema} color={teamColor(snap, cinema.teamId, awayColor, homeColor)} /> : null}
    </div>
  );
}

function Surface({
  league,
  snap,
  awayColor,
  homeColor,
  freshIds,
}: {
  league: string;
  snap: LiveSnap;
  awayColor: string;
  homeColor: string;
  freshIds: string[];
}) {
  if (league === "nfl" || league === "ncaaf") return <Field snap={snap} awayColor={awayColor} homeColor={homeColor} />;
  if (league === "nba" || league === "wnba" || league === "ncaam")
    return <Court snap={snap} awayColor={awayColor} homeColor={homeColor} freshIds={freshIds} />;
  if (league === "nhl") return <Rink snap={snap} awayColor={awayColor} homeColor={homeColor} freshIds={freshIds} />;
  return null;
}

function Field({ snap, awayColor, homeColor }: { snap: LiveSnap; awayColor: string; homeColor: string }) {
  const drive = currentDrive(snap.plays);
  const offense = drive ? (drive.teamId === snap.homeId ? homeColor : awayColor) : "#a1a1aa";
  const defense = drive ? (drive.teamId === snap.homeId ? awayColor : homeColor) : "#a1a1aa";
  // Offense drives left to right. 10-yard end zones at 0–10 and 110–120.
  const ball = drive ? 10 + (100 - drive.ball) : null;
  const startPlay = drive ? [...snap.plays].reverse().find((p) => p.teamId === drive.teamId && p.yardsToEndzone !== null) : null;
  const start = drive && startPlay?.yardsToEndzone != null ? 10 + (100 - startPlay.yardsToEndzone) : ball;
  const first = drive && drive.firstDown !== null ? 10 + (100 - drive.firstDown) : null;
  return (
    <svg viewBox="0 0 120 54" preserveAspectRatio="xMidYMid meet" aria-label="Field">
      <defs>
        <linearGradient id="turf" x1="0" x2="1">
          <stop offset="0" stopColor="#0b3a1d" />
          <stop offset="0.5" stopColor="#0f4a25" />
          <stop offset="1" stopColor="#0b3a1d" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="120" height="54" rx="2" fill="url(#turf)" />
      <rect x="0" y="0" width="10" height="54" fill={offense} opacity="0.55" />
      <rect x="110" y="0" width="10" height="54" fill={defense} opacity="0.55" />
      {drive?.redZone ? <rect x="90" y="0" width="20" height="54" fill="rgba(255,59,92,0.22)" /> : null}
      {Array.from({ length: 21 }, (_, i) => 10 + i * 5).map((x) => (
        <line key={x} x1={x} y1="0" x2={x} y2="54" stroke="rgba(255,255,255,0.35)" strokeWidth={x % 10 === 0 ? 0.45 : 0.2} />
      ))}
      {[10, 20, 30, 40, 50, 40, 30, 20, 10].map((n, i) => (
        <text key={i} x={20 + i * 10} y="49" fontSize="3.4" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontWeight="700">
          {n}
        </text>
      ))}
      {drive && start !== null && ball !== null ? (
        <>
          <rect x={Math.min(start, ball)} y="24.5" width={Math.abs(ball - start)} height="5" rx="2.5" fill={offense} opacity="0.55" />
          <line className="ball-mark" x1={ball} y1="2" x2={ball} y2="52" stroke="#38bdf8" strokeWidth="0.8" />
          {first !== null ? <line x1={first} y1="2" x2={first} y2="52" stroke="#f5c542" strokeWidth="0.9" /> : null}
          <ellipse className="ball-mark" cx={ball} cy="27" rx="2.2" ry="1.4" fill="#a0522d" stroke="#fff" strokeWidth="0.3" style={{ filter: "drop-shadow(0 0 3px #f5c542)" }} />
        </>
      ) : (
        <text x="60" y="30" fontSize="4" textAnchor="middle" fill="rgba(255,255,255,0.6)">No yard line posted yet</text>
      )}
    </svg>
  );
}

function Court({
  snap,
  awayColor,
  homeColor,
  freshIds,
}: {
  snap: LiveSnap;
  awayColor: string;
  homeColor: string;
  freshIds: string[];
}) {
  const shots = snap.plays.filter(isShotAttempt).slice(-24);
  const line = "rgba(255,255,255,0.4)";
  return (
    <svg viewBox="-1 -1 52 34" preserveAspectRatio="xMidYMax meet" aria-label="Shot chart">
      <defs>
        <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2a1a" />
          <stop offset="1" stopColor="#1b130c" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="50" height="32" fill="url(#wood)" rx="0.6" />
      <rect x="17" y="0" width="16" height="19" fill="color-mix(in srgb, var(--home) 30%, transparent)" stroke={line} strokeWidth="0.2" />
      <circle cx="25" cy="19" r="6" fill="none" stroke={line} strokeWidth="0.2" />
      <path d="M3 0 V14 A23.75 23.75 0 0 0 47 14 V0" fill="none" stroke={line} strokeWidth="0.25" />
      <line x1="22" y1="4" x2="28" y2="4" stroke="#fff" strokeWidth="0.3" />
      <circle cx="25" cy="5.25" r="0.75" fill="none" stroke="#f97316" strokeWidth="0.3" />
      <path d="M19 32 A6 6 0 0 1 31 32" fill="none" stroke={line} strokeWidth="0.2" />
      {shots.map((p) => {
        const color = p.teamId === snap.homeId ? homeColor : awayColor;
        const cx = Math.max(0.5, Math.min(49.5, p.x as number));
        const cy = Math.max(0.5, Math.min(31.5, p.y as number));
        const isNew = freshIds.includes(p.id);
        return (
          <g key={p.id}>
            {isNew && p.scoring ? <circle className="dot-ring" cx={cx} cy={cy} r="1.4" stroke={color} strokeWidth="0.3" /> : null}
            {p.scoring ? (
              <circle className="dot-pop" cx={cx} cy={cy} r={p.points >= 3 ? 1.2 : 0.95} fill={color} stroke="#fff" strokeWidth="0.2" style={{ filter: `drop-shadow(0 0 1.2px ${color})` }} />
            ) : (
              <g className="dot-pop" stroke={color} strokeWidth="0.35" opacity="0.8">
                <line x1={cx - 0.7} y1={cy - 0.7} x2={cx + 0.7} y2={cy + 0.7} />
                <line x1={cx - 0.7} y1={cy + 0.7} x2={cx + 0.7} y2={cy - 0.7} />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Rink({
  snap,
  awayColor,
  homeColor,
  freshIds,
}: {
  snap: LiveSnap;
  awayColor: string;
  homeColor: string;
  freshIds: string[];
}) {
  const shots = snap.plays.filter((p) => p.x !== null && p.y !== null && (p.scoring || /shot|goal/i.test(p.typeText))).slice(-20);
  return (
    <svg viewBox="-100 -43 200 86" preserveAspectRatio="xMidYMid meet" aria-label="Rink">
      <rect x="-99" y="-42" width="198" height="84" rx="26" fill="#dbe9f5" opacity="0.12" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
      <line x1="0" y1="-42" x2="0" y2="42" stroke="rgba(255,59,92,0.8)" strokeWidth="1" />
      <line x1="-25" y1="-42" x2="-25" y2="42" stroke="rgba(56,189,248,0.7)" strokeWidth="1" />
      <line x1="25" y1="-42" x2="25" y2="42" stroke="rgba(56,189,248,0.7)" strokeWidth="1" />
      <circle cx="0" cy="0" r="15" fill="none" stroke="rgba(56,189,248,0.6)" />
      <line x1="-89" y1="-38" x2="-89" y2="38" stroke="rgba(255,59,92,0.6)" />
      <line x1="89" y1="-38" x2="89" y2="38" stroke="rgba(255,59,92,0.6)" />
      {shots.map((p) => {
        const color = p.teamId === snap.homeId ? homeColor : awayColor;
        const cx = p.x as number;
        const cy = -(p.y as number);
        return (
          <g key={p.id}>
            {freshIds.includes(p.id) ? <circle className="dot-ring" cx={cx} cy={cy} r="3" stroke={color} strokeWidth="0.8" /> : null}
            <circle className="dot-pop" cx={cx} cy={cy} r={p.scoring ? 3.4 : 2} fill={p.scoring ? color : "transparent"} stroke={color} strokeWidth="0.8" />
          </g>
        );
      })}
    </svg>
  );
}

const SPARKS = Array.from({ length: 18 }, (_, i) => {
  const a = (i / 18) * Math.PI * 2;
  const r = 90 + (i % 3) * 40;
  return { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r), rot: (i * 47) % 360, delay: (i % 4) * 60 };
});

function Cinema({ play, color }: { play: LivePlay; color: string }) {
  const name = playerFromText(play.text);
  const kind = playKind(play);
  const tag =
    kind === "td" ? "Touchdown" : kind === "three" ? "From deep" : kind === "dunk" ? "Slam" : kind === "goal" ? "Goal" : kind === "pick" ? "Picked off" : kind === "turnover" ? "Turnover" : kind === "block" ? "Rejected" : play.scoring ? "Bucket" : "Big play";
  return (
    <div className="cinema" style={{ ["--team" as string]: color } as React.CSSProperties} role="status" aria-live="polite">
      <div className="cinema-wipe" />
      {SPARKS.map((s, i) => (
        <span
          key={i}
          className="spark"
          style={
            {
              background: i % 2 ? "#f5c542" : "#fff",
              ["--dx" as string]: s.dx + "px",
              ["--dy" as string]: s.dy + "px",
              ["--rot" as string]: s.rot + "deg",
              animationDelay: 250 + s.delay + "ms",
            } as React.CSSProperties
          }
        />
      ))}
      <div className="cinema-copy">
        <div className="text-[11px] font-black uppercase tracking-[0.3em] text-white/80">{tag}</div>
        <div className="cinema-name">{name ?? play.typeText}</div>
        <p className="mt-2 line-clamp-2 max-w-[22rem] text-sm font-semibold text-white/90">{play.text}</p>
        {play.points > 0 ? <span className="cinema-stamp">+{play.points}</span> : null}
      </div>
    </div>
  );
}

function Momentum({ snap, flipped }: { snap: LiveSnap; flipped: boolean }) {
  const pts = snap.win;
  const n = pts.length;
  const xy = pts.map((v, i) => [(i / Math.max(1, n - 1)) * 100, 30 - (v / 100) * 28] as const);
  const d = xy.map(([x, y], i) => (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2)).join(" ");
  const area = d + " L100 30 L0 30 Z";
  const last = pts[n - 1];
  const [lx, ly] = xy[n - 1];
  return (
    <div className={"foil-tile mt-3 px-3 pt-2 pb-1 " + (flipped ? "flip-flash" : "")}>
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em]">
        <span style={{ color: snap.awayColor }}>{snap.awayAbbr} {(100 - last).toFixed(0)}%</span>
        <span className="text-zinc-500">{flipped ? <span className="text-[color:var(--gold)]">Lead change</span> : "Momentum · win chance"}</span>
        <span style={{ color: snap.homeColor }}>{last.toFixed(0)}% {snap.homeAbbr}</span>
      </div>
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="mt-1 h-14 w-full" aria-label="Win chance over the game">
        <defs>
          <linearGradient id="mom" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={snap.homeColor} stopOpacity="0.45" />
            <stop offset="1" stopColor={snap.awayColor} stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <line x1="0" y1="16" x2="100" y2="16" stroke="rgba(255,255,255,0.18)" strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" />
        <path d={area} fill="url(#mom)" />
        <path key={n} className="ribbon-line" d={d} fill="none" stroke={snap.homeColor} strokeWidth="2" vectorEffect="non-scaling-stroke" pathLength={400} />
        <circle cx={lx} cy={ly} r="1.4" fill="#fff" />
      </svg>
    </div>
  );
}

function PossessionStrip({ league, snap, run }: { league: string; snap: LiveSnap; run: Run }) {
  const football = league === "nfl" || league === "ncaaf";
  const drive = football ? currentDrive(snap.plays) : null;
  const lastTeam = [...snap.plays].reverse().find((p) => p.teamId)?.teamId ?? null;
  const holder = football ? drive?.teamId ?? null : lastTeam;
  const runAbbr = run ? (run.teamId === snap.homeId ? snap.homeAbbr : snap.awayAbbr) : null;
  const runColor = run ? (run.teamId === snap.homeId ? snap.homeColor : snap.awayColor) : "";
  const side = (teamId: string, abbr: string, color: string) => {
    const on = holder === teamId && snap.state === "in";
    return (
      <div
        className={"flex-1 rounded-xl border border-white/10 px-3 py-2 text-center " + (on ? "poss-glow" : "")}
        style={{ ["--team" as string]: color } as React.CSSProperties}
      >
        <div className="text-xs font-black" style={{ color }}>{abbr}</div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-400">
          {on ? (football ? "Ball" : "Last play") : "\u00a0"}
        </div>
      </div>
    );
  };
  return (
    <div className="mt-3">
      <div className="flex items-stretch gap-2">
        {side(snap.awayId, snap.awayAbbr, snap.awayColor)}
        {side(snap.homeId, snap.homeAbbr, snap.homeColor)}
      </div>
      {drive ? (
        <p className="mt-1.5 text-center text-[11px] text-zinc-400">
          {drive.plays} plays{drive.yards !== null ? " · " + drive.yards + " yds" : ""}
          {drive.redZone ? <span className="text-[color:var(--minus)]"> · Red zone</span> : null}
        </p>
      ) : null}
      {run && runAbbr ? (
        <p className="mt-1.5 text-center text-sm font-black" style={{ color: runColor }}>
          {runAbbr} on a {run.us}–{run.them} run
        </p>
      ) : null}
    </div>
  );
}

function BigChips({ plays, snap }: { plays: LivePlay[]; snap: LiveSnap | null }) {
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {plays.map((p) => {
        const color = teamColor(snap, p.teamId, snap?.awayColor || "#7c3aed", snap?.homeColor || "#39ff14");
        return (
          <div key={p.id} className="chip-big min-w-[9.5rem] flex-none rounded-xl px-2.5 py-1.5" style={{ ["--team" as string]: color } as React.CSSProperties}>
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-400">
              <span>{p.period.replace(/ Quarter| Period/, "")} {p.clock}</span>
              {p.points > 0 ? <span className="font-black text-[color:var(--gold)]">+{p.points}</span> : null}
            </div>
            <div className="truncate text-xs font-black" style={{ color }}>{playerFromText(p.text) ?? p.typeText}</div>
          </div>
        );
      })}
    </div>
  );
}

function Feed({
  plays,
  freshIds,
  snap,
  awayColor,
  homeColor,
}: {
  plays: LivePlay[];
  freshIds: string[];
  snap: LiveSnap | null;
  awayColor: string;
  homeColor: string;
}) {
  const box = useRef<HTMLOListElement | null>(null);
  const pinned = useRef(true);
  const newest = plays[0]?.id;
  useEffect(() => {
    if (box.current && pinned.current) box.current.scrollTo({ top: 0 });
  }, [newest]);
  if (!plays.length) return null;
  return (
    <section className="mt-4" aria-label="Play by play">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-purple-200/80">Play by play</h2>
      <ol
        ref={box}
        className="feed space-y-1.5 pr-1"
        onScroll={(e) => {
          pinned.current = e.currentTarget.scrollTop < 40;
        }}
      >
        {plays.map((p, i) => {
          const color = teamColor(snap, p.teamId, awayColor, homeColor);
          const kind = playKind(p);
          const big = isBigPlay(p);
          return (
            <li
              key={p.id}
              className={
                "feed-row foil-tile rounded-l-md px-3 py-2 text-sm " +
                (i === 0 ? "newest " : "older ") +
                (freshIds.includes(p.id) ? "feed-spring " : "") +
                (p.scoring ? "score-flash " : "") +
                (big ? "gold-edge" : "")
              }
              style={{ ["--team" as string]: color, ["--flash" as string]: color } as React.CSSProperties}
            >
              <div className="flex items-start gap-2">
                <span className="ico" aria-hidden>{ICON[kind]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-[0.7em] uppercase tracking-wider text-zinc-500">
                    <span style={{ color }}>{p.period} {p.clock}</span>
                    {p.scoring && p.points > 0 ? <span className="font-black" style={{ color }}>+{p.points}</span> : null}
                  </div>
                  <p className="mt-0.5 leading-snug text-[color:var(--flat)]">{p.text}</p>
                  {p.awayScore !== null && p.homeScore !== null && p.scoring ? (
                    <p className="tabular text-[0.7em] text-zinc-500">
                      {snap?.awayAbbr} {p.awayScore} · {snap?.homeAbbr} {p.homeScore}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
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
