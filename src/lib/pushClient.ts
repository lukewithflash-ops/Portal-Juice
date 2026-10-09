"use client";

import { getAlertPrefs } from "@/lib/alertPrefsStore";
import { getFollows } from "@/lib/follows";
import { getPicks } from "@/lib/pickStore";

const TEAM_KEY = "pj-fav-team";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function alertsOn(): boolean {
  try {
    return localStorage.getItem("pj-alerts") === "on";
  } catch {
    return false;
  }
}

function payload() {
  const props = getPicks()
    .filter((p) => p.status === "open" && p.gameId && p.market && p.league)
    .map((p) => ({ id: p.id, league: p.league, gameId: p.gameId, subject: p.subject, market: p.market, line: p.line, selection: p.selection ?? null }));
  const games = getFollows().map((f) => ({ league: f.league, id: f.id }));
  let team: { league: string; abbr: string; id: string } | null = null;
  try {
    const t = JSON.parse(localStorage.getItem(TEAM_KEY) || "null");
    if (t && t.league && t.abbr) team = { league: t.league, abbr: t.abbr, id: String(t.id ?? "") };
  } catch {
    /* no team */
  }
  return { props, games, team, prefs: getAlertPrefs() };
}

/** Send the current props, follows, team, and alert types to the push store. Quiet no-op without a subscription. */
export async function syncPush(): Promise<"ok" | "off" | "no-store"> {
  if (!alertsOn() || !("serviceWorker" in navigator) || !("Notification" in window)) return "off";
  if (Notification.permission !== "granted") return "off";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return "off";
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sub: sub.toJSON(), ...payload() }),
  });
  return res.ok ? "ok" : "no-store";
}

/** Ask for permission, subscribe this device, and register what to watch. */
export async function enablePush(): Promise<string> {
  if (!("Notification" in window)) return "This browser has no notifications. On iPhone, add Juice to the Home Screen first.";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "Notifications stay off.";
  localStorage.setItem("pj-alerts", "on");
  try {
    const keyRes = await fetch("/api/push/public");
    const key = await keyRes.json();
    if (!key.enabled || !("serviceWorker" in navigator)) return "Updates show while the app is open. Closed-app push is not set up on the server.";
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (!existing) {
      await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key.publicKey) });
    }
    const r = await syncPush();
    return r === "ok" ? "Push is on for your props, your games, and your team." : "Updates show while the app is open. Closed-app push did not register.";
  } catch {
    return "Updates show while the app is open. Closed-app push needs Juice on the Home Screen.";
  }
}

export function disablePush() {
  localStorage.setItem("pj-alerts", "off");
}
