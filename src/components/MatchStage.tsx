"use client";
/**
 * Tennis and UFC live stage: Portal Crew figures on a court or in an octagon. Reactions come only from
 * ESPN's posted score changes (points, games, sets, rounds, the finish). Fixed positions, not tracking.
 */
import { useEffect, useRef, useState } from "react";
import type { Match } from "@/lib/sports";
import { Burst, Chibi } from "@/components/MiniCrew";

const col = (c: string | null | undefined, d: string) => (c && /^#?[0-9a-f]{6}$/i.test(c) ? (c.startsWith("#") ? c : "#" + c) : d);

function tennisReact(prev: Match, m: Match): string | null {
  if (m.state === "post" && prev.state !== "post") return "MATCH! 🏆";
  const sa = m.away.sets.length + m.home.sets.length;
  const pa = prev.away.sets.length + prev.home.sets.length;
  if (sa > pa) return "NEW SET 🔥";
  const last = (e: Match["away"]) => Number.parseInt(e.sets[e.sets.length - 1] ?? "0", 10) || 0;
  const awayUp = last(m.away) > last(prev.away);
  const homeUp = last(m.home) > last(prev.home);
  if (awayUp || homeUp) {
    const server = prev.away.serving ? "away" : prev.home.serving ? "home" : null;
    if (server && ((server === "away" && homeUp) || (server === "home" && awayUp))) return "BREAK! 💥";
    return "Game 💪";
  }
  if (m.point && (m.point.away !== prev.point?.away || m.point.home !== prev.point?.home)) {
    if (m.point.away === "0" && m.point.home === "0") return null;
    return /ad/i.test(`${m.point.away}${m.point.home}`) ? "Advantage 👀" : m.point.away === "40" && m.point.home === "40" ? "Deuce 😬" : "Point!";
  }
  return null;
}

function fightReact(prev: Match, m: Match): string | null {
  const d = m.detail.toLowerCase();
  if (m.state === "post" && prev.state !== "post") return /ko|tko/.test(d) ? "KO! 💥" : /sub/.test(d) ? "Tap out! 🫠" : /dec/.test(d) ? "Decision 🏆" : "FINISH! 🏆";
  const r = m.detail.match(/round (\d+)|r(\d)/i);
  const pr = prev.detail.match(/round (\d+)|r(\d)/i);
  if (r && (!pr || (r[1] ?? r[2]) !== (pr[1] ?? pr[2]))) return `ROUND ${r[1] ?? r[2]} 🔔`;
  return null;
}

export default function MatchStage({ m, kind }: { m: Match; kind: "tennis" | "fight" }) {
  const prev = useRef(m);
  const [fx, setFx] = useState<{ n: number; text: string } | null>(null);
  useEffect(() => {
    const text = kind === "tennis" ? tennisReact(prev.current, m) : fightReact(prev.current, m);
    prev.current = m;
    if (!text) return;
    const t = setTimeout(() => setFx((f) => ({ n: (f?.n ?? 0) + 1, text })), 0);
    const off = setTimeout(() => setFx(null), 1900);
    return () => (clearTimeout(t), clearTimeout(off));
  }, [m, kind]);
  const a = col(m.away.color, kind === "fight" ? "#ff3b5c" : "#22d3ee");
  const h = col(m.home.color, kind === "fight" ? "#38bdf8" : "#c026ff");
  const doubles = kind === "tennis" && (m.away.name.includes("/") || m.home.name.includes("/"));
  const winner = m.state === "post" ? (m.away.winner ? "away" : m.home.winner ? "home" : null) : null;
  return (
    <section className="foil-tile mb-3 overflow-hidden p-2" aria-label={kind === "tennis" ? "Court" : "Octagon"} data-testid={kind === "tennis" ? "tennis-stage" : "fight-stage"}>
      <svg viewBox="0 0 120 70" className="w-full">
        {kind === "tennis" ? (
          <g>
            <rect x="8" y="8" width="104" height="56" rx="1.5" fill="#0b2a4a" stroke="#22d3ee" strokeWidth="0.5" style={{ filter: "drop-shadow(0 0 2px #22d3ee)" }} />
            <rect x="14" y="14" width="92" height="44" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.4" />
            <line x1="60" y1="6" x2="60" y2="66" stroke="#fff" strokeWidth="0.8" />
            <line x1="38" y1="14" x2="38" y2="58" stroke="rgba(255,255,255,0.5)" strokeWidth="0.3" />
            <line x1="82" y1="14" x2="82" y2="58" stroke="rgba(255,255,255,0.5)" strokeWidth="0.3" />
            <line x1="38" y1="36" x2="82" y2="36" stroke="rgba(255,255,255,0.5)" strokeWidth="0.3" />
          </g>
        ) : (
          <g>
            <polygon points="42,4 78,4 104,20 104,50 78,66 42,66 16,50 16,20" fill="#140a24" stroke="#c026ff" strokeWidth="0.9" style={{ filter: "drop-shadow(0 0 3px #c026ff)" }} />
            <circle cx="60" cy="35" r="12" fill="none" stroke="rgba(192,38,255,0.35)" strokeWidth="0.6" />
          </g>
        )}
        <g className="pc-crew">
          {(doubles ? [[24, 26], [30, 46]] : [[22, 38]]).map(([x, y], i) => (
            <Chibi key={"a" + i} x={kind === "fight" ? 46 : x} y={kind === "fight" ? 42 : y} s={kind === "fight" ? 4 : 3.2} color={a} mood={winner === "away" ? "hype" : winner === "home" ? "sad" : m.away.serving && i === 0 ? "swing" : "idle"} delay={i * 200} />
          ))}
          {(doubles ? [[96, 26], [90, 46]] : [[98, 38]]).map(([x, y], i) => (
            <Chibi key={"h" + i} x={kind === "fight" ? 74 : x} y={kind === "fight" ? 42 : y} s={kind === "fight" ? 4 : 3.2} color={h} flip mood={winner === "home" ? "hype" : winner === "away" ? "sad" : m.home.serving && i === 0 ? "swing" : "idle"} delay={i * 200 + 100} />
          ))}
          {fx ? <Burst key={fx.n} x={60} y={36} s={3} text={fx.text} color="#f5c542" /> : null}
        </g>
        <text x="4" y="69" fontSize="3.4" fontWeight="900" fill={a}>{m.away.short}</text>
        <text x="116" y="69" fontSize="3.4" fontWeight="900" fill={h} textAnchor="end">{m.home.short}</text>
      </svg>
    </section>
  );
}
