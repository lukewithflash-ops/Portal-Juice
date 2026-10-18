"use client";
/**
 * Every new play, drawn where ESPN says it happened: a run along the ground, a pass in the air, a shot to the rim.
 * Renders inside the field/court/rink/pitch/diamond SVG (same coordinates). Web Animations on transform and
 * opacity only; reduced motion jumps to the end state. Your logged players get the gold portal ring.
 */
import { useEffect, useRef } from "react";
import type { VizSpec } from "@/lib/playViz";

/** Your logged player in this play. onBall: they are at the end of the ball's flight (the receiver), not the passer. */
export type VizMine = { name: string; face: string | null; onBall: boolean } | null;

type Pt = [number, number];
const arc = (a: Pt, b: Pt, h: number, n = 14): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - h * 4 * t * (1 - t)];
  });
const line = (a: Pt, b: Pt): Pt[] => [a, b];
const tf = (p: Pt) => ({ transform: `translate(${p[0].toFixed(2)}px, ${p[1].toFixed(2)}px)` });

/** A move: which element, through which points, how long, starting when. */
type Step = { el: "a" | "b"; pts: Pt[]; ms: number; at: number; fade?: boolean };

/** Where the animated pieces go, per sport. Positions are in the surface's own SVG units. */
function plan(s: VizSpec): { steps: Step[]; end: Pt; burst: Pt | null; tag: string | null; tagAt: Pt; size: number; ballOnly?: boolean } | null {
  if (s.sport === "football") {
    const y = s.y;
    const a: Pt = [s.x1, y];
    const b: Pt = [s.x2, y];
    switch (s.kind) {
      case "run":
      case "sack":
      case "other":
        return { steps: [{ el: "a", pts: line(a, b), ms: 1000, at: 0 }], end: b, burst: s.td ? b : null, tag: s.td ? "TD" : s.turnover ? "TURNOVER" : s.kind === "sack" ? "SACK" : null, tagAt: b, size: 2.4 };
      case "pass": {
        const qb: Pt = [s.x1 - s.dir * 3, 27];
        return {
          steps: [
            { el: "a", pts: line([s.x1, 27], qb), ms: 320, at: 0 },
            { el: "b", pts: arc(qb, b, Math.min(12, 3 + Math.abs(s.x2 - s.x1) * 0.35)), ms: 760, at: 320 },
          ],
          end: b,
          burst: s.td ? b : null,
          tag: s.td ? "TD" : s.turnover ? "PICKED" : null,
          tagAt: b,
          size: 2.4,
        };
      }
      case "incomplete": {
        const qb: Pt = [s.x1 - s.dir * 3, 27];
        const to: Pt = [s.target ?? s.x1 + s.dir * 4, y];
        return {
          steps: [
            { el: "a", pts: line([s.x1, 27], qb), ms: 300, at: 0 },
            { el: "b", pts: [...arc(qb, to, 6), [to[0] + s.dir * 1.5, to[1] + 3]], ms: 800, at: 300, fade: true },
          ],
          end: qb,
          burst: null,
          tag: "INC",
          tagAt: to,
          size: 2.4,
        };
      }
      case "punt":
      case "kickoff":
        return { steps: [{ el: "b", pts: arc(a, b, 16, 18), ms: 1300, at: 0 }], end: b, burst: s.td ? b : null, tag: s.kind === "punt" ? "PUNT" : "KICKOFF", tagAt: b, size: 2.4, ballOnly: true };
      case "fg":
      case "xp": {
        const hold: Pt = [s.x1 - s.dir * 7, 27];
        const posts: Pt = [s.x2, 27];
        return { steps: [{ el: "b", pts: arc(hold, posts, 14, 16), ms: 1200, at: 0 }], end: posts, burst: s.good ? posts : null, tag: s.good ? "GOOD" : s.good === false ? "NO GOOD" : null, tagAt: posts, size: 2.4, ballOnly: true };
      }
      case "penalty":
        return { steps: [{ el: "a", pts: line(a, b), ms: 900, at: 350 }], end: b, burst: null, tag: "FLAG", tagAt: a, size: 2.4 };
    }
  }
  if (s.sport === "court") {
    const rim: Pt = [25, 5.25];
    if (s.kind === "shot" && s.x !== null && s.y !== null) {
      const from: Pt = [Math.max(0.5, Math.min(49.5, s.x)), Math.max(0.5, Math.min(31.5, s.y))];
      const miss: Pt[] = s.made ? [] : [[rim[0] + 2, rim[1] + 2.5]];
      return { steps: [{ el: "b", pts: [...arc(from, rim, 4 + Math.hypot(from[0] - 25, from[1] - 5) * 0.12), ...miss], ms: 900, at: 0, fade: !s.made }], end: from, burst: s.made ? rim : null, tag: s.made ? `+${s.points || 2}` : "MISS", tagAt: rim, size: 1 };
    }
    if (s.kind === "ft") {
      const line: Pt = [25, 19];
      return { steps: [{ el: "b", pts: [...arc(line, rim, 3.5), ...(s.made ? [] : ([[rim[0] + 1.6, rim[1] + 2]] as Pt[]))], ms: 800, at: 0, fade: !s.made }], end: line, burst: s.made ? rim : null, tag: s.made ? "+1" : "FT MISS", tagAt: rim, size: 1 };
    }
    return null;
  }
  if (s.sport === "rink") {
    if (s.x === null || s.y === null || s.net === null) return null;
    const from: Pt = [s.x, -s.y];
    const net: Pt = [s.net, 0];
    return { steps: [{ el: "b", pts: line(from, s.kind === "goal" ? net : [from[0] + (net[0] - from[0]) * 0.85, from[1] * 0.3]), ms: 600, at: 0, fade: s.kind !== "goal" }], end: from, burst: s.kind === "goal" ? net : null, tag: s.kind === "goal" ? "GOAL" : s.kind === "save" ? "SAVE" : null, tagAt: net, size: 3.2 };
  }
  if (s.sport === "pitch") {
    if (s.x === null || s.y === null || s.attacksRight === null) return null;
    const goal: Pt = [s.attacksRight ? 116 : 4, 36];
    return { steps: [{ el: "b", pts: arc([s.x, s.y], goal, 2), ms: 750, at: 0, fade: s.kind !== "goal" }], end: [s.x, s.y], burst: s.kind === "goal" ? goal : null, tag: s.kind === "goal" ? "GOAL" : s.kind === "save" ? "SAVED" : null, tagAt: goal, size: 2.2 };
  }
  if (s.sport === "diamond") {
    const plate: Pt = [60, 64];
    const bases: Pt[] = [plate, [82, 42], [60, 20], [38, 42], plate];
    const steps: Step[] = [];
    let at = 0;
    if (s.angle !== null) {
      const r = s.kind === "hr" ? 70 : s.deep ? 44 : 22;
      const rad = (s.angle * Math.PI) / 180;
      const land: Pt = [60 + Math.sin(rad) * r, 64 - Math.cos(rad) * r];
      steps.push({ el: "b", pts: s.deep ? arc(plate, land, 12) : line(plate, land), ms: 750, at: 0, fade: s.kind === "hr" });
      at = 400;
    }
    if (s.bases > 0) steps.push({ el: "a", pts: bases.slice(0, s.bases + 1), ms: 320 * s.bases, at });
    if (!steps.length) return { steps: [], end: plate, burst: null, tag: s.kind === "k" ? "K" : s.kind === "out" ? "OUT" : null, tagAt: [60, 30], size: 2.2 };
    return { steps, end: s.bases ? bases[Math.min(4, s.bases)] : plate, burst: s.kind === "hr" ? [60, 40] : null, tag: s.kind === "hr" ? "HR" : s.kind === "walk" ? "BB" : s.kind === "out" ? "OUT" : null, tagAt: [60, 30], size: 2.2 };
  }
  return null;
}

export default function PlayViz({ spec, color, mine, onDone }: { spec: VizSpec; color: string; mine: VizMine; onDone?: () => void }) {
  const a = useRef<SVGGElement | null>(null);
  const b = useRef<SVGGElement | null>(null);
  const fx = useRef<SVGGElement | null>(null);
  const p = plan(spec);
  useEffect(() => {
    if (!p) {
      const t = setTimeout(() => onDone?.(), 1400);
      return () => clearTimeout(t);
    }
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const anims: Animation[] = [];
    let total = 0;
    for (const st of p.steps) {
      const el = st.el === "a" ? a.current : b.current;
      if (!el) continue;
      const frames = st.pts.map((pt, i) => ({ ...tf(pt), opacity: st.fade && i === st.pts.length - 1 ? 0.25 : 1 }));
      el.style.opacity = "1";
      if (reduce || typeof el.animate !== "function") {
        Object.assign(el.style, frames[frames.length - 1]);
        continue;
      }
      Object.assign(el.style, frames[0]);
      anims.push(el.animate(frames, { duration: st.ms, delay: st.at, easing: st.pts.length > 2 ? "linear" : "cubic-bezier(.25,.7,.25,1)", fill: "both" }));
      total = Math.max(total, st.at + st.ms);
    }
    const f = fx.current;
    if (f) {
      if (reduce || typeof f.animate !== "function") f.style.opacity = "1";
      else anims.push(f.animate([{ opacity: 0, transform: "scale(0.4)" }, { opacity: 1, transform: "scale(1.15)", offset: 0.5 }, { opacity: 1, transform: "scale(1)" }], { duration: 420, delay: total, fill: "both", easing: "ease-out" }));
    }
    const t = setTimeout(() => onDone?.(), reduce ? 1200 : Math.max(1100, total + 650));
    return () => {
      clearTimeout(t);
      anims.forEach((x) => x.cancel());
    };
    // One run per play.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id]);
  if (!p) return null;
  const sz = p.size;
  const start = p.steps[0]?.pts[0] ?? p.end;
  const gold = "#f5c542";
  const clipId = `vz-face-${spec.id}`;
  const ringA = !!mine && !mine.onBall;
  const label = ringA ? mine!.name : spec.player;
  const marker = (
    <g>
      {ringA && mine ? (
        <>
          <circle r={sz * 1.9} fill="none" stroke={gold} strokeWidth={sz * 0.35} className="viz-portal" style={{ filter: `drop-shadow(0 0 ${sz}px ${gold})` }} />
          <circle r={sz * 1.35} fill="#0b0618" stroke="#c026ff" strokeWidth={sz * 0.18} />
          {mine.face ? (
            <>
              <clipPath id={clipId}>
                <circle r={sz * 1.25} />
              </clipPath>
              <image href={mine.face} x={-sz * 1.25} y={-sz * 1.25} width={sz * 2.5} height={sz * 2.5} clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
            </>
          ) : (
            <circle r={sz * 0.8} fill={gold} />
          )}
        </>
      ) : (
        <circle r={sz * 0.75} fill={color} stroke="#fff" strokeWidth={sz * 0.14} />
      )}
      {label ? (
        <text y={-sz * (ringA ? 2.4 : 1.3)} fontSize={sz * (ringA ? 1.1 : 0.95)} fontWeight="900" textAnchor="middle" fill={ringA ? gold : "#fff"} style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.75)", strokeWidth: sz * 0.3 }}>
          {label}
        </text>
      ) : null}
    </g>
  );
  const runPts = p.steps.find((s) => s.el === "a")?.pts;
  return (
    <g className={"play-viz" + (mine ? " viz-mine" : "") + (spec.big === "turnover" ? " viz-glitch" : "")} data-testid="play-viz" data-kind={spec.kind} data-mine={mine ? "1" : undefined} pointerEvents="none">
      {/* Trail under the runner: the ground the play covered. Glows gold for your player. */}
      {runPts && runPts.length > 1 ? (
        <polyline
          className="viz-trail"
          points={runPts.map((q) => q.join(",")).join(" ")}
          fill="none"
          stroke={ringA ? gold : color}
          strokeWidth={sz * (spec.big === "gain" || ringA ? 0.9 : 0.55)}
          strokeLinecap="round"
          pathLength={1}
          style={{ filter: ringA || spec.big === "gain" ? `drop-shadow(0 0 ${sz * 0.8}px ${ringA ? gold : color})` : undefined, animationDelay: `${p.steps.find((s) => s.el === "a")?.at ?? 0}ms`, animationDuration: `${p.steps.find((s) => s.el === "a")?.ms ?? 900}ms` }}
        />
      ) : null}
      {spec.sport === "football" && spec.kind === "penalty" ? (
        <g transform={`translate(${start[0]} ${start[1] - 4})`} className="viz-flag">
          <path d="M0 0 l2.4 -1.2 l-2.4 -1.2 z" fill="#f5c542" stroke="#000" strokeWidth="0.15" />
          <line x1="0" y1="0" x2="0" y2="3" stroke="#f5c542" strokeWidth="0.3" />
        </g>
      ) : null}
      {!p.ballOnly ? (
        <g ref={a} style={{ ...tf(start), opacity: 1 }}>
          {marker}
        </g>
      ) : null}
      <g ref={b} style={{ ...tf(p.steps.find((s) => s.el === "b")?.pts[0] ?? start), opacity: p.steps.some((s) => s.el === "b") ? 1 : 0 }}>
        {spec.sport === "football" ? (
          <ellipse rx={sz * 0.85} ry={sz * 0.55} fill="#a0522d" stroke="#fff" strokeWidth={sz * 0.12} style={{ filter: `drop-shadow(0 0 ${sz * 0.6}px ${gold})` }} />
        ) : (
          <circle r={sz * 0.6} fill={spec.sport === "court" ? "#f97316" : spec.sport === "rink" ? "#111" : "#fff"} stroke={spec.sport === "rink" ? "#fff" : "#000"} strokeWidth={sz * 0.12} />
        )}
        {mine?.onBall ? (
          <>
            <circle r={sz * 1.9} fill="none" stroke={gold} strokeWidth={sz * 0.35} className="viz-portal" style={{ filter: `drop-shadow(0 0 ${sz}px ${gold})` }} />
            {mine.face ? (
              <>
                <clipPath id={clipId + "b"}>
                  <circle r={sz * 1.25} />
                </clipPath>
                <circle r={sz * 1.35} fill="#0b0618" stroke="#c026ff" strokeWidth={sz * 0.18} />
                <image href={mine.face} x={-sz * 1.25} y={-sz * 1.25} width={sz * 2.5} height={sz * 2.5} clipPath={`url(#${clipId}b)`} preserveAspectRatio="xMidYMid slice" />
              </>
            ) : null}
            <text y={-sz * 2.4} fontSize={sz * 1.1} fontWeight="900" textAnchor="middle" fill={gold} style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.75)", strokeWidth: sz * 0.3 }}>
              {mine.name}
            </text>
          </>
        ) : null}
        {p.ballOnly && label && !mine?.onBall ? (
          <text y={-sz * 1.4} fontSize={sz * 0.95} fontWeight="900" textAnchor="middle" fill={mine ? gold : "#fff"} style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.75)", strokeWidth: sz * 0.3 }}>
            {label}
          </text>
        ) : null}
      </g>
      <g ref={fx} style={{ opacity: 0, transformBox: "fill-box", transformOrigin: "center" } as React.CSSProperties}>
        {p.burst ? (
          <g transform={`translate(${p.burst[0]} ${p.burst[1]})`}>
            {Array.from({ length: 10 }, (_, i) => {
              const ang = (i / 10) * Math.PI * 2;
              return <line key={i} x1={Math.cos(ang) * sz * 1.2} y1={Math.sin(ang) * sz * 1.2} x2={Math.cos(ang) * sz * 3.2} y2={Math.sin(ang) * sz * 3.2} stroke={mine ? gold : color} strokeWidth={sz * 0.3} strokeLinecap="round" />;
            })}
            <circle r={sz * 2.2} fill="none" stroke={mine ? gold : "#fff"} strokeWidth={sz * 0.25} />
          </g>
        ) : null}
        {p.tag ? (
          <text x={p.tagAt[0]} y={p.tagAt[1] - sz * 3} fontSize={sz * 1.5} fontWeight="900" textAnchor="middle" fill={spec.big === "turnover" ? "#ff3b5c" : p.burst ? gold : "#fff"} style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.8)", strokeWidth: sz * 0.35 }}>
            {p.tag}
          </text>
        ) : null}
      </g>
    </g>
  );
}
