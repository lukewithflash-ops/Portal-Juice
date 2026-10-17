/**
 * Cloud sync, pure parts. Local-first: each device keeps its own copy in localStorage.
 * The account holds the merged copy. Every item carries the time it last changed (t);
 * deletes leave a tombstone so they spread too. Newest change wins per item.
 */

export const LIST_COLS = ["picks", "notes", "follows"] as const;
export type ListCol = (typeof LIST_COLS)[number];
export const SINGLES = ["pj-leader-handle", "pj-leader-token", "pj-fav-team", "pj-odds", "pj-alert-prefs-v1", "pj-handle", "pj-quests-v1"] as const;
export type Single = (typeof SINGLES)[number];

export type Stamped<T = unknown> = { v: T; t: number };
export type ColDoc = { items: Record<string, Stamped>; tomb: Record<string, number> };
export type CloudDoc = { rev: number; cols: Record<ListCol, ColDoc>; singles: Partial<Record<Single, Stamped<string | null>>>; updatedAt: number };

/** What a device sends: its changes since the last sync (or everything on first save). */
export type SyncPush = {
  cols: Partial<Record<ListCol, { put: Record<string, Stamped>; del: Record<string, number> }>>;
  singles: Partial<Record<Single, Stamped<string | null>>>;
};

export const MAX_ITEMS: Record<ListCol, number> = { picks: 3000, notes: 3000, follows: 60 };

export function emptyDoc(): CloudDoc {
  return { rev: 0, cols: { picks: { items: {}, tomb: {} }, notes: { items: {}, tomb: {} }, follows: { items: {}, tomb: {} } }, singles: {}, updatedAt: 0 };
}

/** Stable id for an item in each list. Follows have no id of their own: league/game is the id. */
export function itemId(col: ListCol, x: unknown): string | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (col === "follows") return typeof o.league === "string" && typeof o.id === "string" ? `${o.league}/${o.id}` : null;
  return typeof o.id === "string" && o.id.length <= 80 ? o.id : null;
}

/** Merge a device's changes into the cloud copy. Newest stamp wins; a delete newer than the item removes it. */
export function mergePush(doc: CloudDoc, push: SyncPush, now = Date.now()): CloudDoc {
  const next: CloudDoc = { rev: doc.rev + 1, cols: { ...doc.cols }, singles: { ...doc.singles }, updatedAt: now };
  for (const col of LIST_COLS) {
    const inc = push.cols[col];
    const cur = doc.cols[col] ?? { items: {}, tomb: {} };
    const items = { ...cur.items };
    const tomb = { ...cur.tomb };
    if (inc) {
      for (const [id, s] of Object.entries(inc.put ?? {})) {
        if (!s || typeof s.t !== "number" || itemId(col, s.v) !== id) continue;
        const t = Math.min(s.t, now + 60_000);
        if ((tomb[id] ?? 0) >= t) continue;
        if (!items[id] || items[id].t <= t) items[id] = { v: s.v, t };
      }
      for (const [id, t0] of Object.entries(inc.del ?? {})) {
        if (typeof t0 !== "number") continue;
        const t = Math.min(t0, now + 60_000);
        if (!items[id] || items[id].t <= t) {
          delete items[id];
          tomb[id] = Math.max(tomb[id] ?? 0, t);
        }
      }
    }
    // Keep the list bounded: newest first.
    const ids = Object.keys(items);
    if (ids.length > MAX_ITEMS[col]) {
      ids.sort((a, b) => items[b].t - items[a].t).slice(MAX_ITEMS[col]).forEach((id) => delete items[id]);
    }
    // Tombstones older than 90 days have done their job.
    for (const [id, t] of Object.entries(tomb)) if (now - t > 90 * 864e5) delete tomb[id];
    next.cols[col] = { items, tomb };
  }
  for (const k of Object.keys(push.singles) as Single[]) {
    if (!(SINGLES as readonly string[]).includes(k)) continue;
    const s = push.singles[k];
    if (!s || typeof s.t !== "number" || (s.v !== null && (typeof s.v !== "string" || s.v.length > 4000))) continue;
    const cur = next.singles[k];
    if (!cur || cur.t <= s.t) next.singles[k] = { v: s.v, t: Math.min(s.t, now + 60_000) };
  }
  return next;
}

/** Wipe lists in the cloud copy, leaving tombstones so other devices clear too. */
export function resetCols(doc: CloudDoc, cols: ListCol[], now = Date.now()): CloudDoc {
  const next: CloudDoc = { ...doc, rev: doc.rev + 1, cols: { ...doc.cols }, updatedAt: now };
  for (const col of cols) {
    const cur = doc.cols[col];
    const tomb = { ...cur.tomb };
    for (const id of Object.keys(cur.items)) tomb[id] = now;
    next.cols[col] = { items: {}, tomb };
  }
  return next;
}

/** Order lists the way the app keeps them: newest first. */
export function listOf(col: ListCol, doc: CloudDoc): unknown[] {
  const vals = Object.values(doc.cols[col]?.items ?? {}).map((s) => s.v as Record<string, unknown>);
  const key = col === "follows" ? "at" : "createdAt";
  return vals.sort((a, b) => String(b[key] ?? "").localeCompare(String(a[key] ?? "")));
}

/** Device side: what changed since the last synced copy (by item JSON). */
export function diffList(col: ListCol, base: Record<string, string>, list: unknown[], now: number): { put: Record<string, Stamped>; del: Record<string, number>; seen: Record<string, string> } {
  const put: Record<string, Stamped> = {};
  const del: Record<string, number> = {};
  const seen: Record<string, string> = {};
  for (const x of list) {
    const id = itemId(col, x);
    if (!id) continue;
    const j = JSON.stringify(x);
    seen[id] = j;
    if (base[id] !== j) put[id] = { v: x, t: now };
  }
  for (const id of Object.keys(base)) if (!(id in seen)) del[id] = now;
  return { put, del, seen };
}
