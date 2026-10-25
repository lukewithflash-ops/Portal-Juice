import "server-only";
import { redis } from "@/lib/chat";
import { readDoc } from "@/lib/cloud";
import { listOf } from "@/lib/syncCore";
import { EMOTES } from "@/lib/questsCore";
import { getUser } from "@/lib/auth";
import { handleSeed, positionDone } from "@/lib/socialCore";
export { handleSeed, positionDone };

/**
 * Friends and squads for signed-in accounts. Friends see each other only by handle; account ids never
 * leave the server. Shared picks are W/L/P/open with no stake, price or link. Sharing is on for friends
 * by default and can be turned off; block hides you both ways.
 */

/** edited: the one free handle change has been used. */
export type Profile = { handle: string; share: boolean; createdAt: string; edited?: boolean; auto?: boolean };
export type SlimPick = { id: string; subject: string; line: number; market: string | null; selection: "Over" | "Under" | null; league: string | null; gameId: string | null; status: string; date: string; slipId: string | null; createdAt: string; sport?: string; plus?: boolean };
export type Squad = { id: string; name: string; owner: string; members: string[]; code: string };

const K = {
  prof: (u: string) => `pj:prof:${u}`,
  hdl: (h: string) => `pj:hdl:${h.toLowerCase()}`,
  fr: (u: string) => `pj:fr:${u}`,
  frq: (u: string) => `pj:frq:${u}`,
  blk: (u: string) => `pj:blk:${u}`,
  inv: (c: string) => `pj:inv:${c}`,
  myinv: (u: string) => `pj:myinv:${u}`,
  sq: (id: string) => `pj:sq:${id}`,
  usq: (u: string) => `pj:usq:${u}`,
  sqinv: (c: string) => `pj:sqinv:${c}`,
  rx: (owner: string, pick: string) => `pj:frx:${owner}:${pick}`,
  rxlog: (owner: string) => `pj:frxlog:${owner}`,
  tail: (owner: string) => `pj:tail:${owner}`,
  tailed: (u: string, owner: string, pick: string) => `pj:tailed:${u}:${owner}:${pick}`,
  pos: (u: string) => `pj:pos:${u}`,
};

const code = (n = 8) => {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = crypto.getRandomValues(new Uint8Array(n));
  return [...b].map((x) => a[x % a.length]).join("");
};
const smembers = async (k: string) => ((await redis(["SMEMBERS", k])) as string[] | null) ?? [];

export const cleanHandle = (h: unknown) => (typeof h === "string" && /^[A-Za-z0-9_]{3,16}$/.test(h.trim()) ? h.trim() : null);

export async function getProfile(uid: string): Promise<Profile | null> {
  const raw = (await redis(["GET", K.prof(uid)])) as string | null;
  try {
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export async function uidOf(handle: string): Promise<string | null> {
  return ((await redis(["GET", K.hdl(handle)])) as string | null) ?? null;
}

export async function claimHandle(uid: string, handle: string): Promise<{ ok: true; profile: Profile } | { ok: false; error: string }> {
  const h = cleanHandle(handle);
  if (!h) return { ok: false, error: "Handle is 3–16 letters, numbers or _." };
  const prev = await getProfile(uid);
  if (prev?.edited && prev.handle.toLowerCase() !== h.toLowerCase()) return { ok: false, error: "You have already changed your handle once." };
  if (prev && prev.handle.toLowerCase() === h.toLowerCase()) {
    const p = { ...prev, handle: h };
    await redis(["SET", K.prof(uid), JSON.stringify(p)]);
    return { ok: true, profile: p };
  }
  const got = await redis(["SET", K.hdl(h), uid, "NX"]);
  if (got !== "OK") return { ok: false, error: "That handle is taken." };
  if (prev) await redis(["DEL", K.hdl(prev.handle)]);
  const p: Profile = { handle: h, share: prev?.share ?? true, createdAt: prev?.createdAt ?? new Date().toISOString(), edited: prev ? true : undefined };
  await redis(["SET", K.prof(uid), JSON.stringify(p)]);
  return { ok: true, profile: p };
}

/**
 * Every signed-in account gets a handle without typing one: seeded from the account, with digits added
 * when taken. Existing handles are kept as they are (they still have their one free change).
 */
export async function ensureProfile(uid: string): Promise<Profile> {
  const have = await getProfile(uid);
  if (have) return have;
  const u = await getUser(uid).catch(() => null);
  const base = handleSeed(u?.name, u?.email);
  const tries = [base, ...Array.from({ length: 6 }, () => base.slice(0, 12) + String(10 + Math.floor(Math.random() * 9990))), "pj" + code(8).toLowerCase()];
  for (const t of tries) {
    const h = cleanHandle(t);
    if (!h) continue;
    if ((await redis(["SET", K.hdl(h), uid, "NX"])) !== "OK") continue;
    const p: Profile = { handle: h, share: true, createdAt: new Date().toISOString(), auto: true };
    await redis(["SET", K.prof(uid), JSON.stringify(p)]);
    return p;
  }
  throw new Error("no handle");
}

export async function setShare(uid: string, on: boolean) {
  const p = await getProfile(uid);
  if (p) await redis(["SET", K.prof(uid), JSON.stringify({ ...p, share: on })]);
}

async function blockedEither(a: string, b: string) {
  const [x, y] = await Promise.all([redis(["SISMEMBER", K.blk(a), b]), redis(["SISMEMBER", K.blk(b), a])]);
  return Number(x) === 1 || Number(y) === 1;
}

async function befriend(a: string, b: string) {
  await Promise.all([redis(["SADD", K.fr(a), b]), redis(["SADD", K.fr(b), a]), redis(["SREM", K.frq(a), b]), redis(["SREM", K.frq(b), a])]);
}

export async function addFriend(uid: string, handle: string): Promise<{ ok: true; status: "friends" | "requested" } | { ok: false; error: string }> {
  const other = await uidOf(handle);
  if (!other || other === uid) return { ok: false, error: "No one with that handle." };
  if (await blockedEither(uid, other)) return { ok: false, error: "No one with that handle." };
  if (Number(await redis(["SISMEMBER", K.frq(uid), other])) === 1) {
    await befriend(uid, other);
    return { ok: true, status: "friends" };
  }
  if (Number(await redis(["SISMEMBER", K.fr(uid), other])) === 1) return { ok: true, status: "friends" };
  await redis(["SADD", K.frq(other), uid]);
  return { ok: true, status: "requested" };
}

export async function answer(uid: string, handle: string, yes: boolean) {
  const other = await uidOf(handle);
  if (!other) return;
  if (yes && Number(await redis(["SISMEMBER", K.frq(uid), other])) === 1) await befriend(uid, other);
  else await redis(["SREM", K.frq(uid), other]);
}

export async function removeFriend(uid: string, handle: string) {
  const other = await uidOf(handle);
  if (!other) return;
  await Promise.all([redis(["SREM", K.fr(uid), other]), redis(["SREM", K.fr(other), uid]), redis(["SREM", K.frq(uid), other]), redis(["SREM", K.frq(other), uid])]);
}

export async function block(uid: string, handle: string, on: boolean) {
  const other = await uidOf(handle);
  if (!other || other === uid) return;
  if (on) {
    await removeFriend(uid, handle);
    await redis(["SADD", K.blk(uid), other]);
  } else await redis(["SREM", K.blk(uid), other]);
}

export async function myInvite(uid: string): Promise<string> {
  const have = (await redis(["GET", K.myinv(uid)])) as string | null;
  if (have && (await redis(["GET", K.inv(have)]))) return have;
  const c = code();
  await redis(["SET", K.inv(c), uid, "EX", 30 * 86400]);
  await redis(["SET", K.myinv(uid), c, "EX", 30 * 86400]);
  return c;
}

export async function joinInvite(uid: string, c: string): Promise<{ ok: true; handle: string; squad?: string } | { ok: false; error: string }> {
  const clean = String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  const sid = (await redis(["GET", K.sqinv(clean)])) as string | null;
  if (sid) {
    const s = await getSquad(sid);
    if (!s) return { ok: false, error: "That invite expired." };
    if (!s.members.includes(uid)) {
      if (s.members.length >= 20) return { ok: false, error: "That squad is full (20)." };
      s.members.push(uid);
      await redis(["SET", K.sq(sid), JSON.stringify(s)]);
      await redis(["SADD", K.usq(uid), sid]);
    }
    return { ok: true, handle: "", squad: s.name };
  }
  const other = (await redis(["GET", K.inv(clean)])) as string | null;
  if (!other) return { ok: false, error: "That invite expired." };
  if (other === uid) return { ok: false, error: "That is your own invite." };
  if (await blockedEither(uid, other)) return { ok: false, error: "That invite expired." };
  await befriend(uid, other);
  return { ok: true, handle: (await getProfile(other))?.handle ?? "" };
}

/** What a code opens, for the join sheet. No account needed; shows the name and size only. */
export async function peekInvite(c: string): Promise<{ kind: "squad"; name: string; size: number } | { kind: "friend"; handle: string } | null> {
  const clean = String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  if (!clean) return null;
  const sid = (await redis(["GET", K.sqinv(clean)])) as string | null;
  if (sid) {
    const sq = await getSquad(sid);
    return sq ? { kind: "squad", name: sq.name, size: sq.members.length } : null;
  }
  const other = (await redis(["GET", K.inv(clean)])) as string | null;
  if (!other) return null;
  const h = (await getProfile(other))?.handle;
  return h ? { kind: "friend", handle: h } : null;
}

export async function getSquad(id: string): Promise<Squad | null> {
  const raw = (await redis(["GET", K.sq(id)])) as string | null;
  try {
    return raw ? (JSON.parse(raw) as Squad) : null;
  } catch {
    return null;
  }
}

export async function createSquad(uid: string, name: string): Promise<Squad | { error: string }> {
  const n = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
  if (n.length < 2) return { error: "Name the squad (2–24 characters)." };
  if (((await smembers(K.usq(uid))).length) >= 5) return { error: "Five squads max." };
  const s: Squad = { id: crypto.randomUUID(), name: n, owner: uid, members: [uid], code: code(8) };
  await redis(["SET", K.sq(s.id), JSON.stringify(s)]);
  await redis(["SET", K.sqinv(s.code), s.id]);
  await redis(["SADD", K.usq(uid), s.id]);
  return s;
}

export async function leaveSquad(uid: string, id: string) {
  const s = await getSquad(id);
  await redis(["SREM", K.usq(uid), id]);
  if (!s) return;
  s.members = s.members.filter((m) => m !== uid);
  if (!s.members.length) {
    await redis(["DEL", K.sq(id)]);
    await redis(["DEL", K.sqinv(s.code)]);
  } else await redis(["SET", K.sq(id), JSON.stringify({ ...s, owner: s.owner === uid ? s.members[0] : s.owner })]);
}

const handleOf = async (u: string) => (await getProfile(u))?.handle ?? (await ensureProfile(u).catch(() => null))?.handle ?? null;

export async function overview(uid: string) {
  await ensureProfile(uid).catch(() => null);
  const [me, fr, rq, bl, sqIds] = await Promise.all([getProfile(uid), smembers(K.fr(uid)), smembers(K.frq(uid)), smembers(K.blk(uid)), smembers(K.usq(uid))]);
  const friends = (await Promise.all(fr.map(async (u) => ({ handle: await handleOf(u), share: (await getProfile(u))?.share ?? true })))).filter((f) => f.handle) as { handle: string; share: boolean }[];
  const requests = (await Promise.all(rq.map(handleOf))).filter(Boolean) as string[];
  const blocked = (await Promise.all(bl.map(handleOf))).filter(Boolean) as string[];
  const squads = (await Promise.all(sqIds.map(getSquad))).filter((s): s is Squad => !!s);
  const squadsOut = await Promise.all(squads.map(async (s) => ({ id: s.id, name: s.name, code: s.code, mine: s.owner === uid, members: ((await Promise.all(s.members.map(handleOf))).filter(Boolean) as string[]) })));
  return { me, friends, requests, blocked, squads: squadsOut, invite: me ? await myInvite(uid) : null };
}

/** Everyone whose open picks this user can see: mutual friends with sharing on, not blocked. Squadmates who
 * aren't friends see only the one shared live position. */
async function circle(uid: string): Promise<string[]> {
  const all = (await smembers(K.fr(uid))).filter((u) => u !== uid);
  const ok = await Promise.all(all.map(async (u) => !(await blockedEither(uid, u)) && ((await getProfile(u))?.share ?? true)));
  return all.filter((_, i) => ok[i]).slice(0, 40);
}

/** A friend's open picks and parlays (W/L/P/open, no stakes). Non-friends and blocked people get only the shared position. */
export async function friendView(uid: string, handle: string): Promise<{ friend: boolean; handle: string; share?: boolean; picks?: SlimPick[]; position: LivePosition | null }> {
  const other = await uidOf(handle);
  const h = cleanHandle(handle) ?? "";
  if (!other || other === uid || (await blockedEither(uid, other))) return { friend: false, handle: h, position: other && other !== uid && !(await blockedEither(uid, other)) ? await positionOf(other) : null };
  const prof = await getProfile(other);
  const friend = Number(await redis(["SISMEMBER", K.fr(uid), other])) === 1;
  const position = await positionOf(other);
  if (!friend) return { friend: false, handle: prof?.handle ?? h, position };
  if (prof && prof.share === false) return { friend: true, handle: prof.handle, share: false, picks: [], position };
  const picks = (listOf("picks", await readDoc(other)) as Record<string, unknown>[]).map(slim).filter((p): p is SlimPick => !!p && p.status === "open").slice(0, 60);
  return { friend: true, handle: prof?.handle ?? h, share: true, picks, position };
}

export function slim(p: Record<string, unknown>): SlimPick | null {
  if (typeof p.id !== "string" || typeof p.subject !== "string") return null;
  // Slips synced from a linked book are private: friends, feeds and shared positions never see them.
  if (p.source === "booksync") return null;
  return {
    id: p.id,
    subject: String(p.subject).slice(0, 60),
    line: Number(p.line) || 0,
    market: typeof p.market === "string" ? p.market.slice(0, 40) : null,
    selection: p.selection === "Over" || p.selection === "Under" ? p.selection : null,
    league: typeof p.league === "string" ? p.league : null,
    gameId: typeof p.gameId === "string" ? p.gameId : null,
    status: ["open", "win", "loss", "push"].includes(String(p.status)) ? String(p.status) : "open",
    date: String(p.date ?? "").slice(0, 10),
    slipId: typeof p.slipId === "string" ? p.slipId : null,
    createdAt: String(p.createdAt ?? ""),
    sport: typeof p.sport === "string" ? p.sport : undefined,
    plus: p.plus === true ? true : undefined,
  };
}

const recent = (p: SlimPick) => p.status === "open" || Date.now() - Date.parse((p.date || p.createdAt.slice(0, 10)) + "T12:00:00Z") < 2 * 86400000;

async function rxFor(owner: string, ids: string[]) {
  const out: Record<string, Record<string, number>> = {};
  await Promise.all(
    ids.map(async (id) => {
      const flat = ((await redis(["HGETALL", K.rx(owner, id)])) as string[] | null) ?? [];
      if (!flat.length) return;
      const m: Record<string, number> = {};
      for (let i = 1; i < flat.length; i += 2) m[flat[i]] = (m[flat[i]] ?? 0) + 1;
      out[id] = m;
    })
  );
  return out;
}

async function tailsFor(owner: string) {
  const flat = ((await redis(["HGETALL", K.tail(owner)])) as string[] | null) ?? [];
  const m: Record<string, number> = {};
  for (let i = 0; i < flat.length; i += 2) m[flat[i]] = Number(flat[i + 1]) || 0;
  return m;
}

export async function feed(uid: string) {
  const people = await circle(uid);
  const friends = await Promise.all(
    people.map(async (u) => {
      const prof = await getProfile(u);
      if (!prof) return null;
      const doc = await readDoc(u);
      const picks = (listOf("picks", doc) as Record<string, unknown>[]).map(slim).filter((p): p is SlimPick => !!p && recent(p)).slice(0, 40);
      const [rx, tails] = await Promise.all([rxFor(u, picks.map((p) => p.id)), tailsFor(u)]);
      return { handle: prof.handle, picks, reactions: rx, tails };
    })
  );
  const log = (((await redis(["LRANGE", K.rxlog(uid), "0", "29"])) as string[] | null) ?? []).map((x) => {
    try {
      return JSON.parse(x) as { from: string; emote: string; subject: string; ts: number; kind: "react" | "tail" };
    } catch {
      return null;
    }
  }).filter(Boolean);
  return { friends: friends.filter(Boolean), mine: { tails: await tailsFor(uid), log } };
}

async function inCircle(uid: string, ownerHandle: string): Promise<string | null> {
  const owner = await uidOf(ownerHandle);
  if (!owner || owner === uid) return null;
  return (await circle(uid)).includes(owner) ? owner : null;
}

export async function react(uid: string, ownerHandle: string, pickId: string, emote: string): Promise<boolean> {
  if (!EMOTES.some((e) => e.id === emote) || !/^[A-Za-z0-9_-]{1,40}$/.test(pickId)) return false;
  const owner = await inCircle(uid, ownerHandle);
  if (!owner) return false;
  const doc = await readDoc(owner);
  const pick = (listOf("picks", doc) as Record<string, unknown>[]).find((p) => p.id === pickId);
  if (!pick) return false;
  await redis(["HSET", K.rx(owner, pickId), uid, emote]);
  await redis(["EXPIRE", K.rx(owner, pickId), 14 * 86400]);
  const from = (await getProfile(uid))?.handle ?? "friend";
  await redis(["LPUSH", K.rxlog(owner), JSON.stringify({ from, emote, subject: String(pick.subject ?? "").slice(0, 60), ts: Date.now(), kind: "react" })]);
  await redis(["LTRIM", K.rxlog(owner), "0", "49"]);
  return true;
}

export async function tail(uid: string, ownerHandle: string, pickIds: string[]): Promise<SlimPick[] | null> {
  let owner = await inCircle(uid, ownerHandle);
  if (!owner) {
    // A shared live position can be tailed by anyone who is not blocked.
    const o = await uidOf(ownerHandle);
    const pos = o && o !== uid && !(await blockedEither(uid, o)) ? await rawPos(o) : null;
    if (pos && pickIds.length && pickIds.every((id) => pos.ids.includes(id))) owner = o;
  }
  if (!owner) return null;
  const doc = await readDoc(owner);
  const all = (listOf("picks", doc) as Record<string, unknown>[]).map(slim).filter((p): p is SlimPick => !!p);
  const chosen = all.filter((p) => pickIds.includes(p.id)).slice(0, 20);
  if (!chosen.length) return null;
  const counted = chosen[0].slipId && chosen.length > 1 ? [chosen[0].slipId] : chosen.map((p) => p.id);
  for (const k of counted) {
    const once = await redis(["SET", K.tailed(uid, owner, k), "1", "EX", 30 * 86400, "NX"]);
    if (once === "OK") await redis(["HINCRBY", K.tail(owner), k, 1]);
  }
  const from = (await getProfile(uid))?.handle ?? "friend";
  await redis(["LPUSH", K.rxlog(owner), JSON.stringify({ from, emote: "tail", subject: chosen.length > 1 ? `${chosen.length}-leg parlay` : chosen[0].subject, ts: Date.now(), kind: "tail" })]);
  await redis(["LTRIM", K.rxlog(owner), "0", "49"]);
  return chosen;
}

/* ---- Live position: one open pick or parlay per account, visible next to the handle everywhere. ---- */
type RawPos = { ids: string[]; setAt: string };
export type LivePosition = { handle: string; legs: SlimPick[]; setAt: string };

async function rawPos(uid: string): Promise<RawPos | null> {
  const raw = (await redis(["GET", K.pos(uid)])) as string | null;
  try {
    return raw ? (JSON.parse(raw) as RawPos) : null;
  } catch {
    return null;
  }
}

export async function setPosition(uid: string, ids: string[]): Promise<{ ok: true; position: LivePosition } | { ok: false; error: string }> {
  const want = [...new Set(ids.filter((x) => typeof x === "string" && /^[A-Za-z0-9_:-]{1,60}$/.test(x)))].slice(0, 20);
  if (!want.length) return { ok: false, error: "Pick something to share." };
  const prof = await ensureProfile(uid);
  const all = (listOf("picks", await readDoc(uid)) as Record<string, unknown>[]).map(slim).filter((p): p is SlimPick => !!p);
  const legs = want.map((id) => all.find((p) => p.id === id)).filter((p): p is SlimPick => !!p);
  if (legs.length !== want.length) return { ok: false, error: "That pick hasn't synced yet. Try again in a moment." };
  if (legs.length > 1 && new Set(legs.map((l) => l.slipId)).size !== 1) return { ok: false, error: "Share one pick or one parlay." };
  if (positionDone(legs)) return { ok: false, error: "That one is already graded." };
  const r: RawPos = { ids: want, setAt: new Date().toISOString() };
  await redis(["SET", K.pos(uid), JSON.stringify(r), "EX", 7 * 86400]);
  return { ok: true, position: { handle: prof.handle, legs, setAt: r.setAt } };
}

export async function clearPosition(uid: string) {
  await redis(["DEL", K.pos(uid)]);
}

/** Current statuses from the owner's synced Log; clears itself once graded or deleted. */
export async function positionOf(uid: string): Promise<LivePosition | null> {
  const r = await rawPos(uid);
  if (!r) return null;
  const prof = await getProfile(uid);
  if (!prof) return null;
  const all = (listOf("picks", await readDoc(uid)) as Record<string, unknown>[]).map(slim).filter((p): p is SlimPick => !!p);
  const legs = r.ids.map((id) => all.find((p) => p.id === id)).filter((p): p is SlimPick => !!p);
  if (legs.length !== r.ids.length || positionDone(legs)) {
    await clearPosition(uid);
    return null;
  }
  return { handle: prof.handle, legs, setAt: r.setAt };
}

/** Positions for a list of handles (threads, squads, leaders). Blocked people are left out for a signed-in viewer. */
export async function positionsFor(handles: string[], viewer: string | null): Promise<Record<string, LivePosition>> {
  const out: Record<string, LivePosition> = {};
  const uniq = [...new Set(handles.map((h) => cleanHandle(h.replace(/^@/, ""))).filter((h): h is string => !!h).map((h) => h.toLowerCase()))].slice(0, 40);
  await Promise.all(
    uniq.map(async (h) => {
      const u = await uidOf(h);
      if (!u) return;
      if (viewer && viewer !== u && (await blockedEither(viewer, u))) return;
      if (!(await redis(["EXISTS", K.pos(u)]))) return;
      const p = await positionOf(u);
      if (p) out[h] = p;
    })
  );
  return out;
}

/** Account delete: drop the profile, handle, friendships and squads. */
export async function dropSocial(uid: string) {
  const p = await getProfile(uid);
  for (const f of await smembers(K.fr(uid))) await redis(["SREM", K.fr(f), uid]);
  for (const s of await smembers(K.usq(uid))) await leaveSquad(uid, s);
  const inv = (await redis(["GET", K.myinv(uid)])) as string | null;
  await Promise.all([
    p ? redis(["DEL", K.hdl(p.handle)]) : null,
    redis(["DEL", K.prof(uid)]),
    redis(["DEL", K.fr(uid)]),
    redis(["DEL", K.frq(uid)]),
    redis(["DEL", K.blk(uid)]),
    redis(["DEL", K.usq(uid)]),
    redis(["DEL", K.rxlog(uid)]),
    redis(["DEL", K.tail(uid)]),
    inv ? redis(["DEL", K.inv(inv)]) : null,
    redis(["DEL", K.myinv(uid)]),
    redis(["DEL", K.pos(uid)]),
  ]);
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  return Number(await redis(["SISMEMBER", K.fr(a), b])) === 1;
}
