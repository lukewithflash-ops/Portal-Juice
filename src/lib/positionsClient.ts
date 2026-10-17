"use client";

import { useEffect, useState } from "react";

export type PosLeg = { id: string; subject: string; line: number; market: string | null; selection: "Over" | "Under" | null; league: string | null; gameId: string | null; status: string; date: string; slipId: string | null; createdAt: string; sport?: string; plus?: boolean };
export type LivePosition = { handle: string; legs: PosLeg[]; setAt: string };

/** One shared cache so threads, squads and leaders ask once per handle every 30 s. */
const cache = new Map<string, { at: number; pos: LivePosition | null }>();
const subs = new Set<() => void>();
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
const TTL = 30000;

function flush() {
  timer = null;
  const hs = [...pending];
  pending = new Set();
  if (!hs.length) return;
  fetch(`/api/position?h=${encodeURIComponent(hs.join(","))}`, { cache: "no-store" })
    .then((r) => r.json())
    .then((j: { positions?: Record<string, LivePosition> }) => {
      const now = Date.now();
      for (const h of hs) cache.set(h, { at: now, pos: j.positions?.[h] ?? null });
      subs.forEach((f) => f());
    })
    .catch(() => {});
}

function want(handles: string[]) {
  const now = Date.now();
  for (const raw of handles) {
    const h = raw.replace(/^@/, "").toLowerCase();
    if (!h) continue;
    const c = cache.get(h);
    if (!c || now - c.at > TTL) pending.add(h);
  }
  if (pending.size && !timer) timer = setTimeout(flush, 60);
}

export function invalidatePosition(handle: string) {
  cache.delete(handle.toLowerCase());
  want([handle]);
}

export function usePositions(handles: string[]): Record<string, LivePosition> {
  const key = handles.map((h) => h.toLowerCase()).sort().join(",");
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    const list = key ? key.split(",") : [];
    want(list);
    const t = setInterval(() => document.visibilityState === "visible" && want(list), TTL);
    return () => {
      subs.delete(f);
      clearInterval(t);
    };
  }, [key]);
  const out: Record<string, LivePosition> = {};
  for (const h of key ? key.split(",") : []) {
    const p = cache.get(h)?.pos;
    if (p) out[h] = p;
  }
  return out;
}
