"use client";
/**
 * Portal Crew: our own neon chibi figures for the live stage. Original Portal style: glowing outline,
 * a portal ring under the feet, big head, tiny body. Placed only where ESPN data says (shot spots,
 * occupied bases, the batter's posted side). Fielders are a fixed formation, drawn dim as a backdrop.
 * Transform/opacity CSS only; reduced motion freezes everything.
 */
import type { LivePlay, LiveSnap } from "@/lib/live";

export function Chibi({ x, y, s, color, mood = "idle", num, flip, dim, delay = 0 }: { x: number; y: number; s: number; color: string; mood?: "idle" | "jump" | "sad" | "hype" | "swing" | "throw" | "run"; num?: string | null; flip?: boolean; dim?: boolean; delay?: number }) {
  return (
    <g transform={`translate(${x} ${y})${flip ? " scale(-1 1)" : ""}`} opacity={dim ? 0.55 : 1}>
      <ellipse className="pc-ring" rx={s * 1.1} ry={s * 0.35} fill="none" stroke={color} strokeWidth={s * 0.18} style={{ filter: `drop-shadow(0 0 ${s * 0.5}px ${color})`, animationDelay: `${delay}ms` }} />
      <g className={`pc-body pc-${mood}`} style={{ animationDelay: `${delay}ms` }}>
        <rect x={-s * 0.55} y={-s * 1.5} width={s * 1.1} height={s * 1.2} rx={s * 0.35} fill="#0b0618" stroke={color} strokeWidth={s * 0.16} style={{ filter: `drop-shadow(0 0 ${s * 0.4}px ${color})` }} />
        {num ? (
          <text y={-s * 0.62} fontSize={s * 0.62} fontWeight="900" textAnchor="middle" fill="#fff">{num}</text>
        ) : null}
        <line x1={-s * 0.25} y1={-s * 0.3} x2={-s * 0.3} y2={0} stroke={color} strokeWidth={s * 0.2} strokeLinecap="round" />
        <line x1={s * 0.25} y1={-s * 0.3} x2={s * 0.3} y2={0} stroke={color} strokeWidth={s * 0.2} strokeLinecap="round" />
        <g className="pc-arms">
          <line x1={-s * 0.55} y1={-s * 1.2} x2={-s * 0.95} y2={mood === "jump" || mood === "hype" ? -s * 2.1 : -s * 0.7} stroke={color} strokeWidth={s * 0.18} strokeLinecap="round" />
          <line x1={s * 0.55} y1={-s * 1.2} x2={s * 0.95} y2={mood === "jump" || mood === "hype" || mood === "throw" ? -s * 2.1 : mood === "swing" ? -s * 1.6 : -s * 0.7} stroke={color} strokeWidth={s * 0.18} strokeLinecap="round" />
          {mood === "swing" ? <line x1={s * 0.95} y1={-s * 1.6} x2={s * 2.0} y2={-s * 2.4} stroke="#f5c542" strokeWidth={s * 0.2} strokeLinecap="round" /> : null}
        </g>
        <circle cy={-s * 2.25} r={s * 0.82} fill="#0b0618" stroke={color} strokeWidth={s * 0.18} style={{ filter: `drop-shadow(0 0 ${s * 0.5}px ${color})` }} />
        <circle cy={-s * 2.25} r={s * 0.5} fill="none" stroke="#c026ff" strokeWidth={s * 0.06} opacity="0.7" />
        {mood === "sad" ? (
          <path d={`M${-s * 0.32} ${-s * 2.25} h${s * 0.18} M${s * 0.14} ${-s * 2.25} h${s * 0.18} M${-s * 0.2} ${-s * 1.9} q${s * 0.2} ${-s * 0.15} ${s * 0.4} 0`} stroke="#fff" strokeWidth={s * 0.1} fill="none" strokeLinecap="round" />
        ) : (
          <>
            <circle cx={-s * 0.25} cy={-s * 2.3} r={s * 0.13} fill="#fff" />
            <circle cx={s * 0.25} cy={-s * 2.3} r={s * 0.13} fill="#fff" />
          </>
        )}
      </g>
    </g>
  );
}

/** Emote burst text, floats up and fades. */
export function Burst({ x, y, s, text, color }: { x: number; y: number; s: number; text: string; color: string }) {
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <circle className="pc-flash" r={s * 2.2} fill="none" stroke={color} strokeWidth={s * 0.25} />
      <text className="pc-burst" y={-s * 3.4} fontSize={s * 1.3} fontWeight="900" textAnchor="middle" fill="#fff" style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.8)", strokeWidth: s * 0.3 }}>{text}</text>
    </g>
  );
}

const isShot = (p: LivePlay) => p.x !== null && p.y !== null && !/free throw/i.test(p.typeText + p.text) && /shot|layup|dunk|jumper|hook|tip|three point|makes|misses/i.test(p.typeText + " " + p.text);

function shotEmote(p: LivePlay): string {
  const t = p.text.toLowerCase();
  if (!p.scoring) return /block/.test(t) ? "🚫 Rejected" : "😬 Clank";
  if (/dunk/.test(t)) return "💥 Slam";
  if (p.points >= 3) return "💦 Splash";
  if (/and one|and-1/.test(t)) return "💪 And-1";
  if (/layup/.test(t)) return "🎯 Bucket";
  return "🔥 Bucket";
}

// Half-court formation spots (ESPN feet, rim at 25,5.25). Illustrative, not tracking.
const OFF: [number, number][] = [[25, 26], [8, 18], [42, 18], [6, 4], [44, 4]];
const DEF: [number, number][] = [[25, 21], [12, 15], [38, 15], [14, 6], [36, 6]];

/** Basketball: 10 on the floor, 5 per side. Offense = team of the newest play; the newest shooter stands at ESPN's real spot. Older shots are faint markers. */
export function CourtCrew({ snap, awayColor, homeColor, freshIds }: { snap: LiveSnap; awayColor: string; homeColor: string; freshIds: string[] }) {
  const shots = snap.plays.filter(isShot).slice(-24);
  const last = shots[shots.length - 1];
  const lastPlay = [...snap.plays].reverse().find((p) => p.teamId);
  const offHome = (lastPlay?.teamId ?? last?.teamId) === snap.homeId;
  const offC = offHome ? homeColor : awayColor;
  const defC = offHome ? awayColor : homeColor;
  const other = [...snap.plays].reverse().slice(0, 3).find((p) => /steal|block/i.test(p.text) && freshIds.includes(p.id));
  const shooterNow = !!last && lastPlay === last;
  const sx = last ? Math.max(1.5, Math.min(48.5, last.x as number)) : 0;
  const sy = last ? Math.max(3.5, Math.min(31.5, last.y as number)) : 0;
  // Shooter takes the nearest offensive spot.
  let si = -1;
  if (shooterNow) {
    let best = Infinity;
    OFF.forEach(([x, y], i) => { const d = (x - sx) ** 2 + (y - sy) ** 2; if (d < best) { best = d; si = i; } });
  }
  return (
    <g className="pc-crew" data-testid="court-crew">
      {shots.filter((p) => p !== last || !shooterNow).map((p) => {
        const color = p.teamId === snap.homeId ? homeColor : awayColor;
        const x = Math.max(0.5, Math.min(49.5, p.x as number));
        const y = Math.max(0.5, Math.min(31.5, p.y as number));
        return p.scoring ? <circle key={p.id} cx={x} cy={y} r="0.45" fill={color} opacity="0.45" /> : <path key={p.id} d={`M${x - 0.35} ${y - 0.35} l0.7 0.7 m0 -0.7 l-0.7 0.7`} stroke={color} strokeWidth="0.18" opacity="0.4" />;
      })}
      {DEF.map(([x, y], i) => <Chibi key={"d" + i} x={x} y={y} s={1.15} color={defC} delay={i * 210} flip={x > 25} />)}
      {OFF.map(([x, y], i) => (i === si ? null : <Chibi key={"o" + i} x={x} y={y} s={1.15} color={offC} delay={i * 190 + 90} flip={x > 25} />))}
      {shooterNow && last ? (
        <g className="pc-newest" key={last.id}>
          <Chibi x={sx} y={sy} s={1.6} color={offC} mood={last.scoring ? "jump" : "sad"} flip={sx > 25} />
          <circle className={"pc-ball " + (last.scoring ? "pc-in" : "pc-out")} r="0.55" fill="#f97316" stroke="#000" strokeWidth="0.1" style={{ ["--fx" as string]: `${sx}px`, ["--fy" as string]: `${sy - 3}px`, ["--tx" as string]: "25px", ["--ty" as string]: "5.25px" } as React.CSSProperties} />
          {last.scoring ? <path className="pc-net" d="M24.3 5.6 L24.6 7.2 L25 6 L25.4 7.2 L25.7 5.6" stroke="#fff" strokeWidth="0.15" fill="none" /> : null}
          {freshIds.includes(last.id) ? <Burst x={sx} y={sy - 0.5} s={1} text={shotEmote(last)} color={offC} /> : null}
        </g>
      ) : null}
      {other ? <Burst x={25} y={20} s={1} text={/steal/i.test(other.text) ? "🫳 Picked" : "🚫 Rejected"} color={other.teamId === snap.homeId ? homeColor : awayColor} /> : null}
    </g>
  );
}

/** Scoring run from ESPN's posted scores: points by one side since the other last scored. */
export function scoringRun(snap: LiveSnap): { side: "home" | "away"; pts: number; opp: number } | null {
  const scored = snap.plays.filter((p) => p.scoring && p.awayScore !== null && p.homeScore !== null);
  if (scored.length < 2) return null;
  const sideOf = (i: number) => {
    const p = scored[i];
    const prev = i > 0 ? scored[i - 1] : null;
    if (!prev) return p.teamId === snap.homeId ? "home" : "away";
    return (p.homeScore ?? 0) > (prev.homeScore ?? 0) ? "home" : "away";
  };
  const side = sideOf(scored.length - 1);
  let start = scored.length - 1;
  while (start > 0 && sideOf(start - 1) === side) start--;
  if (start === 0) return null; // window starts mid-run; can't see where it began
  const base = scored[start - 1];
  const end = scored[scored.length - 1];
  const pts = side === "home" ? (end.homeScore ?? 0) - (base.homeScore ?? 0) : (end.awayScore ?? 0) - (base.awayScore ?? 0);
  return pts > 0 ? { side, pts, opp: 0 } : null;
}

/** Combo meter: glows bigger the longer the run. Real scores only. */
export function RunMeter({ snap, awayColor, homeColor }: { snap: LiveSnap; awayColor: string; homeColor: string }) {
  const r = scoringRun(snap);
  if (!r || r.pts < 5) return null;
  const color = r.side === "home" ? homeColor : awayColor;
  const abbr = r.side === "home" ? snap.homeAbbr : snap.awayAbbr;
  const lvl = Math.min(5, Math.floor(r.pts / 3));
  return (
    <div className="pc-runmeter" style={{ ["--team" as string]: color } as React.CSSProperties} data-testid="run-meter">
      <b>{abbr} {r.pts}-0 RUN</b>
      <span className="pc-run-bar">{Array.from({ length: 5 }, (_, i) => <i key={i} className={i < lvl ? "on" : ""} />)}</span>
    </div>
  );
}

const PITCH_EMOTE = { ball: "Ball", strike: "Strike! 🔥", foul: "Foul", play: "In play 💥" } as const;

function playEmote(t: string): string | null {
  const s = t.toLowerCase();
  if (/homered|home run/.test(s)) return "🎆 GONE!";
  if (/struck out/.test(s)) return "K! 🔥";
  if (/tripled/.test(s)) return "Triple! 💨";
  if (/doubled/.test(s) && !/double play/.test(s)) return "Double! 💪";
  if (/singled/.test(s)) return "Hit!";
  if (/walked/.test(s)) return "Walk";
  if (/double play/.test(s)) return "DP! 😬";
  if (/grounded|flied|lined|popped|out/.test(s)) return "Out 😬";
  return null;
}

/** Baseball: pitcher, batter on ESPN's posted side, runners on ESPN's occupied bases, a dim fielding formation. */
export function DiamondCrew({ snap, awayColor, homeColor, freshIds }: { snap: LiveSnap; awayColor: string; homeColor: string; freshIds: string[] }) {
  const bug = snap.bug;
  if (!bug) return null;
  const bat = bug.half === "bottom" ? homeColor : awayColor;
  const fld = bug.half === "bottom" ? awayColor : homeColor;
  const ab = snap.atBat;
  const lefty = /^l/i.test(ab?.bats ?? "");
  const pitches = ab && !ab.final ? ab.pitches : [];
  const lp = pitches[pitches.length - 1];
  const lastPlay = [...snap.plays].reverse().find((p) => p.text && playEmote(p.text));
  const fresh = lastPlay && freshIds.includes(lastPlay.id) ? lastPlay : null;
  const em = fresh ? playEmote(fresh.text) : null;
  const hr = !!fresh && /homered|home run/i.test(fresh.text);
  const outs = bug.outs ?? 0;
  // 1B, 2B, SS, 3B, LF, CF, RF (+ pitcher and catcher below) = 9 fielders.
  const fielders: [number, number][] = [[80, 36], [70, 27], [50, 27], [40, 36], [30, 14], [60, 9], [90, 14]];
  return (
    <g className="pc-crew" data-testid="diamond-crew">
      {fielders.map(([x, y], i) => <Chibi key={"f" + i} x={x} y={y} s={1.6} color={fld} delay={i * 230} />)}
      <Chibi x={60} y={43} s={1.9} color={fld} mood={lp ? "throw" : "idle"} />
      <Chibi x={60} y={70} s={1.5} color={fld} />
      {bug.onFirst ? <Chibi x={84} y={45} s={1.7} color={bat} mood="run" delay={100} /> : null}
      {bug.onSecond ? <Chibi x={63} y={22} s={1.7} color={bat} mood="run" delay={300} /> : null}
      {bug.onThird ? <Chibi x={36} y={45} s={1.7} color={bat} mood="run" delay={500} /> : null}
      <Chibi x={lefty ? 66 : 54} y={65} s={1.9} color={bat} mood="swing" flip={lefty} />
      {lp ? (
        <g key={lp.id}>
          <circle className="pc-pitch" r="0.9" fill="#fff" stroke="#000" strokeWidth="0.15" />
          <Burst x={60} y={58} s={1.3} text={PITCH_EMOTE[lp.call] + (lp.mph ? ` ${Math.round(lp.mph)}` : "")} color={lp.call === "strike" ? "#ff3b5c" : lp.call === "ball" ? "#38bdf8" : "#f5c542"} />
        </g>
      ) : null}
      {em && fresh ? <Burst key={fresh.id} x={60} y={30} s={2} text={em} color={hr ? "#f5c542" : bat} /> : null}
      {hr ? (
        <g className="pc-fireworks" key={"fw" + fresh!.id}>
          {[[25, 10], [95, 8], [60, 4]].map(([x, y], k) => (
            <g key={k} transform={`translate(${x} ${y})`}>
              {Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return <line key={i} x1="0" y1="0" x2={Math.cos(a) * 6} y2={Math.sin(a) * 6} stroke={["#f5c542", "#c026ff", "#22d3ee"][k]} strokeWidth="0.6" strokeLinecap="round" />; })}
            </g>
          ))}
        </g>
      ) : null}
      <g transform="translate(6 62)">
        <text fontSize="3.4" fontWeight="900" fill="#fff">OUTS</text>
        {[0, 1, 2].map((i) => <circle key={i} cx={15 + i * 4.2} cy={-1.2} r="1.5" fill={i < outs ? "#ff3b5c" : "rgba(255,255,255,0.15)"} style={i < outs ? { filter: "drop-shadow(0 0 2px #ff3b5c)" } : undefined} />)}
      </g>
      {bug.balls !== null || bug.strikes !== null ? (
        <text x="114" y="62" fontSize="4" fontWeight="900" textAnchor="end" fill="#fff">{bug.balls ?? 0}-{bug.strikes ?? 0}</text>
      ) : null}
    </g>
  );
}

/* ---------- Football: 11 v 11 at ESPN's posted line of scrimmage (fixed formation) ---------- */
export function FieldCrew({ snap, ball, dir, offense, defense, freshIds }: { snap: LiveSnap; ball: number | null; dir: 1 | -1; offense: string; defense: string; freshIds: string[] }) {
  if (ball === null) return null;
  // Offense: 5 OL on the line, QB, RB, 2 WR wide, TE, slot. Defense: 4 DL, 3 LB, 2 CB, 2 S. Offsets in yards behind (-) / past (+) the line.
  const off: [number, number][] = [[-1.5, 21], [-1.5, 24], [-1.5, 27], [-1.5, 30], [-1.5, 33], [-5, 27], [-9, 27], [-1.5, 6], [-1.5, 48], [-1.5, 37], [-3, 15]];
  const def: [number, number][] = [[1.5, 22], [1.5, 25.5], [1.5, 29], [1.5, 32.5], [5, 18], [5, 27], [5, 36], [2.5, 7], [2.5, 47], [12, 18], [12, 36]];
  const at = (dx: number) => Math.max(2, Math.min(118, ball + dx * dir));
  const fresh = [...snap.plays].reverse().find((p) => freshIds.includes(p.id));
  const t = fresh ? `${fresh.typeText} ${fresh.text}`.toLowerCase() : "";
  const em = !fresh ? null : /touchdown/.test(t) ? "TD! 🔥" : /intercept/.test(t) ? "Picked! 😱" : /fumble/.test(t) && fresh.turnover ? "Fumble! 😬" : /sack/.test(t) ? "Sacked 💥" : /field goal/.test(t) && /good/.test(t) ? "It's good! 🎯" : (fresh.yards ?? 0) >= 20 ? "Big gain! 💨" : (fresh.yards ?? 0) >= (fresh.distance ?? 99) && !fresh.penalty ? "1st down 💪" : null;
  return (
    <g className="pc-crew" data-testid="field-crew">
      {def.map(([dx, y], i) => <Chibi key={"d" + i} x={at(dx)} y={y + 3} s={1.15} color={defense} delay={i * 130} flip={dir > 0} />)}
      {off.map(([dx, y], i) => <Chibi key={"o" + i} x={at(dx)} y={y + 3} s={1.15} color={offense} mood={i === 5 && fresh ? "throw" : "idle"} delay={i * 120 + 60} flip={dir < 0} />)}
      {em && fresh ? <Burst key={fresh.id} x={60} y={20} s={2.2} text={em} color={/picked|fumble|sack/i.test(em) ? "#ff3b5c" : offense} /> : null}
    </g>
  );
}

/* ---------- Hockey: 5 skaters + goalie per side (fixed formation) ---------- */
export function RinkCrew({ snap, awayColor, homeColor, freshIds }: { snap: LiveSnap; awayColor: string; homeColor: string; freshIds: string[] }) {
  // Rink x -100..100. Away defends the left net here, home the right (matches ESPN coordinates as drawn).
  const left: [number, number][] = [[-84, 0], [-55, -18], [-55, 18], [-20, -24], [-12, 0], [-20, 24]];
  const right = left.map(([x, y]) => [-x, y] as [number, number]);
  const fresh = [...snap.plays].reverse().find((p) => freshIds.includes(p.id));
  const t = fresh ? `${fresh.typeText} ${fresh.text}`.toLowerCase() : "";
  const em = !fresh ? null : fresh.scoring && /goal/.test(t) ? "GOAL! 🚨" : /save/.test(t) ? "Save 🧤" : /penalty/.test(t) ? "Penalty ⏱️" : /\bhit\b/.test(t) ? "Hit! 💥" : /blocked/.test(t) ? "Blocked 🛡️" : /shot/.test(t) ? "Shot 🎯" : null;
  const col = fresh?.teamId === snap.homeId ? homeColor : awayColor;
  return (
    <g className="pc-crew" data-testid="rink-crew">
      {left.map(([x, y], i) => <Chibi key={"a" + i} x={x} y={y + 6} s={3.4} color={awayColor} delay={i * 150} />)}
      {right.map(([x, y], i) => <Chibi key={"h" + i} x={x} y={y + 6} s={3.4} color={homeColor} flip delay={i * 150 + 80} />)}
      {em && fresh ? <Burst key={fresh.id} x={fresh.x ?? 0} y={-(fresh.y ?? 0)} s={4} text={em} color={col} /> : null}
    </g>
  );
}

/* ---------- Soccer: 11 v 11 incl. keepers, 4-4-2 (fixed formation) ---------- */
export function PitchCrew({ snap, awayColor, homeColor, freshIds }: { snap: LiveSnap; awayColor: string; homeColor: string; freshIds: string[] }) {
  // Away defends the left goal, home the right (as the pitch is drawn).
  const left: [number, number][] = [[8, 36], [22, 18], [22, 30], [22, 42], [22, 54], [38, 16], [38, 30], [38, 42], [38, 56], [52, 28], [52, 44]];
  const right = left.map(([x, y]) => [120 - x, y] as [number, number]);
  const fresh = [...snap.plays].reverse().find((p) => freshIds.includes(p.id));
  const t = fresh ? `${fresh.typeText} ${fresh.text}`.toLowerCase() : "";
  const Y = "c" + "ard";
  const em = !fresh ? null : fresh.scoring || /^goal/.test(t) ? "GOAL! ⚽🔥" : /saved|save/.test(t) ? "Save 🧤" : new RegExp(`red ${Y}|sent off`).test(t) ? "Sent off 🟥" : new RegExp(`yellow ${Y}|booked`).test(t) ? "Booked 🟨" : /corner/.test(t) ? "Corner 🚩" : /shot|attempt/.test(t) ? "Shot 🎯" : /offside/.test(t) ? "Offside 🚫" : null;
  const col = fresh?.teamId === snap.homeId ? homeColor : awayColor;
  return (
    <g className="pc-crew" data-testid="pitch-crew">
      {left.map(([x, y], i) => <Chibi key={"a" + i} x={x} y={y + 2} s={1.6} color={awayColor} delay={i * 110} />)}
      {right.map(([x, y], i) => <Chibi key={"h" + i} x={x} y={y + 2} s={1.6} color={homeColor} flip delay={i * 110 + 50} />)}
      {em && fresh ? <Burst key={fresh.id} x={60} y={30} s={2.2} text={em} color={col} /> : null}
    </g>
  );
}
