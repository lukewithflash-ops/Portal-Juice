"use client";

/** Your base unit, set by you. Device only. */
const KEY = "pj-base-unit";
const listeners = new Set<() => void>();

export function getBaseUnit(): number | null {
  const n = Number(window.localStorage.getItem(KEY));
  return Number.isFinite(n) && n > 0 ? n : null;
}
export const getServerBaseUnit = () => null;

export function subscribeBaseUnit(cb: () => void) {
  listeners.add(cb);
  const on = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener("storage", on);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", on);
  };
}

export function setBaseUnit(n: number | null) {
  if (n !== null && Number.isFinite(n) && n > 0) window.localStorage.setItem(KEY, String(Math.round(n * 100) / 100));
  else window.localStorage.removeItem(KEY);
  listeners.forEach((l) => l());
}
