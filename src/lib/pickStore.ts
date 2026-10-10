"use client";

import { SPORT_ORDER, type Pick, type PickStatus } from "./types";

/** Device-only log. Nothing leaves the browser. */
export const STORAGE_KEY = "portal-juice:log:v1";
const EMPTY: Pick[] = [];
const STATUSES: PickStatus[] = ["open", "win", "loss", "push"];

let cacheRaw: string | null = null;
let cache: Pick[] = EMPTY;
const listeners = new Set<() => void>();

function parse(raw: string | null): Pick[] {
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return EMPTY;
    return v.filter(
      (p): p is Pick =>
        p &&
        typeof p.id === "string" &&
        SPORT_ORDER.includes(p.sport) &&
        typeof p.subject === "string" &&
        Number.isFinite(p.line) &&
        Number.isFinite(p.odds) &&
        Number.isFinite(p.stake) &&
        STATUSES.includes(p.status)
    );
  } catch {
    return EMPTY;
  }
}

export function getPicks(): Pick[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cache = parse(raw);
  }
  return cache;
}

export const getServerPicks = () => EMPTY;

export function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function write(next: Pick[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

export function addPick(p: Pick) {
  write([p, ...getPicks()]);
}
export function setStatus(id: string, status: PickStatus) {
  write(getPicks().map((p) => (p.id === id ? { ...p, status } : p)));
}
export function removePick(id: string) {
  write(getPicks().filter((p) => p.id !== id));
}
/** Apply server grades to still-open picks only. */
export function applyGrades(grades: Record<string, PickStatus>) {
  const ids = Object.keys(grades);
  if (!ids.length) return;
  write(getPicks().map((p) => (p.status === "open" && grades[p.id] && STATUSES.includes(grades[p.id]) ? { ...p, status: grades[p.id] } : p)));
}
