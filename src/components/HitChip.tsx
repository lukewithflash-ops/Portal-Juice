"use client";

import { useEffect, useRef, useState } from "react";

export type HitReq = { league: string; athleteId: string; stat: string; line: number };
export type HitRes = { hits: number; n: number; games: { v: number; d: string; o: string }[] } | null;

/** Batches hit-rate requests from every chip on screen into one call. */
const queue: { req: HitReq; done: (r: HitRes) => void }[] = [];
const memo = new Map<string, Promise<HitRes>>();
let timer: ReturnType<typeof setTimeout> | null = null;
const keyOf = (r: HitReq) => `${r.league}|${r.athleteId}|${r.stat}|${r.line}`;

function flush() {
  timer = null;
  const batch = queue.splice(0, 30);
  if (!batch.length) return;
  fetch("/api/hitrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: batch.map((b) => b.req) }) })
    .then((r) => r.json())
    .then((j: { results?: HitRes[] }) => batch.forEach((b, i) => b.done(j.results?.[i] ?? null)))
    .catch(() => batch.forEach((b) => b.done(null)));
  if (queue.length) timer = setTimeout(flush, 50);
}

export function loadHit(req: HitReq): Promise<HitRes> {
  const k = keyOf(req);
  const hit = memo.get(k);
  if (hit) return hit;
  const p = new Promise<HitRes>((done) => {
    queue.push({ req, done });
    if (!timer) timer = setTimeout(flush, 60);
  });
  memo.set(k, p);
  return p;
}

/** Red (cold) → gold → green (hot) by share of the last 10 that cleared. */
export function heatColor(rate: number): string {
  const hue = Math.round(rate * 125); // 0 red … 125 green
  return `hsl(${hue} 95% 55%)`;
}

export function useHit(req: HitReq | null): HitRes | undefined {
  const [res, setRes] = useState<HitRes | undefined>(undefined);
  const ref = useRef<string>("");
  const k = req ? keyOf(req) : "";
  useEffect(() => {
    ref.current = k;
    if (!req) return;
    let live = true;
    loadHit(req).then((r) => live && ref.current === k && setRes(r));
    return () => {
      live = false;
    };
    // k carries req
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  return req ? res : undefined;
}

/** "8/10" chip, colored by heat. Loads when it scrolls into view. */
export default function HitChip({ req, onRate }: { req: HitReq | null; onRate?: (rate: number | null) => void }) {
  const box = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || seen) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  const r = useHit(seen ? req : null);
  useEffect(() => {
    if (r !== undefined) onRate?.(r && r.n ? r.hits / r.n : null);
  }, [r, onRate]);
  if (!req) return null;
  const rate = r && r.n ? r.hits / r.n : null;
  const title = r?.games.length ? `Last ${r.n}: ${r.games.map((g) => g.v).join(", ")} vs line ${req.line}` : "Last 10 games from ESPN game logs";
  return (
    <span ref={box} className="hit-chip tabular" data-testid="hit-chip" title={title} style={rate != null ? ({ "--heat": heatColor(rate) } as React.CSSProperties) : undefined} aria-label={r && r.n ? `Cleared ${r.hits} of last ${r.n}` : "Hit rate loading"}>
      {r === undefined ? "…" : r && r.n ? `${r.hits}/${r.n}` : "—"}
    </span>
  );
}
