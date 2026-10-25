"use client";

import { SPORT_ORDER, type Pick, type PickStatus } from "./types";
import { haptic } from "./native";
import { propMarketOf } from "./slipImport";

/** Device-only log. Nothing leaves the browser. */
export const STORAGE_KEY = "portal-juice:log:v1";
const EMPTY: Pick[] = [];
const STATUSES: PickStatus[] = ["open", "win", "loss", "push"];

let cacheRaw: string | null = null;
let cache: Pick[] = EMPTY;
const listeners = new Set<() => void>();

/** Open legs saved with the printed stat re-read it, so a stat the reader got wrong earlier is fixed in place. */
export function reResolve(p: Pick): Pick {
  if (!p || p.status !== "open" || typeof p.marketRaw !== "string" || !p.marketRaw.trim()) return p;
  const now = propMarketOf(p.marketRaw);
  if (!now || propMarketOf(p.market ?? "") === now) return p;
  return { ...p, market: now };
}

function parse(raw: string | null): Pick[] {
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return EMPTY;
    return v.map(reResolve).filter(
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
  haptic("success");
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
  const before = getPicks();
  if (before.some((p) => p.status === "open" && grades[p.id] === "win")) haptic("success");
  write(getPicks().map((p) => (p.status === "open" && grades[p.id] && STATUSES.includes(grades[p.id]) ? { ...p, status: grades[p.id] } : p)));
}

/** Reset: empties the log (every derived tally, streak and summary reads from it, so they clear too). */
export function clearPicks() {
  write([]);
}

/** Edit: replace the given picks (same ids), add new legs, drop removed ones, in one write. */
export function replacePicks(next: Pick[], removeIds: string[] = []) {
  const byId = new Map(next.map((p) => [p.id, p]));
  const drop = new Set(removeIds);
  const kept = getPicks().filter((p) => !drop.has(p.id)).map((p) => byId.get(p.id) ?? p);
  const added = next.filter((p) => !getPicks().some((x) => x.id === p.id));
  write([...added, ...kept]);
}
export function removePicks(ids: string[]) {
  const drop = new Set(ids);
  write(getPicks().filter((p) => !drop.has(p.id)));
}
/** Undo a delete: put the same picks back (same ids). */
export function restorePicks(ps: Pick[]) {
  const have = new Set(getPicks().map((p) => p.id));
  write([...ps.filter((p) => !have.has(p.id)), ...getPicks()].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)));
}
