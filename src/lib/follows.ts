"use client";

/** Games you starred. Device only. */
export type Follow = { league: string; id: string; label?: string; at: string };

const KEY = "pj-follow-v1";
const EMPTY: Follow[] = [];
let raw: string | null = null;
let cache: Follow[] = EMPTY;
const listeners = new Set<() => void>();

export function getFollows(): Follow[] {
  const r = window.localStorage.getItem(KEY);
  if (r !== raw) {
    raw = r;
    try {
      const v = JSON.parse(r || "[]");
      cache = Array.isArray(v)
        ? v.filter((f): f is Follow => f && typeof f.league === "string" && typeof f.id === "string" && /^\d+$/.test(f.id))
        : EMPTY;
    } catch {
      cache = EMPTY;
    }
  }
  return cache;
}
export const getServerFollows = () => EMPTY;

export function subscribeFollows(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function isFollowed(list: Follow[], league: string, id: string) {
  return list.some((f) => f.league === league && f.id === id);
}

export function toggleFollow(league: string, id: string, label?: string) {
  const list = getFollows();
  // Keep the newest 30; old games fall off on their own.
  const next = isFollowed(list, league, id)
    ? list.filter((f) => !(f.league === league && f.id === id))
    : [{ league, id, label, at: new Date().toISOString() }, ...list].slice(0, 30);
  window.localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}
