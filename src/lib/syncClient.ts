"use client";

import { mergeQuestJson } from "./questsCore";
import { diffList, LIST_COLS, listOf, SINGLES, type CloudDoc, type ListCol, type SyncPush } from "./syncCore";

/** Local-first sync: the app keeps working from localStorage; when signed in, changes flow to the account and back. */
export const COL_KEY: Record<ListCol, string> = { picks: "portal-juice:log:v1", notes: "pj-notes-v1", follows: "pj-follow-v1" };
const BASE_KEY = "pj-sync-base-v1";
const FLOOR_KEY = "pj-sync-floor";

export type AccountUser = { id: string; email: string | null; name: string | null; image: string | null; providers: string[]; createdAt: string };
export type Providers = { store: boolean; email: boolean; google: boolean; apple: boolean };
export type AccountState = {
  ready: boolean;
  user: AccountUser | null;
  providers: Providers;
  status: "idle" | "syncing" | "ok" | "error" | "offline";
  lastSync: number | null;
  error: string | null;
};

type Base = { cols: Partial<Record<ListCol, Record<string, string>>>; singles: Record<string, string | null> };

let state: AccountState = { ready: false, user: null, providers: { store: false, email: false, google: false, apple: false }, status: "idle", lastSync: null, error: null };
const listeners = new Set<() => void>();
function set(p: Partial<AccountState>) {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}
export const getAccount = () => state;
const SERVER_STATE = state;
export const getServerAccount = () => SERVER_STATE;
export function subscribeAccount(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function readBase(): Base {
  try {
    const b = JSON.parse(localStorage.getItem(BASE_KEY) ?? "null");
    if (b && typeof b === "object" && b.cols) return b as Base;
  } catch {
    /* fresh */
  }
  return { cols: {}, singles: {} };
}
function writeBase(b: Base) {
  try {
    localStorage.setItem(BASE_KEY, JSON.stringify(b));
  } catch {
    /* full */
  }
}
function readList(col: ListCol): unknown[] {
  try {
    const v = JSON.parse(localStorage.getItem(COL_KEY[col]) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
/** Same-tab stores only hear "storage" events from other tabs; send one so open views refresh now. */
function announce(key: string) {
  try {
    window.dispatchEvent(new StorageEvent("storage", { key }));
  } catch {
    /* old browsers */
  }
}

/** Same pick logged on two devices (different ids): keep the oldest. */
function pickKey(p: Record<string, unknown>): string | null {
  if (!p.gameId) return null;
  return [String(p.subject).toLowerCase(), p.market ?? "", p.line, p.selection ?? "", p.league, p.gameId].join("|");
}

let inflight: Promise<void> | null = null;
let again = false;

async function pushEndpoint(): Promise<string | undefined> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub?.endpoint;
  } catch {
    return undefined;
  }
}

/** Send what changed since the last sync, take the merged copy back. full = send everything (Save my data). */
export function syncNow(opts: { full?: boolean; reset?: ListCol[] } = {}): Promise<void> {
  if (!state.user) return Promise.resolve();
  if (inflight) {
    again = true;
    return inflight;
  }
  inflight = run(opts).finally(() => {
    inflight = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return inflight;
}

async function run(opts: { full?: boolean; reset?: ListCol[] }) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return set({ status: "offline" });
  set({ status: "syncing", error: null });
  const base = opts.full ? { cols: {}, singles: {} } : readBase();
  const now = Date.now();
  const push: SyncPush = { cols: {}, singles: {} };
  const sentRaw: Record<string, string | null> = {};
  for (const col of LIST_COLS) sentRaw[col] = localStorage.getItem(COL_KEY[col]);
  for (const k of SINGLES) sentRaw[k] = localStorage.getItem(k);
  for (const col of LIST_COLS) {
    const d = diffList(col, base.cols[col] ?? {}, readList(col), now);
    push.cols[col] = { put: d.put, del: d.del };
  }
  for (const k of SINGLES) {
    const v = localStorage.getItem(k);
    if (opts.full ? v !== null : k in base.singles ? base.singles[k] !== v : v !== null) push.singles[k] = { v, t: now };
  }
  let doc: CloudDoc;
  try {
    const body = JSON.stringify({ push, reset: opts.reset, endpoint: await pushEndpoint() });
    // keepalive lets a small sync finish even if the page is closing.
    const res = await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: body.length < 60_000 });
    if (res.status === 401) {
      set({ user: null, status: "idle" });
      return;
    }
    const j = (await res.json()) as { doc?: CloudDoc; error?: string };
    if (!res.ok || !j.doc) throw new Error(j.error ?? "Sync failed.");
    doc = j.doc;
  } catch (e) {
    set({ status: navigator.onLine === false ? "offline" : "error", error: e instanceof Error ? e.message : "Sync failed." });
    return;
  }
  // Anything changed locally while we were away goes next round; apply the cloud copy now.
  const floors = readFloors();
  const nextBase: Base = { cols: {}, singles: {} };
  for (const col of LIST_COLS) {
    // Edited on this device while the request was out: keep the edit, send it next round.
    if (localStorage.getItem(COL_KEY[col]) !== sentRaw[col]) {
      nextBase.cols[col] = readBase().cols[col] ?? {};
      again = true;
      continue;
    }
    let list = listOf(col, doc) as Record<string, unknown>[];
    const seen: Record<string, string> = {};
    // "Reset this device only": the account keeps older items; this device stops showing them.
    const floor = floors[col];
    if (floor) list = list.filter((p) => Date.parse(String(p.createdAt ?? p.at)) >= floor);
    if (col === "picks") {
      const byKey = new Map<string, Record<string, unknown>>();
      const dupes: Record<string, unknown>[] = [];
      for (const p of [...list].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
        const k = pickKey(p);
        if (k && byKey.has(k)) dupes.push(p);
        else if (k) byKey.set(k, p);
      }
      if (dupes.length) {
        const drop = new Set(dupes.map((p) => p.id));
        list = list.filter((p) => !drop.has(p.id));
        // Keep them in the base so the next sync sends their deletes.
        for (const p of dupes) seen[String(p.id)] = JSON.stringify(p);
        again = true;
      }
    }
    for (const x of list) {
      const id = col === "follows" ? `${x.league}/${x.id}` : String(x.id);
      seen[id] = JSON.stringify(x);
    }
    nextBase.cols[col] = seen;
    const raw = JSON.stringify(list);
    if ((localStorage.getItem(COL_KEY[col]) ?? "[]") !== raw && !(raw === "[]" && localStorage.getItem(COL_KEY[col]) === null)) {
      localStorage.setItem(COL_KEY[col], raw);
      announce(COL_KEY[col]);
    }
  }
  for (const k of SINGLES) {
    const s = doc.singles[k];
    if (localStorage.getItem(k) !== sentRaw[k]) {
      nextBase.singles[k] = readBase().singles[k] ?? null;
      again = true;
      continue;
    }
    if (s && k === "pj-quests-v1" && s.v !== null && localStorage.getItem(k)) {
      // Quests join across devices instead of one overwriting the other.
      const merged = mergeQuestJson(localStorage.getItem(k), s.v);
      if (merged && merged !== localStorage.getItem(k)) {
        localStorage.setItem(k, merged);
        announce(k);
      }
      nextBase.singles[k] = s.v;
      if (merged !== s.v) again = true;
      continue;
    }
    if (s) {
      const cur = localStorage.getItem(k);
      if (s.v === null && cur !== null) localStorage.removeItem(k);
      else if (s.v !== null && cur !== s.v) localStorage.setItem(k, s.v);
      if (cur !== (s.v ?? null)) announce(k);
    }
    nextBase.singles[k] = localStorage.getItem(k);
  }
  writeBase(nextBase);
  set({ status: "ok", lastSync: Date.now() });
}

export async function refreshAccount(): Promise<void> {
  try {
    const r = await fetch("/api/auth/session", { cache: "no-store" });
    const j = (await r.json()) as { user: AccountUser | null; providers: Providers };
    const { getDeviceKey, setDeviceKey } = await import("@/lib/native");
    const dk = await getDeviceKey();
    if (!j.user && dk) {
      // Cookie lost (e.g. iOS app killed before WKWebView saved it): restore the same account, never a new one.
      const rr = await fetch("/api/auth/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: dk }), cache: "no-store" }).catch(() => null);
      if (rr?.ok) {
        const rj = (await rr.json()) as { user: AccountUser | null; key?: string };
        if (rj.key) await setDeviceKey(rj.key);
        if (rj.user) j.user = rj.user;
      } else if (rr?.status === 404) await setDeviceKey(null);
    } else if (j.user && (!dk || state.user?.id !== j.user.id)) {
      // Signed in: make sure this device holds a restore key for this account.
      const kr = await fetch("/api/auth/devicekey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ old: dk ?? undefined }), cache: "no-store" }).catch(() => null);
      if (kr?.ok) {
        const kj = (await kr.json()) as { key?: string };
        if (kj.key) await setDeviceKey(kj.key);
      }
    }
    const was = state.user?.id;
    set({ ready: true, user: j.user, providers: j.providers });
    // First sign-in on this device: save everything here to the account (merges with what's there).
    if (j.user && was !== j.user.id) {
      const firstHere = localStorage.getItem("pj-sync-user") !== j.user.id;
      localStorage.setItem("pj-sync-user", j.user.id);
      await syncNow({ full: firstHere });
    }
  } catch {
    set({ ready: true, status: "offline" });
  }
}

/** Signed out: this device keeps its data; sync just stops. */
export async function signOut() {
  const { getDeviceKey, setDeviceKey } = await import("@/lib/native");
  const dk = await getDeviceKey();
  if (dk) await fetch("/api/auth/devicekey", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: dk }) }).catch(() => {});
  await setDeviceKey(null);
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  forget();
}
export function forget() {
  localStorage.removeItem(BASE_KEY);
  localStorage.removeItem("pj-sync-user");
  localStorage.removeItem(FLOOR_KEY);
  set({ user: null, status: "idle", lastSync: null });
}

function readFloors(): Partial<Record<ListCol, number>> {
  try {
    const v = JSON.parse(localStorage.getItem(FLOOR_KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Called right after Reset stats clears this device. Device only: the account keeps its copy. Cloud: clear it everywhere. */
export async function afterReset(scope: "device" | "cloud", cols: ListCol[] = ["picks"]) {
  if (!state.user) return;
  const b = readBase();
  const floors = readFloors();
  for (const c of cols) {
    b.cols[c] = {};
    if (scope === "device") floors[c] = Date.now();
    else delete floors[c];
  }
  writeBase(b);
  localStorage.setItem(FLOOR_KEY, JSON.stringify(floors));
  if (scope === "cloud") await syncNow({ reset: cols });
}

/** Raw snapshot of everything synced, to notice local edits cheaply. */
export function localStamp(): string {
  return LIST_COLS.map((c) => localStorage.getItem(COL_KEY[c]) ?? "").join("\u0001") + SINGLES.map((k) => localStorage.getItem(k) ?? "").join("\u0001");
}
