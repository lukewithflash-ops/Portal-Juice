"use client";

import { NoteSnippet, NoteTag } from "@/components/Notes";
import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { headshotFor } from "@/lib/faces";
import type { LiveAtBat, LivePlay, LiveShot, LiveSnap } from "@/lib/live";
import { legFromPick, TONE_COLOR, type Leg } from "@/lib/motivation";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { playKind, playerFromText } from "@/lib/tracker";

/* ------------------------------------------------------------------ */
/* Play pop: the newest play pops over the stage (non-football sports). */
/* ------------------------------------------------------------------ */

const POP_TAG: Partial<Record<ReturnType<typeof playKind>, string>> = {
  three: "From deep",
  dunk: "Slam",
  bucket: "Bucket",
  ft: "Free throw",
  block: "Rejected",
  steal: "Picked",
  turnover: "Turnover",
  goal: "Goal",
  save: "Save",
  shot: "Shot",
  penalty: "Penalty",
  hit: "Hit",
  out: "Out",
};

export function PlayPop({ play, color, icon }: { play: LivePlay; color: string; icon: string }) {
  const kind = playKind(play);
  const homer = /home run|homers|homered/i.test(play.text);
  const tag = homer ? "Home run" : play.scoring ? (POP_TAG[kind] ?? "Score") : (POP_TAG[kind] ?? play.typeText);
  if (!tag || kind === "period" || kind === "sub") return null;
  const name = playerFromText(play.text);
  return (
    <div key={play.id} className={"play-pop-stage " + (play.scoring ? "is-score" : "")} style={{ ["--team" as string]: color } as React.CSSProperties} role="status" aria-live="polite">
      <span className="play-pop-ring" aria-hidden />
      <span className="play-pop-ico" aria-hidden>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[10px] font-black uppercase tracking-[0.22em]" style={{ color }}>{tag}</span>
        <span className="block truncate text-sm font-black text-white">{name ?? play.typeText}</span>
      </span>
      {play.scoring && play.points > 0 ? <span className="play-pop-pts">+{play.points}</span> : null}
    </div>
  );
}

/* ---------------------------------------- */
/* Basketball shot map (real coordinates). */
/* ---------------------------------------- */

// ESPN's y runs from roughly the rim (dunks sit at 0). Baseline is ~4 ft behind it.
const RIM_Y = 1;
const BASE_Y = RIM_Y - 5.25;

type ZoneId = "ra" | "paint" | "midL" | "midC" | "midR" | "c3L" | "c3R" | "a3L" | "a3C" | "a3R";

/** Which of the 10 standard zones a shot sits in, from its ESPN court spot and its point value. */
export function shotZone(s: Pick<LiveShot, "x" | "y" | "points">): ZoneId {
  const arcY = RIM_Y + Math.sqrt(23.75 ** 2 - 22 ** 2);
  if (s.points === 3) {
    if (s.y < arcY) return s.x < 25 ? "c3L" : "c3R";
    return s.x < 17 ? "a3L" : s.x > 33 ? "a3R" : "a3C";
  }
  if (Math.hypot(s.x - 25, s.y - RIM_Y) <= 4) return "ra";
  if (s.x >= 17 && s.x <= 33 && s.y <= BASE_Y + 19) return "paint";
  return s.x < 17 ? "midL" : s.x > 33 ? "midR" : "midC";
}

/** Cold blue → neon purple → hot gold by real FG%. */
function heat(pct: number): string {
  if (pct >= 0.55) return "#f5c542";
  if (pct >= 0.45) return "#39ff14";
  if (pct >= 0.35) return "#a855f7";
  return "#38bdf8";
}

function zoneTally(shots: Pick<LiveShot, "x" | "y" | "points" | "made">[]) {
  const tally = new Map<ZoneId, { made: number; att: number }>();
  for (const s of shots) {
    const z = shotZone(s);
    const t = tally.get(z) ?? { made: 0, att: 0 };
    t.att += 1;
    if (s.made) t.made += 1;
    tally.set(z, t);
  }
  return tally;
}

/**
 * Spots a zone label may sit on, best first. Each stays inside its zone.
 * The rim label never sits on the rim: it goes just out past the restricted area (or behind the rim).
 */
const LABEL_SPOTS: Record<ZoneId, [number, number][]> = {
  ra: [[25, RIM_Y + 5.4], [25, BASE_Y + 1.5], [25, RIM_Y + 7.2]],
  paint: [[25, 11.6], [25, 13.4], [25, 9.6]],
  midC: [[25, 18.6], [25, 21.2], [25, 16.4]],
  midL: [[9, 9], [9, 4.5], [9, 13.5], [11.5, 17.5], [8.5, 0.5]],
  midR: [[41, 9], [41, 4.5], [41, 13.5], [38.5, 17.5], [41.5, 0.5]],
  c3L: [[1.5, 3], [1.5, -1.5], [1.5, 6.5]],
  c3R: [[48.5, 3], [48.5, -1.5], [48.5, 6.5]],
  a3L: [[6, 25], [6, 30.5], [8.5, 36], [4.5, 20]],
  a3C: [[25, 34], [25, 38.5], [25, 30.5], [25, 41.6]],
  a3R: [[44, 25], [44, 30.5], [41.5, 36], [45.5, 20]],
};

export type ZoneLabel = { z: ZoneId; x: number; y: number; w: number; h: number; text: string; size: number };

/** Place each zone's FG% pill on the spot with the fewest shot markers under it, never on another pill. */
export function placeZoneLabels(shots: Pick<LiveShot, "x" | "y" | "points" | "made">[]): ZoneLabel[] {
  const tally = zoneTally(shots);
  const placed: ZoneLabel[] = [];
  // Busiest zones pick first.
  const zones = (Object.keys(LABEL_SPOTS) as ZoneId[]).filter((z) => (tally.get(z)?.att ?? 0) >= 2).sort((a, b) => tally.get(b)!.att - tally.get(a)!.att);
  for (const z of zones) {
    const t = tally.get(z)!;
    const small = z === "c3L" || z === "c3R";
    const text = small ? `${t.made}/${t.att}` : `${t.made}/${t.att} · ${Math.round((t.made / t.att) * 100)}%`;
    const size = small ? 1.4 : 1.7;
    const w = text.length * size * 0.56 + 1.1;
    const h = size + 0.9;
    let best: ZoneLabel | null = null;
    let bestScore = Infinity;
    LABEL_SPOTS[z].forEach(([cx, cy], i) => {
      const x = Math.max(w / 2 - 0.9, Math.min(50.9 - w / 2, cx));
      const box = { l: x - w / 2 - 0.9, r: x + w / 2 + 0.9, t: cy - h / 2 - 0.9, b: cy + h / 2 + 0.9 };
      const under = shots.filter((s) => s.x >= box.l && s.x <= box.r && s.y >= box.t && s.y <= box.b).length;
      const clash = placed.some((p) => Math.abs(p.x - x) < (p.w + w) / 2 + 0.3 && Math.abs(p.y - cy) < (p.h + h) / 2 + 0.3);
      const score = under * 10 + (clash ? 1000 : 0) + i;
      if (score < bestScore) {
        bestScore = score;
        best = { z, x, y: cy, w, h, text, size };
      }
    });
    if (best) placed.push(best);
  }
  return placed;
}

/** Zone FG% pills. Drawn after the shot markers so nothing covers them. */
function ZoneLabels({ shots }: { shots: LiveShot[] }) {
  const labels = placeZoneLabels(shots);
  return (
    <g aria-label="Zone shooting" data-testid="zone-labels" style={{ pointerEvents: "none" }}>
      {labels.map((l) => (
        <g key={l.z} data-zone={l.z}>
          <rect x={l.x - l.w / 2} y={l.y - l.h / 2} width={l.w} height={l.h} rx={l.h / 2} fill="rgba(6,4,14,0.86)" stroke="rgba(192,132,252,0.55)" strokeWidth="0.12" />
          <text x={l.x} y={l.y} dy="0.36em" fontSize={l.size} fontWeight="900" textAnchor="middle" fill="#fff">
            {l.text}
          </text>
        </g>
      ))}
    </g>
  );
}

function HotZones({ shots, uid }: { shots: LiveShot[]; uid: string }) {
  const arcY = RIM_Y + Math.sqrt(23.75 ** 2 - 22 ** 2);
  const top = 43.25;
  const tally = zoneTally(shots);
  const inside = `M 3 ${BASE_Y} V ${arcY} A 23.75 23.75 0 0 0 47 ${arcY} V ${BASE_Y} Z`;
  const clipIn = `${uid}-in`;
  const maskOut = `${uid}-out`;
  const shapes: Record<ZoneId, { el: React.ReactNode }> = {
    ra: { el: <path d={`M 21 ${BASE_Y} V ${RIM_Y} A 4 4 0 0 0 29 ${RIM_Y} V ${BASE_Y} Z`} /> },
    paint: { el: <rect x="17" y={BASE_Y} width="16" height="19" /> },
    midL: { el: <rect x="0" y={BASE_Y} width="17" height={top - BASE_Y} clipPath={`url(#${clipIn})`} /> },
    midC: { el: <rect x="17" y={BASE_Y + 19} width="16" height={top - BASE_Y - 19} clipPath={`url(#${clipIn})`} /> },
    midR: { el: <rect x="33" y={BASE_Y} width="17" height={top - BASE_Y} clipPath={`url(#${clipIn})`} /> },
    c3L: { el: <rect x="0" y={BASE_Y} width="3" height={arcY - BASE_Y} /> },
    c3R: { el: <rect x="47" y={BASE_Y} width="3" height={arcY - BASE_Y} /> },
    a3L: { el: <rect x="0" y={arcY} width="17" height={top - arcY} mask={`url(#${maskOut})`} /> },
    a3C: { el: <rect x="17" y={arcY} width="16" height={top - arcY} mask={`url(#${maskOut})`} /> },
    a3R: { el: <rect x="33" y={arcY} width="17" height={top - arcY} mask={`url(#${maskOut})`} /> },
  };
  return (
    <g aria-label="Hot zones">
      <defs>
        <clipPath id={clipIn}>
          <path d={inside} />
        </clipPath>
        <mask id={maskOut}>
          <rect x="-1" y={BASE_Y - 1} width="52" height={top - BASE_Y + 2} fill="#fff" />
          <path d={inside} fill="#000" />
        </mask>
      </defs>
      {(Object.keys(shapes) as ZoneId[]).map((z) => {
        const t = tally.get(z);
        if (!t) return null;
        const pct = t.made / t.att;
        const c = heat(pct);
        return (
          <g key={z} fill={c} className={pct >= 0.5 && t.att >= 3 ? "zone-hot" : undefined} style={{ opacity: 0.05 + 0.17 * Math.min(1, t.att / 8) }}>
            {shapes[z].el}
          </g>
        );
      })}
    </g>
  );
}

export function ShotMap({ snap, awayColor, homeColor, freshIds }: { snap: LiveSnap; awayColor: string; homeColor: string; freshIds: string[] }) {
  const [team, setTeam] = useState<"all" | "away" | "home">("all");
  const [zones, setZones] = useState(true);
  const uid = useId().replace(/:/g, "");
  const all = snap.shots ?? [];
  const shown = all.filter((s) => team === "all" || (team === "home" ? s.teamId === snap.homeId : s.teamId === snap.awayId));
  if (all.length < 3) return null;
  const line = (side: "away" | "home") => {
    const id = side === "home" ? snap.homeId : snap.awayId;
    const mine = all.filter((s) => s.teamId === id);
    const threes = mine.filter((s) => s.points === 3);
    return { fg: `${mine.filter((s) => s.made).length}/${mine.length}`, three: `${threes.filter((s) => s.made).length}/${threes.length}` };
  };
  const a = line("away");
  const h = line("home");
  const stroke = "rgba(255,255,255,0.35)";
  const arcY = RIM_Y + Math.sqrt(23.75 ** 2 - 22 ** 2);
  return (
    <section className="foil-tile mt-3 p-3" aria-label="Shot map">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-purple-200/80">Shot map</h2>
        <div className="flex gap-1">
          {(["all", "away", "home"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTeam(k)}
              className={"rounded-md px-2 py-0.5 text-[11px] font-black " + (team === k ? "bg-white/15 text-white" : "text-zinc-500")}
              style={k !== "all" && team === k ? { color: k === "home" ? homeColor : awayColor } : undefined}
            >
              {k === "all" ? "Both" : k === "home" ? snap.homeAbbr : snap.awayAbbr}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={`-1 ${BASE_Y - 1} 52 ${43.5 - BASE_Y}`} className="mt-2 w-full" aria-label="Half court with every field goal attempt">
        <defs>
          <radialGradient id="shot-floor" cx="50%" cy="0%" r="100%">
            <stop offset="0" stopColor="#24123c" />
            <stop offset="1" stopColor="#0a0612" />
          </radialGradient>
        </defs>
        <rect x="0" y={BASE_Y} width="50" height={43.25 - BASE_Y} rx="1" fill="url(#shot-floor)" stroke="#a855f7" strokeWidth="0.35" style={{ filter: "drop-shadow(0 0 1.5px #a855f7)" }} />
        <rect x="17" y={BASE_Y} width="16" height="19" fill="rgba(168,85,247,0.08)" stroke={stroke} strokeWidth="0.2" />
        <circle cx="25" cy={BASE_Y + 19} r="6" fill="none" stroke={stroke} strokeWidth="0.2" />
        <path d={`M 3 ${BASE_Y} V ${arcY} A 23.75 23.75 0 0 0 47 ${arcY} V ${BASE_Y}`} fill="none" stroke={stroke} strokeWidth="0.25" />
        <line x1="22" y1={BASE_Y + 4} x2="28" y2={BASE_Y + 4} stroke="#fff" strokeWidth="0.3" />
        <circle cx="25" cy={RIM_Y} r="0.75" fill="none" stroke="#f97316" strokeWidth="0.3" />
        <path d={`M 19 43.25 A 6 6 0 0 1 31 43.25`} fill="none" stroke={stroke} strokeWidth="0.2" />
        {zones ? <HotZones shots={shown} uid={uid} /> : null}
        {shown.map((s: LiveShot) => {
          const color = s.teamId === snap.homeId ? homeColor : awayColor;
          const isNew = freshIds.includes(s.id);
          const cx = Math.max(0.5, Math.min(49.5, s.x));
          const cy = Math.max(BASE_Y + 0.5, Math.min(43, s.y));
          return s.made ? (
            <g key={s.id}>
              {isNew ? <circle className="dot-ring" cx={cx} cy={cy} r="1.6" stroke={color} strokeWidth="0.3" fill="none" /> : null}
              <circle className={isNew ? "dot-pop" : undefined} cx={cx} cy={cy} r="0.85" fill={color} stroke="#fff" strokeWidth="0.15" />
            </g>
          ) : (
            <g key={s.id} stroke={color} strokeWidth="0.3" opacity="0.7" className={isNew ? "dot-pop" : undefined}>
              <line x1={cx - 0.6} y1={cy - 0.6} x2={cx + 0.6} y2={cy + 0.6} />
              <line x1={cx - 0.6} y1={cy + 0.6} x2={cx + 0.6} y2={cy - 0.6} />
            </g>
          );
        })}
        {zones ? <ZoneLabels shots={shown} /> : null}
      </svg>
      <div className="mt-1.5 flex items-center justify-between text-[11px] font-bold">
        <span style={{ color: awayColor }}>{snap.awayAbbr} FG {a.fg} · 3PT {a.three}</span>
        <span className="text-zinc-500">● made ✕ missed</span>
        <span style={{ color: homeColor }}>{snap.homeAbbr} FG {h.fg} · 3PT {h.three}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-[10px] text-zinc-500">ESPN court spots. Zones glow by real FG%: blue cold, purple, green, gold hot. Free throws not plotted.</p>
        <button type="button" onClick={() => setZones((z) => !z)} className={"flex-none rounded-md px-1.5 py-0.5 text-[10px] font-black " + (zones ? "bg-white/10 text-white" : "text-zinc-500")} aria-pressed={zones}>
          Hot zones
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------ */
/* MLB pitch map for the current at-bat.       */
/* ------------------------------------------ */

const CALL_COLOR = { ball: "#38bdf8", strike: "#ff3b5c", foul: "#f5c542", play: "#a855f7" } as const;
const CALL_WORD = { ball: "Ball", strike: "Strike", foul: "Foul", play: "In play" } as const;
// ESPN pitch coordinates: the called-strike cloud sits about here. Drawn as a guide only.
const ZONE = { x: 84, y: 146, w: 62, h: 50 };

export function PitchMap({ atBat, live, freshIds }: { atBat: LiveAtBat; live: boolean; freshIds: string[] }) {
  const xs = atBat.pitches.map((p) => p.x);
  const ys = atBat.pitches.map((p) => p.y);
  const minX = Math.min(ZONE.x - 30, ...xs) - 8;
  const maxX = Math.max(ZONE.x + ZONE.w + 30, ...xs) + 8;
  const minY = Math.min(ZONE.y - 34, ...ys) - 8;
  const maxY = Math.max(ZONE.y + ZONE.h + 34, ...ys) + 8;
  const last = atBat.pitches[atBat.pitches.length - 1];
  return (
    <section className="foil-tile mt-3 p-3" aria-label="Pitch map">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-purple-200/80">{live && !atBat.final ? "This at-bat" : "Last at-bat"}</h2>
        <span className="text-[11px] text-zinc-500">{atBat.pitches.length} pitch{atBat.pitches.length === 1 ? "" : "es"}{atBat.bats ? ` · bats ${atBat.bats}` : ""}</span>
      </div>
      {atBat.text ? <p className="mt-0.5 text-sm font-black text-[color:var(--flat)]">{atBat.text}</p> : null}
      <div className="mt-2 flex gap-3">
        <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} className="h-56 w-auto flex-none" style={{ aspectRatio: `${maxX - minX} / ${maxY - minY}` }} aria-label="Pitch locations">
          <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY} rx="8" fill="#0a0612" />
          <rect x={ZONE.x} y={ZONE.y} width={ZONE.w} height={ZONE.h} fill="rgba(168,85,247,0.08)" stroke="#a855f7" strokeWidth="1.6" style={{ filter: "drop-shadow(0 0 4px #a855f7)" }} />
          {[1, 2].map((i) => (
            <g key={i} stroke="rgba(168,85,247,0.35)" strokeWidth="0.6">
              <line x1={ZONE.x + (ZONE.w * i) / 3} y1={ZONE.y} x2={ZONE.x + (ZONE.w * i) / 3} y2={ZONE.y + ZONE.h} />
              <line x1={ZONE.x} y1={ZONE.y + (ZONE.h * i) / 3} x2={ZONE.x + ZONE.w} y2={ZONE.y + (ZONE.h * i) / 3} />
            </g>
          ))}
          <path d={`M ${ZONE.x + ZONE.w / 2 - 14} ${maxY - 10} h 28 v 5 l -14 6 l -14 -6 z`} fill="rgba(255,255,255,0.7)" />
          {atBat.pitches.map((p) => {
            const isNew = freshIds.includes(p.id) || p === last;
            return (
              <g key={p.id} className={isNew ? "pitch-in" : undefined}>
                {p === last ? <circle cx={p.x} cy={p.y} r="11" fill="none" stroke={CALL_COLOR[p.call]} strokeWidth="1.2" className="dot-ring" /> : null}
                <circle cx={p.x} cy={p.y} r="7.5" fill={CALL_COLOR[p.call]} stroke="#fff" strokeWidth="1" style={{ filter: `drop-shadow(0 0 3px ${CALL_COLOR[p.call]})` }} />
                <text x={p.x} y={p.y + 3.2} fontSize="9" fontWeight="900" textAnchor="middle" fill="#05040a">{p.n}</text>
              </g>
            );
          })}
        </svg>
        <ol className="min-w-0 flex-1 space-y-1 text-[11px]">
          {atBat.pitches.map((p) => (
            <li key={p.id} className="flex items-start gap-1.5">
              <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full text-[9px] font-black text-black" style={{ background: CALL_COLOR[p.call] }}>{p.n}</span>
              <span className="leading-tight text-zinc-300">
                <span className="font-bold text-white">{p.label}</span>
                {p.pitch ? ` · ${p.pitch}` : ""}
                {p.mph ? ` ${p.mph}` : ""}
              </span>
            </li>
          ))}
          {atBat.result ? <li className="pt-1 font-black text-[color:var(--gold)]">{atBat.result}</li> : null}
        </ol>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-400">
        {(Object.keys(CALL_COLOR) as (keyof typeof CALL_COLOR)[]).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: CALL_COLOR[k] }} />
            {CALL_WORD[k]}
          </span>
        ))}
        <span>ESPN pitch spots · zone box is a guide</span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* Your player spotlight: logged player picks in this game.      */
/* ------------------------------------------------------------ */

export function Spotlight({ league, gameId, snap }: { league: string; gameId: string; snap: LiveSnap | null }) {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const legs = useMemo(() => {
    const out: (Leg & { settled: string })[] = [];
    for (const p of picks) {
      if (p.gameId !== gameId || !p.market) continue;
      const leg = legFromPick(p, snap);
      if (leg) out.push({ ...leg, settled: p.status });
    }
    return out;
  }, [picks, gameId, snap]);
  if (!legs.length) return null;
  return (
    <section className="spotlight mt-3" aria-label="Your player spotlight">
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="text-[10px] font-black uppercase tracking-[0.22em] tone-gold">Your player spotlight</h2>
        <span className="text-[10px] text-zinc-500">Live box vs your line</span>
      </div>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {legs.map((l) => {
          const color = TONE_COLOR[l.tone];
          const face = headshotFor(league, l.athleteId);
          const pct = l.value === null ? 0 : Math.max(0, Math.min(1, l.value / l.line));
          const word =
            l.status === "cleared" ? (l.side === "Over" ? "Cleared" : "Held") : l.status === "missed" ? "Missed" : l.status === "waiting" ? "Soon" : l.status === "no-match" ? "Not in box" : l.tone === "green" ? "On pace" : l.tone === "red" ? "Behind" : "Tracking";
          return (
            <li key={l.pickId} className="spot-tile flex-none" style={{ ["--team" as string]: color } as React.CSSProperties}>
              <div className="flex items-center gap-2">
                {face ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={face} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover" style={{ border: `2px solid ${color}`, boxShadow: `0 0 10px ${color}` }} referrerPolicy="no-referrer" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xs font-black text-white" style={{ border: `2px solid ${color}` }}>
                    {l.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-[13px] font-black text-white">{l.name}</span>
                    <NoteTag player={{ name: l.name, id: l.athleteId ?? null }} />
                  </div>
                  <div className="truncate text-[10px] font-bold uppercase tracking-wider" style={{ color: l.side === "Over" ? "var(--plus)" : "#38bdf8" }}>
                    {l.plus ? "" : l.side + " "}{l.lineText ?? l.line} {l.market}
                  </div>
                </div>
              </div>
              <div className="mt-1.5 flex items-end justify-between">
                <span className="tabular text-2xl font-black leading-none" style={{ color }}>
                  {l.value ?? "—"}
                  <span className="text-xs text-zinc-500">/{l.lineText ?? l.line}</span>
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider" style={{ color }}>{word}</span>
              </div>
              {/* Meter: the tick is the line. Over fills toward it; Under is safe while it stays left of it. */}
              <div className="spot-meter mt-1.5" aria-label={`${l.value ?? 0} of ${l.lineText ?? l.line}`}>
                <div className="spot-fill" style={{ width: `${Math.min(100, pct * 80)}%`, background: color }} />
                <span className="spot-tick" style={{ left: "80%" }} />
              </div>
              <div className="mt-1 text-[10px] text-zinc-500">{l.pace !== null && !l.final ? `pace ${l.pace}` : l.final ? "Final" : l.progress}</div>
              {picks.find((p) => p.id === l.pickId) ? <NoteSnippet pick={picks.find((p) => p.id === l.pickId)!} /> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------------------------------------------- */
/* Win-chance swing flash.                         */
/* ---------------------------------------------- */

export type Swing = { n: number; delta: number; side: "away" | "home"; abbr: string; color: string };

/** Biggest single-play move in ESPN's home win chance among the newest points, if 10+ points. */
export function bigSwing(prev: number[], next: number[]): number | null {
  if (next.length < 2 || next.length <= prev.length) return null;
  const from = Math.max(1, prev.length);
  let best = 0;
  for (let i = from; i < next.length; i++) {
    const d = next[i] - next[i - 1];
    if (Math.abs(d) > Math.abs(best)) best = d;
  }
  return Math.abs(best) >= 10 ? Math.round(best) : null;
}

export function SwingBanner({ swing }: { swing: Swing }) {
  return (
    <div key={swing.n} className="swing-wrap" role="status" aria-live="polite">
      <div className="swing-banner" style={{ ["--team" as string]: swing.color } as React.CSSProperties}>
        <span className="swing-word">Swing</span>
        <span className="swing-num">+{Math.abs(swing.delta)}%</span>
        <span className="swing-abbr">{swing.abbr} win chance</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------- */
/* Share final: a PNG of the final score.          */
/* ---------------------------------------------- */

export function ShareFinal({ league, id, label }: { league: string; id: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const src = `/api/final/${league}/${id}`;
  async function share() {
    setBusy(true);
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error("image");
      const blob = await res.blob();
      const file = new File([blob], `portal-juice-final-${league}-${id}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: `${label} · Final`, text: `${label} · Final via Portal Juice` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    } catch {
      /* share sheet closed or image failed; nothing to do */
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={share} disabled={busy} className="share-final rounded-lg px-3 py-1.5 text-xs font-black text-white">
      <span className="portal-ring" aria-hidden style={{ width: "0.9rem", height: "0.9rem", ["--glow" as string]: "#39ff14" } as React.CSSProperties} />
      {busy ? "Making image…" : "Share final"}
    </button>
  );
}
