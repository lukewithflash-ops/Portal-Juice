"use client";

import { gameRoute } from "@/lib/gameRoute";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LegMeter } from "@/components/LegMeter";
import { useLiveHub, type HubGame } from "@/components/LiveHub";
import { usePrefs } from "@/components/Prefs";

const HIDE_KEY = "pj-banner-hide";
const SLIM_KEY = "pj-banner-slim";

function readSet(key: string): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeSet(key: string, v: string[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify(v.slice(-40)));
  } catch {
    /* private mode */
  }
}

/** Lift very dark team colors so they read on black. */
function lift(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum >= 0.2) return "#" + m[1];
  const k = 0.5;
  const f = (c: number) => Math.round(c + (255 - c) * k);
  return "#" + ((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1);
}

/**
 * Sticky live strip under the pinned header. Your team first, then games with your legs.
 * Swipe or wait to rotate. Tap to open the game.
 */
export default function LiveBanner() {
  const { live } = useLiveHub();
  const { team } = usePrefs();
  const [hidden, setHidden] = useState<string[]>([]);
  const [slim, setSlim] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const touched = useRef(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setHidden(readSet(HIDE_KEY));
      setSlim(readSet(SLIM_KEY));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const games = live.filter((g) => !hidden.includes(g.key));

  // Home-screen app badge: live picks right now (installed app; ignored where unsupported).
  const livePicks = live.reduce((n, g) => n + g.legs.length, 0);
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (!nav.setAppBadge) return;
    (livePicks > 0 ? nav.setAppBadge(livePicks) : nav.clearAppBadge?.())?.catch(() => {});
  }, [livePicks]);

  // Keep the page and sticky bars below the banner.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const el = box.current;
    const chrome = document.querySelector(".site-chrome");
    const set = () => {
      if (chrome) root.style.setProperty("--chrome-h", chrome.getBoundingClientRect().height + "px");
      root.style.setProperty("--live-h", el && games.length ? el.getBoundingClientRect().height + "px" : "0px");
    };
    set();
    const ro = new ResizeObserver(set);
    if (el) ro.observe(el);
    if (chrome) ro.observe(chrome);
    return () => ro.disconnect();
  }, [games.length]);

  useEffect(() => () => document.documentElement.style.setProperty("--live-h", "0px"), []);

  // Rotate every 7s when there is more than one game, unless you just swiped.
  useEffect(() => {
    if (games.length < 2) return;
    const t = setInterval(() => {
      if (Date.now() - touched.current < 12_000) return;
      const el = strip.current;
      if (!el) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % games.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, 7000);
    return () => clearInterval(t);
  }, [games.length]);

  if (!games.length) return null;

  const hide = (k: string) => {
    const v = [...hidden, k];
    setHidden(v);
    writeSet(HIDE_KEY, v);
  };
  const toggle = (k: string) => {
    const v = slim.includes(k) ? slim.filter((x) => x !== k) : [...slim, k];
    setSlim(v);
    writeSet(SLIM_KEY, v);
  };

  return (
    <div
      ref={box}
      className="fixed inset-x-0 z-40"
      style={{ top: "var(--chrome-h, calc(6.6rem + env(safe-area-inset-top)))" }}
      aria-label="Live now"
    >
      <div className="mx-auto max-w-6xl px-2 pt-1.5">
        <div
          ref={strip}
          onScroll={(e) => {
            const el = e.currentTarget;
            setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
          }}
          onTouchStart={() => (touched.current = Date.now())}
          onPointerDown={() => (touched.current = Date.now())}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {games.map((g) => (
            <div key={g.key} className="w-full shrink-0 snap-center px-0.5">
              <GameStrip game={g} favAbbr={team?.abbr ?? null} slim={slim.includes(g.key)} onHide={() => hide(g.key)} onToggle={() => toggle(g.key)} />
            </div>
          ))}
        </div>
        {games.length > 1 ? (
          <div className="mt-1 flex justify-center gap-1" aria-hidden>
            {games.map((g, i) => (
              <span key={g.key} className="h-1 w-3 rounded-full" style={{ background: i === idx ? "var(--gold)" : "rgba(255,255,255,0.25)" }} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GameStrip({
  game,
  favAbbr,
  slim,
  onHide,
  onToggle,
}: {
  game: HubGame;
  favAbbr: string | null;
  slim: boolean;
  onHide: () => void;
  onToggle: () => void;
}) {
  const s = game.snap;
  const r = game.row;
  const awayAbbr = s?.awayAbbr ?? r?.awayAbbr ?? "";
  const homeAbbr = s?.homeAbbr ?? r?.homeAbbr ?? "";
  const awayScore = s?.awayScore ?? r?.awayScore ?? "0";
  const homeScore = s?.homeScore ?? r?.homeScore ?? "0";
  const detail = s?.detail || r?.detail || "Live";
  const favHome = game.fav && favAbbr === homeAbbr;
  const color = lift(
    game.fav ? (favHome ? s?.homeColor : s?.awayColor) ?? "#7c3aed" : s?.homeColor ?? "#7c3aed"
  );
  const other = lift(game.fav ? (favHome ? s?.awayColor : s?.homeColor) ?? "#39ff14" : s?.awayColor ?? "#39ff14");
  const last = s?.plays.length ? s.plays[s.plays.length - 1] : null;
  const hit = game.legs.filter((l) => l.status === "cleared").length;
  const href = gameRoute(game.league, game.id);
  const legsShown = game.legs.filter((l) => l.value !== null).slice(0, 2);

  return (
    <div
      className="banner-in relative overflow-hidden rounded-xl border text-white shadow-lg"
      style={{
        borderColor: color,
        background: `linear-gradient(100deg, color-mix(in srgb, ${color} 55%, #05040a) 0%, color-mix(in srgb, ${other} 22%, #05040a) 100%)`,
        boxShadow: `0 6px 22px -8px ${color}`,
      }}
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="tv-live-dot shrink-0" aria-hidden />
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-2" aria-label={`Open ${awayAbbr} at ${homeAbbr}`}>
          <span className="tabular shrink-0 text-base font-black leading-none">
            {awayAbbr} {awayScore}
            <span className="mx-1 text-white/50">·</span>
            {homeScore} {homeAbbr}
          </span>
          <span className="tabular min-w-0 truncate text-[11px] font-bold text-white/80">{detail}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {game.legs.length ? (
              <span className="rounded-full bg-black/35 px-1.5 py-0.5 text-[10px] font-black" style={{ color: hit ? "var(--gold)" : "#fff" }}>
                {hit}/{game.legs.length} hit
              </span>
            ) : null}
            {game.reasons.includes("team") ? <span className="text-[10px] font-black uppercase tracking-wider text-white/85">Team</span> : null}
            {game.reasons.includes("follow") && !game.reasons.includes("team") ? (
              <span className="text-[10px] font-black text-[color:var(--gold)]" aria-label="Following">★</span>
            ) : null}
          </span>
        </Link>
        <button type="button" onClick={onToggle} aria-label={slim ? "Expand" : "Collapse"} className="shrink-0 px-1 text-sm font-black text-white/80">
          {slim ? "▾" : "▴"}
        </button>
        <button type="button" onClick={onHide} aria-label="Hide this game" className="shrink-0 px-1 text-sm font-black text-white/70">
          ×
        </button>
      </div>
      {!slim ? (
        <Link href={href} className="block border-t border-white/10 px-3 pb-2 pt-1">
          {s?.situation?.text ? (
            <p className="tabular text-[12px] font-black text-white">
              {s.situation.teamId === s.homeId ? s.homeAbbr : s.situation.teamId === s.awayId ? s.awayAbbr : ""} ball · {s.situation.text}
              {s.situation.redZone ? <span className="ml-1 text-[color:var(--minus)]">Red zone</span> : null}
            </p>
          ) : null}
          {last ? <p className="line-clamp-1 text-[11px] font-semibold text-white/90">{last.text.trim()}</p> : null}
          {legsShown.length ? (
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {legsShown.map((l) => (
                <LegMeter key={l.pickId} leg={l} mini />
              ))}
            </div>
          ) : null}
        </Link>
      ) : null}
    </div>
  );
}
