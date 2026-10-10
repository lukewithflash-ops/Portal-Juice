"use client";

import { useState } from "react";
import { setSound, soundOn, type Emote , crowdOn, setCrowd } from "@/lib/emotes";

const ICON: Record<Emote["kind"], string> = {
  td: "🏈", fg: "🥅", first: "⛓️", sack: "💢", turnover: "🔄", gain: "💨",
  three: "🔥", dunk: "💥", block: "⛔", hr: "⚾", k: "K", hit: "⚾", goal: "🚨", save: "🧤", score: "✨",
};

const BURST = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2;
  return { dx: Math.round(Math.cos(a) * 110), dy: Math.round(Math.sin(a) * 70), d: (i % 3) * 70 };
});

/** One short (≤1.5s) emote over the broadcast graphic. Transform/opacity only, so it stays smooth on phones. */
export function EmoteLayer({ emote, color }: { emote: Emote | null; color: string }) {
  if (!emote) return null;
  const k = emote.kind;
  return (
    <div key={emote.id} className={`emote emote-${k} ${emote.bad ? "emote-bad" : ""}`} style={{ ["--team" as string]: color } as React.CSSProperties} aria-live="polite" role="status">
      {k === "td" || k === "goal" || k === "hr" ? <div className="emote-flash" /> : null}
      {emote.bad ? <div className="emote-red" /> : null}
      {k === "td" || k === "hr" || k === "goal"
        ? BURST.map((b, i) => (
            <span key={i} className="emote-spark" style={{ ["--dx" as string]: b.dx + "px", ["--dy" as string]: b.dy + "px", animationDelay: b.d + "ms", background: i % 2 ? "#f5c542" : "var(--team)" } as React.CSSProperties} />
          ))
        : null}
      {k === "gain" ? (
        <div className="emote-streaks">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{ top: 25 + i * 14 + "%", animationDelay: i * 50 + "ms" }} />
          ))}
        </div>
      ) : null}
      {k === "first" ? <div className="emote-chain" /> : null}
      {k === "goal" ? <div className="emote-lamp" /> : null}
      {k === "hr" ? (
        <svg className="emote-arc" viewBox="0 0 200 100" aria-hidden>
          <path d="M20 95 Q100 -30 185 40" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeDasharray="4 4" pathLength={100} />
          <circle r="5" fill="#fff">
            <animateMotion dur="1s" path="M20 95 Q100 -30 185 40" fill="freeze" />
          </circle>
        </svg>
      ) : null}
      {k === "fg" ? (
        <svg className="emote-post" viewBox="0 0 60 70" aria-hidden>
          <path d="M30 70 V40 M10 40 H50 M10 40 V5 M50 40 V5" stroke="#f5c542" strokeWidth="4" fill="none" strokeLinecap="round" />
        </svg>
      ) : null}
      <div className="emote-core">
        <span className={k === "k" ? "emote-k" : "emote-icon"}>{ICON[k]}</span>
        <span className="emote-label">{emote.label}</span>
      </div>
    </div>
  );
}

/** Sound is off unless you turn it on. Saved on this device. */
export function CrowdToggle() {
  const [on, setOn] = useState(() => (typeof window === "undefined" ? false : crowdOn()));
  return (
    <button
      type="button"
      aria-pressed={on}
      title={on ? "Crowd noise on" : "Crowd noise off"}
      onClick={() => {
        setCrowd(!on);
        setOn(!on);
      }}
      className={"rounded-md bg-black/40 px-1.5 py-0.5 text-[11px] " + (on ? "text-white" : "text-white/50")}
    >
      {on ? "📣" : "🤫"}
    </button>
  );
}

export function SoundToggle() {
  const [on, setOn] = useState(() => (typeof window === "undefined" ? false : soundOn()));
  return (
    <button
      type="button"
      aria-pressed={on}
      title={on ? "Sound on" : "Sound off"}
      onClick={() => {
        setSound(!on);
        setOn(!on);
      }}
      className="rounded-md bg-black/40 px-1.5 py-0.5 text-[11px] text-white/80"
    >
      {on ? "🔊" : "🔇"}
    </button>
  );
}
