"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getNotes, subscribeNotes } from "@/lib/noteStore";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { wrapWeek, type Wrapped } from "@/lib/wrapped";

const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
const rec = (t: { w: number; l: number; p: number }) => `${t.w}-${t.l}${t.p ? `-${t.p}` : ""}`;

type Screen = { k: string; kicker: string; big: string; sub: string; tone: string };

function screensOf(w: Wrapped): Screen[] {
  const out: Screen[] = [
    { k: "intro", kicker: "Portal Wrapped", big: `${fmt(w.from)} – ${fmt(w.to)}`, sub: "Your week in the Log", tone: "#a855f7" },
    { k: "record", kicker: "Record", big: rec(w.record), sub: w.record.pct != null ? `${w.record.pct}% of decided picks hit${w.record.open ? ` · ${w.record.open} still open` : ""}` : w.record.open ? `${w.record.open} open, nothing settled yet` : "No settled picks this week", tone: "#39ff14" },
  ];
  if (w.best) out.push({ k: "best", kicker: "Best hit", big: w.best.title, sub: w.best.sub, tone: "#facc15" });
  out.push({ k: "streak", kicker: "Longest win streak", big: `${w.longest}`, sub: w.longest === 1 ? "win in a row" : "wins in a row", tone: "#fb7185" });
  if (w.parlays.total) out.push({ k: "parlays", kicker: "Parlays", big: `${w.parlays.hit}/${w.parlays.total}`, sub: "parlays hit", tone: "#22d3ee" });
  if (w.noted) out.push({ k: "noted", kicker: "Most noted", big: w.noted.name, sub: `${w.noted.n} note${w.noted.n === 1 ? "" : "s"} this week`, tone: "#c084fc" });
  if (w.stat) out.push({ k: "stat", kicker: "Hottest stat", big: w.stat.key, sub: `${rec(w.stat.t)} · ${w.stat.t.pct}%`, tone: "#f97316" });
  if (w.league) out.push({ k: "league", kicker: "Hottest league", big: w.league.key, sub: `${rec(w.league.t)} · ${w.league.t.pct}%`, tone: "#4ade80" });
  out.push({ k: "share", kicker: "Share it", big: "Your week, in neon", sub: "W/L/P only. No money.", tone: "#a855f7" });
  return out;
}

/** 1080×1920 neon PNG of the week. */
export async function wrappedPng(w: Wrapped): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1920;
  const g = c.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, 1080, 1920);
  bg.addColorStop(0, "#14062b");
  bg.addColorStop(0.55, "#05030b");
  bg.addColorStop(1, "#06210c");
  g.fillStyle = bg;
  g.fillRect(0, 0, 1080, 1920);
  // Portal rings.
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.strokeStyle = i % 2 ? "rgba(57,255,20,0.18)" : "rgba(168,85,247,0.22)";
    g.lineWidth = 6;
    g.arc(540, 520, 180 + i * 46, 0, Math.PI * 2);
    g.stroke();
  }
  const glow = (color: string, blur: number) => {
    g.shadowColor = color;
    g.shadowBlur = blur;
  };
  g.textAlign = "center";
  glow("#a855f7", 30);
  g.fillStyle = "#ffffff";
  g.font = "900 64px system-ui, -apple-system, sans-serif";
  g.fillText("PORTAL WRAPPED", 540, 170);
  g.font = "700 38px system-ui, -apple-system, sans-serif";
  g.fillStyle = "#d8b4fe";
  glow("transparent", 0);
  g.fillText(`${fmt(w.from)} – ${fmt(w.to)}`, 540, 235);
  glow("#39ff14", 50);
  g.fillStyle = "#ffffff";
  g.font = "900 230px system-ui, -apple-system, sans-serif";
  g.fillText(rec(w.record), 540, 600);
  glow("transparent", 0);
  g.fillStyle = "#86efac";
  g.font = "800 40px system-ui, -apple-system, sans-serif";
  g.fillText(w.record.pct != null ? `${w.record.pct}% HIT RATE` : "RECORD", 540, 680);
  const rows: [string, string][] = [];
  if (w.best) rows.push(["BEST HIT", `${w.best.title}`]);
  rows.push(["LONGEST STREAK", `${w.longest} straight`]);
  if (w.parlays.total) rows.push(["PARLAYS", `${w.parlays.hit}/${w.parlays.total} hit`]);
  if (w.noted) rows.push(["MOST NOTED", w.noted.name]);
  if (w.stat) rows.push(["HOTTEST STAT", `${w.stat.key} ${rec(w.stat.t)}`]);
  if (w.league) rows.push(["HOTTEST LEAGUE", `${w.league.key} ${rec(w.league.t)}`]);
  let y = 840;
  for (const [k, v] of rows) {
    g.fillStyle = "rgba(124,58,237,0.18)";
    g.strokeStyle = "rgba(168,85,247,0.7)";
    g.lineWidth = 3;
    const r = 28;
    g.beginPath();
    g.roundRect(110, y - 70, 860, 140, r);
    g.fill();
    g.stroke();
    g.textAlign = "left";
    g.fillStyle = "#c4b5fd";
    g.font = "800 30px system-ui, -apple-system, sans-serif";
    g.fillText(k, 150, y - 18);
    g.fillStyle = "#ffffff";
    g.font = "900 46px system-ui, -apple-system, sans-serif";
    let text = v;
    while (g.measureText(text).width > 780 && text.length > 4) text = text.slice(0, -2);
    g.fillText(text === v ? v : text + "…", 150, y + 40);
    y += 175;
  }
  g.textAlign = "center";
  glow("#39ff14", 24);
  g.fillStyle = "#39ff14";
  g.font = "900 44px system-ui, -apple-system, sans-serif";
  g.fillText("portaljuice.app", 540, 1840);
  return await new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
}

export default function WrappedStory() {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const notes = useSyncExternalStore(subscribeNotes, getNotes, () => []);
  const ready = useSyncExternalStore(() => () => {}, () => true, () => false);
  const to = ready ? new Date().toLocaleDateString("en-CA") : "";
  const w = useMemo(() => (to ? wrapWeek(picks, notes, to) : null), [picks, notes, to]);
  const screens = useMemo(() => (w ? screensOf(w) : []), [w]);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const start = useRef<number | null>(null);
  const reduce = useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(prefers-reduced-motion: reduce)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
  useEffect(() => {
    if (paused || reduce || i >= screens.length - 1) return;
    const t = setTimeout(() => setI((x) => Math.min(screens.length - 1, x + 1)), 4500);
    return () => clearTimeout(t);
  }, [i, paused, reduce, screens.length]);
  if (!w) return null;
  const s = screens[Math.min(i, screens.length - 1)];
  const go = (d: number) => setI((x) => Math.max(0, Math.min(screens.length - 1, x + d)));
  async function share() {
    if (!w) return;
    try {
      const blob = await wrappedPng(w);
      const file = new File([blob], `portal-wrapped-${w.to}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Portal Wrapped" });
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setMsg("Saved the PNG.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMsg("Couldn't make the image. Try again.");
    }
  }
  return (
    <div
      className="wrapped-stage relative mx-auto flex aspect-[9/16] w-full max-w-sm select-none flex-col overflow-hidden rounded-3xl"
      style={{ "--tone": s.tone } as React.CSSProperties}
      data-testid="wrapped"
      onPointerDown={(e) => {
        start.current = e.clientX;
        setPaused(true);
      }}
      onPointerUp={(e) => {
        setPaused(false);
        const x0 = start.current;
        start.current = null;
        if (x0 == null) return;
        const dx = e.clientX - x0;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        else {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          if ((e.target as HTMLElement).closest("button,a")) return;
          go(e.clientX - r.left < r.width / 3 ? -1 : 1);
        }
      }}
    >
      <div className="flex gap-1 p-3" aria-hidden>
        {screens.map((x, j) => (
          <span key={x.k} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
            <span className={"block h-full bg-white " + (j < i ? "w-full" : j === i && !reduce && !paused && i < screens.length - 1 ? "wrapped-bar" : j === i ? "w-full" : "w-0")} />
          </span>
        ))}
      </div>
      <div key={s.k} className="wrapped-screen flex flex-1 flex-col items-center justify-center px-6 text-center" data-testid="wrapped-screen" data-k={s.k}>
        <p className="text-[12px] font-black uppercase tracking-[0.3em]" style={{ color: s.tone }}>{s.kicker}</p>
        <p className="font-display mt-4 break-words text-5xl font-black leading-tight text-white" style={{ textShadow: `0 0 24px ${s.tone}` }}>{s.big}</p>
        <p className="mt-3 text-base font-bold text-zinc-300">{s.sub}</p>
        {s.k === "share" ? (
          <div className="mt-6 flex flex-col items-center gap-2">
            <button type="button" onClick={share} className="sweat-btn rounded-xl px-5 py-2.5 text-sm font-black text-white" data-testid="wrapped-share">
              Share PNG
            </button>
            <button type="button" onClick={() => setI(0)} className="text-[12px] font-bold text-zinc-400">
              Watch again
            </button>
            {msg ? <p className="text-[12px] text-zinc-300">{msg}</p> : null}
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between p-3 text-[11px] text-zinc-500">
        <button type="button" onClick={() => go(-1)} aria-label="Back" className="px-2 py-1">‹</button>
        <span>Tap or swipe · {i + 1}/{screens.length}</span>
        <button type="button" onClick={() => go(1)} aria-label="Next" className="px-2 py-1" data-testid="wrapped-next">›</button>
      </div>
      {w.record.w + w.record.l + w.record.p + w.record.open === 0 ? (
        <p className="absolute inset-x-0 bottom-12 text-center text-[12px] text-zinc-400">
          Nothing logged this week. <Link href="/lines/portfolio" className="underline">Log a pick</Link>
        </p>
      ) : null}
    </div>
  );
}
