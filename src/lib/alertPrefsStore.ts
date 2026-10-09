"use client";

import { DEFAULT_ALERTS, readAlertPrefs, type AlertKind, type AlertPrefs } from "@/lib/alerts";

const KEY = "pj-alert-prefs-v1";
let raw: string | null = null;
let cache: AlertPrefs = DEFAULT_ALERTS;
const listeners = new Set<() => void>();

export function getAlertPrefs(): AlertPrefs {
  const r = window.localStorage.getItem(KEY);
  if (r !== raw) {
    raw = r;
    try {
      cache = readAlertPrefs(JSON.parse(r || "{}"));
    } catch {
      cache = DEFAULT_ALERTS;
    }
  }
  return cache;
}
export const getServerAlertPrefs = () => DEFAULT_ALERTS;

export function subscribeAlertPrefs(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function setAlertPref(kind: AlertKind, on: boolean) {
  const next = { ...getAlertPrefs(), [kind]: on };
  window.localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}
