import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { redis } from "@/lib/chat";
import { rateOk, SITE, type User } from "@/lib/auth";
import { isOwner } from "@/lib/vipAccess";
import { pushChanges, readDoc } from "@/lib/cloud";
import { listOf, type Stamped } from "@/lib/syncCore";
import { matchRows } from "@/lib/slipRead";
import { pickFromLeg, sportOf } from "@/lib/legPick";
import type { Pick } from "@/lib/types";
import { BOOKSYNC_COOKIE, bookSyncOn, dayKey, MANUAL_REFRESH_PER_DAY, outcomeStatus, rowFromBet, SS_API, SS_LINK_UI, syncPickId, syncSlipId, type SsBetSlip } from "@/lib/bookSyncCore";

export type LinkedBook = { id: string; book: string; status: "linked" | "relink"; linkedAt: string; lastSync: string | null };
export type BookSyncState = { iid: string | null; bettor: string | null; consentAt: string | null; accounts: Record<string, LinkedBook>; showPublic: boolean; pausedUntil: string | null };

const K = {
  state: (uid: string) => `pj:bs:u:${uid}`,
  iid: (iid: string) => `pj:bs:iid:${iid}`,
  bettor: (b: string) => `pj:bs:b:${b}`,
  seen: (uid: string) => `pj:bs:seen:${uid}`,
};
const empty = (): BookSyncState => ({ iid: null, bettor: null, consentAt: null, accounts: {}, showPublic: false, pausedUntil: null });

export const keysReady = () => !!process.env.SHARPSPORTS_PUBLIC_KEY;
const pub = () => process.env.SHARPSPORTS_PUBLIC_KEY ?? "";
const priv = () => process.env.SHARPSPORTS_PRIVATE_KEY || process.env.SHARPSPORTS_PUBLIC_KEY || "";

export async function bookSyncAllowed(u: User | null): Promise<boolean> {
  const c = (await cookies()).get(BOOKSYNC_COOKIE)?.value;
  return bookSyncOn({ env: process.env.BOOKSYNC_ENABLED, allow: process.env.BOOKSYNC_ADMIN_IDS, uid: u?.id ?? null, owner: isOwner(u), cookie: c });
}

export async function getState(uid: string): Promise<BookSyncState> {
  const raw = (await redis(["GET", K.state(uid)])) as string | null;
  if (!raw) return empty();
  try {
    return { ...empty(), ...(JSON.parse(raw) as BookSyncState) };
  } catch {
    return empty();
  }
}
async function saveState(uid: string, s: BookSyncState) {
  await redis(["SET", K.state(uid), JSON.stringify(s)]);
}
export const paused = (s: BookSyncState, now = Date.now()) => !!s.pausedUntil && Date.parse(s.pausedUntil) > now;

async function ss(path: string, init: { method?: string; body?: unknown; key: string }): Promise<unknown> {
  const res = await fetch(`${SS_API}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Token ${init.key}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`sharpsports ${res.status}`);
  return text ? JSON.parse(text) : {};
}

/** Start a hosted book-link session for this user. Our internalId is a random token, never the account id. */
export async function linkUrl(uid: string): Promise<string> {
  const s = await getState(uid);
  if (!s.iid) {
    s.iid = "pj_" + randomBytes(12).toString("hex");
    await redis(["SET", K.iid(s.iid), uid]);
  }
  s.consentAt = s.consentAt ?? new Date().toISOString();
  await saveState(uid, s);
  const r = (await ss("/context", { method: "POST", key: pub(), body: { internalId: s.iid, redirectUrl: `${SITE}/more?booksync=done`, uiMode: "dark" } })) as { cid?: string };
  if (!r.cid) throw new Error("no context");
  return SS_LINK_UI + encodeURIComponent(r.cid);
}

/** Webhooks carry SharpSports' bettor id. Map it back to our user through the internalId we gave them. */
export async function uidForBettor(bettor: string, internalId?: string | null): Promise<string | null> {
  const hit = (await redis(["GET", K.bettor(bettor)])) as string | null;
  if (hit) return hit;
  let iid = internalId ?? null;
  if (!iid) {
    try {
      iid = ((await ss(`/bettors/${encodeURIComponent(bettor)}`, { key: priv() })) as { internalId?: string }).internalId ?? null;
    } catch {
      return null;
    }
  }
  const uid = iid ? ((await redis(["GET", K.iid(iid)])) as string | null) : null;
  if (uid) {
    await redis(["SET", K.bettor(bettor), uid]);
    const s = await getState(uid);
    if (!s.bettor) await saveState(uid, { ...s, bettor });
  }
  return uid;
}

export async function markAccount(uid: string, acct: string, book: string | null, status: LinkedBook["status"], synced = false) {
  const s = await getState(uid);
  const cur = s.accounts[acct];
  s.accounts[acct] = { id: acct, book: book || cur?.book || "Book", status, linkedAt: cur?.linkedAt ?? new Date().toISOString(), lastSync: synced ? new Date().toISOString() : cur?.lastSync ?? null };
  await saveState(uid, s);
}

/** Synced betSlips → Log rows. Same matcher and live tracker as a slip photo. No money: stake is 0, atRisk/toWin are never read. */
export async function importSlips(uid: string, slips: SsBetSlip[]): Promise<{ added: number; updated: number }> {
  const s = await getState(uid);
  if (paused(s) || !slips.length) return { added: 0, updated: 0 };
  const doc = await readDoc(uid);
  const have = new Map((listOf("picks", doc) as Pick[]).map((p) => [p.id, p]));
  const put: Record<string, Stamped> = {};
  let added = 0;
  let updated = 0;
  const t = Date.now();
  for (const slip of slips.slice(0, 100)) {
    const bets = (slip.bets ?? []).slice(0, 20);
    if (!bets.length) continue;
    const slipId = syncSlipId(slip.id);
    const book = slip.book?.name || "Synced book";
    const known = bets.every((_, i) => have.has(syncPickId(slip.id, i)));
    if (known) {
      // Seen before (dedupe on betSlip id): only the grade can change.
      bets.forEach((b, i) => {
        const id = syncPickId(slip.id, i);
        const old = have.get(id)!;
        const st = outcomeStatus(b.outcome, b.status);
        if (st !== "open" && st !== old.status) {
          put[id] = { v: { ...old, status: st }, t };
          updated++;
        }
      });
      continue;
    }
    const rows = bets.map(rowFromBet);
    const legs = await matchRows(rows).catch(() => rows.map((row) => ({ row, leg: null, game: null, issue: "not matched" })));
    legs.forEach((x, i) => {
      const b = bets[i];
      const id = syncPickId(slip.id, i);
      const status = outcomeStatus(b.outcome, b.status);
      const extra = { slipId, book, stake: 0, odds: b.oddsAmerican ?? null };
      let p: Pick;
      if (x.leg && x.game) {
        p = pickFromLeg(x.row.kind === "prop" ? { ...x.leg, market: x.row.market } : x.leg, { home: x.game.home, away: x.game.away }, { ...extra, date: x.game.start.slice(0, 10) });
        if (status === "open" && "result" in x && x.result) p.status = x.result;
      } else {
        p = {
          id,
          slipId,
          sport: sportOf(x.row.league ?? ""),
          subject: x.row.subject,
          line: x.row.line ?? 0,
          odds: b.oddsAmerican && Math.abs(b.oddsAmerican) >= 100 ? Math.round(b.oddsAmerican) : 0,
          stake: 0,
          book,
          date: x.row.date ?? (slip.timePlaced ?? new Date().toISOString()).slice(0, 10),
          status: "open",
          createdAt: new Date().toISOString(),
          market: x.row.market,
          selection: x.row.selection,
        };
      }
      p = { ...p, id, source: "booksync", syncId: slip.id, createdAt: slip.timePlaced ?? p.createdAt };
      if (status !== "open") p.status = status;
      put[id] = { v: p, t };
      added++;
    });
    await redis(["SADD", K.seen(uid), slip.id]);
  }
  if (Object.keys(put).length) await pushChanges(uid, { cols: { picks: { put, del: {} } }, singles: {} });
  return { added, updated };
}

/** Pull recent slips for one linked book (used after a refresh webhook with no slips inline). */
export async function pullAccount(uid: string, acct: string): Promise<SsBetSlip[]> {
  void uid;
  const r = (await ss(`/bettorAccounts/${encodeURIComponent(acct)}/betSlips?limit=50`, { key: priv() })) as SsBetSlip[] | { results?: SsBetSlip[] };
  return Array.isArray(r) ? r : r.results ?? [];
}

/** Read a bettorAccount straight from SharpSports (sandbox webhooks are re-checked this way). */
export async function fetchAccount(acct: string): Promise<{ bettor: string | null; book: string | null; verified: boolean } | null> {
  const r = (await ss(`/bettorAccounts/${encodeURIComponent(acct)}`, { key: priv() })) as { bettor?: string | { id?: string }; book?: { name?: string } | string; verified?: boolean; access?: boolean };
  const bettor = typeof r.bettor === "string" ? r.bettor : r.bettor?.id ?? null;
  const book = typeof r.book === "string" ? r.book : r.book?.name ?? null;
  return { bettor, book, verified: r.verified !== false && r.access !== false };
}

export type RefreshResult = { ok: true } | { ok: false; reason: "limit" | "paused" | "relink" | "unknown" | "error" };
export async function manualRefresh(uid: string, acct: string): Promise<RefreshResult> {
  const s = await getState(uid);
  if (paused(s)) return { ok: false, reason: "paused" };
  const a = s.accounts[acct];
  if (!a) return { ok: false, reason: "unknown" };
  if (a.status === "relink") return { ok: false, reason: "relink" };
  if (!(await rateOk(`bs:refresh:${acct}:${dayKey()}`, MANUAL_REFRESH_PER_DAY, 86400))) return { ok: false, reason: "limit" };
  try {
    await ss(`/bettorAccounts/${encodeURIComponent(acct)}/refresh`, { method: "POST", key: pub() });
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Unlink everything: SharpSports access off for each book, synced Log rows deleted, our link data gone. */
export async function unlinkAll(uid: string): Promise<{ removed: number }> {
  const s = await getState(uid);
  await Promise.all(Object.keys(s.accounts).map((a) => ss(`/bettorAccounts/${encodeURIComponent(a)}/access`, { method: "PUT", key: pub(), body: { access: false } }).catch(() => null)));
  const doc = await readDoc(uid);
  const t = Date.now();
  const del: Record<string, number> = {};
  for (const p of listOf("picks", doc) as Pick[]) if (p.source === "booksync") del[p.id] = t;
  if (Object.keys(del).length) await pushChanges(uid, { cols: { picks: { put: {}, del } }, singles: {} });
  const keys = [K.state(uid), K.seen(uid)];
  if (s.iid) keys.push(K.iid(s.iid));
  if (s.bettor) keys.push(K.bettor(s.bettor));
  await redis(["DEL", ...keys]);
  // Self-exclusion outlives an unlink: keep the pause if one is running.
  if (paused(s)) await saveState(uid, { ...empty(), pausedUntil: s.pausedUntil });
  return { removed: Object.keys(del).length };
}

export async function setPrefs(uid: string, p: { showPublic?: boolean; pauseDays?: number }) {
  const s = await getState(uid);
  if (typeof p.showPublic === "boolean") s.showPublic = p.showPublic;
  if (p.pauseDays && [1, 7, 30, 90, 365].includes(p.pauseDays)) {
    s.pausedUntil = new Date(Date.now() + p.pauseDays * 86400e3).toISOString();
    s.showPublic = false;
    await Promise.all(Object.keys(s.accounts).map((a) => ss(`/bettorAccounts/${encodeURIComponent(a)}/paused`, { method: "PUT", key: pub(), body: { paused: true } }).catch(() => null)));
  }
  await saveState(uid, s);
  return s;
}
