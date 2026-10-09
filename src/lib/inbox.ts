"use client";

/** Every update this device saw: in-app toasts and pushes. Device only, newest first. */
export type InboxItem = { key: string; kind: string; title: string; body: string; url: string; at: number };

const KEY = "pj-inbox-v1";
const SEEN = "pj-inbox-seen";
const MAX = 60;
const EMPTY: InboxItem[] = [];
const listeners = new Set<() => void>();
let cacheRaw: string | null = null;
let cache: InboxItem[] = EMPTY;

function parse(raw: string | null): InboxItem[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.key === "string" && typeof x.title === "string") : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function getInbox(): InboxItem[] {
  const raw = localStorage.getItem(KEY);
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cache = parse(raw);
  }
  return cache;
}
export const getServerInbox = () => EMPTY;

export function getSeen(): number {
  return Number(localStorage.getItem(SEEN)) || 0;
}
export const getServerSeen = () => 0;

export function subscribeInbox(cb: () => void) {
  listeners.add(cb);
  const on = (e: StorageEvent) => (e.key === KEY || e.key === SEEN) && cb();
  window.addEventListener("storage", on);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", on);
  };
}

/** Adds items not already in the inbox (by key). */
export function addToInbox(items: InboxItem[]) {
  if (!items.length) return;
  const have = getInbox();
  const keys = new Set(have.map((x) => x.key));
  const fresh = items.filter((x) => !keys.has(x.key));
  if (!fresh.length) return;
  const next = [...fresh, ...have].sort((a, b) => b.at - a.at).slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

export function markSeen() {
  localStorage.setItem(SEEN, String(Date.now()));
  listeners.forEach((l) => l());
}

export function clearInbox() {
  localStorage.removeItem(KEY);
  listeners.forEach((l) => l());
}
