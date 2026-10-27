import "server-only";
import { randomBytes } from "node:crypto";
import { chatEnabled, redis } from "@/lib/chat";
import { readDoc } from "@/lib/cloud";
import { tally, type Tally } from "@/lib/myStats";
import { gradeParlay, parlays, parlayTally } from "@/lib/parlayRecord";
import type { Pick } from "@/lib/types";

/**
 * Public pick links (/p/<id>). Made only when the owner taps Share. The link stores a pointer
 * (account + pick or slip id), never a copy: the page re-reads the account's synced log each time,
 * so the result updates as it grades and disappears if the pick is deleted or the link is turned off.
 */
type Ref = { uid: string; key: string; slip: boolean; at: number };
const K = { ref: (id: string) => `pj:ps:${id}`, mine: (uid: string, key: string) => `pj:ps:u:${uid}:${key}` };

export type ShareLeg = { subject: string; market: string | null; side: string; odds: number; status: Pick["status"]; league: string | null; gameId: string | null; book: string };
export type ShareView = { id: string; handle: string | null; legs: ShareLeg[]; result: Pick["status"]; parlay: boolean; date: string; record: Tally; parlayRecord: { w: number; l: number; p: number } };

function picksOf(doc: Awaited<ReturnType<typeof readDoc>>): Pick[] {
  return Object.values(doc.cols.picks?.items ?? {}).map((s) => s.v as Pick).filter((p) => p && typeof p.id === "string" && typeof p.subject === "string");
}

export async function createShare(uid: string, pickId: string): Promise<string | null> {
  if (!chatEnabled()) return null;
  const all = picksOf(await readDoc(uid));
  const p = all.find((x) => x.id === pickId);
  if (!p) return null;
  const slip = !!p.slipId && all.filter((x) => x.slipId === p.slipId).length > 1;
  const key = slip ? p.slipId! : p.id;
  const have = (await redis(["GET", K.mine(uid, key)])) as string | null;
  if (have) return have;
  const id = randomBytes(6).toString("base64url");
  await redis(["SET", K.ref(id), JSON.stringify({ uid, key, slip, at: Date.now() } satisfies Ref)]);
  await redis(["SET", K.mine(uid, key), id]);
  return id;
}

export async function removeShare(uid: string, id: string): Promise<boolean> {
  const raw = (await redis(["GET", K.ref(id)])) as string | null;
  const r = raw ? (JSON.parse(raw) as Ref) : null;
  if (!r || r.uid !== uid) return false;
  await redis(["DEL", K.ref(id), K.mine(uid, r.key)]);
  return true;
}

const sideOf = (p: Pick) => (p.selection ? `${p.selection} ${p.plus ? `${p.line + 0.5}+` : p.line}` : /money|^ml$/i.test(p.market ?? "") ? "to win" : p.line > 0 ? `+${p.line}` : String(p.line));

export async function loadShare(id: string): Promise<ShareView | null> {
  if (!chatEnabled() || !/^[A-Za-z0-9_-]{6,16}$/.test(id)) return null;
  const raw = (await redis(["GET", K.ref(id)])) as string | null;
  if (!raw) return null;
  const r = JSON.parse(raw) as Ref;
  const doc = await readDoc(r.uid);
  const all = picksOf(doc);
  const legs = all.filter((p) => (r.slip ? p.slipId === r.key : p.id === r.key));
  if (!legs.length) return null;
  const handle = (doc.singles["pj-handle"]?.v ?? doc.singles["pj-leader-handle"]?.v ?? null) as string | null;
  const pt = parlayTally(parlays(all));
  return {
    id,
    handle: handle ? handle.replace(/^@/, "") : null,
    legs: legs.map((p) => ({ subject: p.subject, market: p.market || null, side: sideOf(p), odds: p.odds, status: p.status, league: p.league ?? null, gameId: p.gameId ?? null, book: p.book })),
    result: r.slip ? gradeParlay(legs) : legs[0].status,
    parlay: r.slip,
    date: legs[0].date,
    record: tally(all),
    parlayRecord: { w: pt.w, l: pt.l, p: pt.p },
  };
}
