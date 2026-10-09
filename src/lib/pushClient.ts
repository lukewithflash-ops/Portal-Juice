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

async function swReady(): Promise<ServiceWorkerRegistration> {
  const have = await navigator.serviceWorker.getRegistration();
  if (!have) await navigator.serviceWorker.register("/sw.js");
  return await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("sw-timeout")), 8000)),
  ]);
}

export type PushState = {
  supported: boolean;
  ios: boolean;
  standalone: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  on: boolean;
};

export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Where this device stands. Never asks for anything. */
export async function pushState(): Promise<PushState> {
  const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  const base = { supported, ios: isIos(), standalone: isStandalone(), on: alertsOn() };
  if (!supported) return { ...base, permission: "unsupported", subscribed: false };
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  return { ...base, permission: Notification.permission, subscribed: Boolean(sub) };
}

export async function currentEndpoint(): Promise<string | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  return sub?.endpoint ?? null;
}

/** Ask for permission, subscribe this device, and register what to watch. Call from a tap. */
export async function enablePush(): Promise<string> {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return isIos() && !isStandalone()
      ? "On iPhone, add Juice to the Home Screen first, then open it from there."
      : "This browser has no notifications.";
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "Notifications are blocked. Allow them in your browser or phone settings." : "Notifications stay off.";
  localStorage.setItem("pj-alerts", "on");
  try {
    const keyRes = await fetch("/api/push/public");
    const key = await keyRes.json();
    if (!key.enabled) return "Updates show while the app is open. Closed-app push is not set up on the server.";
    const reg = await swReady();
    const want = urlBase64ToUint8Array(key.publicKey);
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      const have = sub.options?.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
      if (have && (have.length !== want.length || have.some((b, i) => b !== want[i]))) {
        await sub.unsubscribe();
        sub = null;
      }
    }
    if (!sub) await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want });
    const r = await syncPush();
    return r === "ok" ? "Push is on for your props, your games, and your team." : "Updates show while the app is open. Closed-app push did not register.";
  } catch {
    return isIos() && !isStandalone()
      ? "On iPhone, push works only from the Home Screen app."
      : "Updates show while the app is open. Closed-app push did not register.";
  }
}

/** Ask the server to push to this device right now. */
export async function sendTestPush(): Promise<string> {
  const endpoint = await currentEndpoint();
  if (!endpoint) return "Turn notifications on first.";
  await syncPush().catch(() => {});
  const res = await fetch("/api/push/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint }) });
  const r = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: number | null; error?: string };
  if (r.ok) return `Test sent (push service said ${r.code}). It should land in a few seconds.`;
  return r.error ? `Test did not send: ${r.error}` : "Test did not send.";
}

export function disablePush() {
  localStorage.setItem("pj-alerts", "off");
}
