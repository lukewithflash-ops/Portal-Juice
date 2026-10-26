import "server-only";
import { cleanText, redis } from "@/lib/chat";
import { getProfile, getSquad, ensureProfile, uidOf, block as socialBlock } from "@/lib/social";
import { coinsOn, emotesOf, lookOf, markActivity } from "@/lib/coins";
import { FREE_EMOTES, type Look } from "@/lib/coinsCore";
import { leagueById } from "@/lib/slate";
import { sportLeague } from "@/lib/sports";
import { isRacing } from "@/lib/racing";
import { getLive } from "@/lib/espn";
import { bigPlay, lineOf } from "@/lib/threadPlays";
import { SPORT_ORDER, type Sport } from "@/lib/types";

/**
 * Live game chat: one public room per game (every league, every event). Names come from the account handle with
 * equipped cosmetics. Account ids stay on the server. Rooms expire 3 days after the last message, 24h after the final.
 */
import { cleanPos, type SharedPos } from "@/lib/sharePos";
export type SharedPick = { subject: string; line: number; market: string | null; selection: "Over" | "Under" | null; sport: Sport; plus?: boolean };
export type GcMsg = { id: string; handle: string; text: string; ts: number; kind: "msg" | "sys"; mentions: string[]; rx: Record<string, number>; look?: Look; pick?: SharedPick; pos?: SharedPos; mine?: boolean; squad?: boolean; atMe?: boolean };
type Stored = Omit<GcMsg, "rx" | "mine" | "squad" | "atMe"> & { uid?: string };

const ROOM_TTL = 3 * 86400;
const FINAL_TTL = 86400;
const KEEP = 100;
const K = {
  list: (r: string) => `pj:gc:${r}`,
  rx: (r: string) => `pj:gc:rx:${r}`,
  rxWho: (r: string, m: string, e: string, u: string) => `pj:gc:rxw:${r}:${m}:${e}:${u}`,
  del: (r: string) => `pj:gc:del:${r}`,
  rep: (r: string, m: string) => `pj:gc:rep:${r}:${m}`,
  seen: (r: string) => `pj:gc:sys:${r}`,
  sysLock: (r: string) => `pj:gc:syslock:${r}`,
  sysRate: (r: string) => `pj:gc:sysrate:${r}`,
  final: (r: string) => `pj:gc:final:${r}`,
  mute: (u: string) => `pj:gc:mute:${u}`,
  blk: (u: string) => `pj:blk:${u}`,
  sqmates: (u: string) => `pj:gc:sqm:${u}`,
  reports: "pj:gc:reports",
};

export function validRoom(league: string, id: string): string | null {
  const l = league.toLowerCase();
  if (!/^[a-z0-9._-]{2,40}$/.test(l) || !/^[A-Za-z0-9_.-]{1,48}$/.test(id)) return null;
  if (!leagueById(l) && !sportLeague(l) && !isRacing(l)) return null;
  return `${l}:${id}`;
}

const pbpLeague = (l: string) => Boolean(leagueById(l) || ["team", "soccer"].includes(sportLeague(l)?.kind ?? ""));

async function touch(room: string) {
  const fin = await redis(["EXISTS", K.final(room)]);
  const ttl = Number(fin) ? FINAL_TTL : ROOM_TTL;
  await Promise.all([K.list(room), K.rx(room), K.del(room)].map((k) => redis(["EXPIRE", k, ttl])));
}

/** Big plays from the real play-by-play only. One sync per game per 20s, at most 6 lines per 10 minutes. */
export async function syncSystem(league: string, id: string, room: string): Promise<void> {
  if (!pbpLeague(league)) return;
  if ((await redis(["SET", K.sysLock(room), "1", "NX", "EX", 20])) !== "OK") return;
  const snap = await getLive(league, id).catch(() => null);
  if (!snap || snap.state === "pre") return;
  const big = [...(snap.keyPlays ?? []), ...snap.plays]
    .map((p) => ({ p, tag: bigPlay(league, p) }))
    .filter((x): x is { p: typeof x.p; tag: string } => Boolean(x.tag && x.p.id));
  const firstRun = Number(await redis(["EXISTS", K.seen(room)])) === 0;
  if (firstRun) {
    await redis(["SADD", K.seen(room), "init", ...big.slice(0, -2).map((x) => x.p.id)]);
    await redis(["EXPIRE", K.seen(room), ROOM_TTL]);
  }
  const lines: { pid: string; text: string }[] = [];
  for (const { p, tag } of firstRun ? big.slice(-2) : big) lines.push({ pid: p.id, text: lineOf(league, snap, p, tag) });
  if (snap.state === "post") lines.push({ pid: "final", text: `🏁 Final · ${snap.awayAbbr} ${snap.awayScore ?? ""}–${snap.homeScore ?? ""} ${snap.homeAbbr}` });
  for (const l of lines) {
    if (Number(await redis(["SADD", K.seen(room), l.pid])) !== 1) continue;
    if (l.pid !== "final") {
      const n = Number(await redis(["INCR", K.sysRate(room)]));
      if (n === 1) await redis(["EXPIRE", K.sysRate(room), 600]);
      if (n > 6) continue;
    }
    const m: Stored = { id: crypto.randomUUID(), handle: "Portal", text: l.text.slice(0, 220), ts: Date.now(), kind: "sys", mentions: [] };
    await redis(["LPUSH", K.list(room), JSON.stringify(m)]);
    await redis(["LTRIM", K.list(room), 0, KEEP - 1]);
    if (l.pid === "final") await redis(["SET", K.final(room), "1", "EX", FINAL_TTL]);
  }
  await redis(["EXPIRE", K.seen(room), ROOM_TTL]);
  await touch(room);
}

/** Uids of everyone the viewer shares a squad with (cached 60s). */
async function squadMates(uid: string): Promise<Set<string>> {
  const c = (await redis(["GET", K.sqmates(uid)])) as string | null;
  if (c) return new Set(JSON.parse(c) as string[]);
  const ids = ((await redis(["SMEMBERS", `pj:usq:${uid}`])) as string[] | null) ?? [];
  const all = new Set<string>();
  for (const s of await Promise.all(ids.map(getSquad))) for (const m of s?.members ?? []) if (m !== uid) all.add(m);
  await redis(["SET", K.sqmates(uid), JSON.stringify([...all]), "EX", 60]);
  return all;
}

export async function list(room: string, viewer: string | null) {
  const [raw, rxFlat, del, blk, mates, prof] = await Promise.all([
    redis(["LRANGE", K.list(room), 0, KEEP - 1]) as Promise<string[] | null>,
    redis(["HGETALL", K.rx(room)]) as Promise<string[] | null>,
    redis(["SMEMBERS", K.del(room)]) as Promise<string[] | null>,
    viewer ? (redis(["SMEMBERS", K.blk(viewer)]) as Promise<string[] | null>) : Promise.resolve([] as string[]),
    viewer ? squadMates(viewer) : Promise.resolve(new Set<string>()),
    viewer ? getProfile(viewer) : Promise.resolve(null),
  ]);
  const rx = new Map<string, Record<string, number>>();
  for (let i = 0; i < (rxFlat ?? []).length; i += 2) {
    const [mid, e] = String(rxFlat![i]).split("|");
    rx.set(mid, { ...(rx.get(mid) ?? {}), [e]: Number(rxFlat![i + 1]) || 0 });
  }
  const gone = new Set(del ?? []);
  const blocked = new Set(blk ?? []);
  const me = prof?.handle?.toLowerCase();
  const out: GcMsg[] = [];
  for (const r of raw ?? []) {
    try {
      const m = JSON.parse(r) as Stored;
      if (gone.has(m.id) || (m.uid && blocked.has(m.uid))) continue;
      const { uid, ...pub } = m;
      out.push({ ...pub, rx: rx.get(m.id) ?? {}, mine: Boolean(viewer && uid === viewer), squad: Boolean(uid && mates.has(uid)), atMe: Boolean(me && m.mentions?.some((h) => h.toLowerCase() === me)) });
    } catch {}
  }
  return { msgs: out.reverse(), me: prof?.handle ?? null };
}

function cleanPick(p: unknown): SharedPick | undefined {
  if (!p || typeof p !== "object") return undefined;
  const o = p as Record<string, unknown>;
  const subject = typeof o.subject === "string" ? o.subject.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const line = Number(o.line);
  const sport = SPORT_ORDER.includes(o.sport as Sport) ? (o.sport as Sport) : null;
  if (!subject || !Number.isFinite(line) || !sport || !cleanText(subject).ok) return undefined;
  const market = typeof o.market === "string" && cleanText(o.market).ok ? o.market.slice(0, 30) : null;
  const selection = o.selection === "Over" || o.selection === "Under" ? o.selection : null;
  return { subject, line, market, selection, sport, plus: o.plus === true || undefined };
}

export async function post(room: string, uid: string, body: { text?: unknown; pick?: unknown; pos?: unknown }) {
  const ttl = Number(await redis(["TTL", K.mute(uid)]));
  if (ttl > 0 || ttl === -1) return { ok: false as const, status: 403, error: "You're muted in chat for now." };
  const pick = cleanPick(body.pick);
  const pos = cleanPos(body.pos, (x) => cleanText(x).ok);
  const t = cleanText(typeof body.text === "string" && body.text.trim() ? body.text : pos ? "Sharing my position" : pick ? "Sharing my pick" : body.text);
  if (!t.ok) return { ok: false as const, status: 400, error: t.error };
  if ((await redis(["SET", `pj:rl:gc:${uid}`, "1", "NX", "EX", 2])) !== "OK") return { ok: false as const, status: 429, error: "One message every 2 seconds." };
  const mk = `pj:rl:gcm:${uid}`;
  const n = Number(await redis(["INCR", mk]));
  if (n === 1) await redis(["EXPIRE", mk, 60]);
  if (n > 20) return { ok: false as const, status: 429, error: "20 messages a minute max. Take a breather." };
  const prof = await ensureProfile(uid);
  const tags = [...new Set([...t.text.matchAll(/@([A-Za-z0-9_]{3,16})/g)].map((m) => m[1]))].slice(0, 3);
  const mentions = (await Promise.all(tags.map(async (h) => ((await uidOf(h).catch(() => null)) ? h : null)))).filter(Boolean) as string[];
  const look = coinsOn() ? await lookOf(uid).catch(() => undefined) : undefined;
  const m: Stored = { id: crypto.randomUUID(), uid, handle: prof.handle, text: t.text, ts: Date.now(), kind: "msg", mentions, look, pick, pos };
  await redis(["LPUSH", K.list(room), JSON.stringify(m)]);
  await redis(["LTRIM", K.list(room), 0, KEEP - 1]);
  await touch(room);
  if (coinsOn()) { await markActivity(uid, "chat").catch(() => {}); await markActivity(uid, "gchat").catch(() => {}); }
  return { ok: true as const, id: m.id };
}

export async function react(room: string, uid: string, mid: string, emote: string) {
  const free = FREE_EMOTES.some((e) => e.id === emote);
  if (!free && !(coinsOn() && (await emotesOf(uid)).includes(emote))) return { ok: false as const, error: "Unlock that emote first." };
  if ((await redis(["SET", K.rxWho(room, mid, emote, uid), "1", "NX", "EX", ROOM_TTL])) !== "OK") return { ok: true as const };
  await redis(["HINCRBY", K.rx(room), `${mid}|${emote}`, 1]);
  await redis(["EXPIRE", K.rx(room), ROOM_TTL]);
  if (coinsOn()) await markActivity(uid, "react").catch(() => {});
  return { ok: true as const };
}

async function find(room: string, mid: string): Promise<Stored | null> {
  for (const r of ((await redis(["LRANGE", K.list(room), 0, KEEP - 1])) as string[] | null) ?? []) {
    try {
      const m = JSON.parse(r) as Stored;
      if (m.id === mid) return m;
    } catch {}
  }
  return null;
}

/** Reports go to the owner queue; three distinct reporters hide a message for everyone. */
export async function report(room: string, uid: string, mid: string, reason: string) {
  const m = await find(room, mid);
  if (!m || m.kind === "sys") return { ok: false as const };
  const k = K.rep(room, mid);
  const added = Number(await redis(["SADD", k, uid]));
  await redis(["EXPIRE", k, ROOM_TTL]);
  if (added) {
    await redis(["LPUSH", K.reports, JSON.stringify({ room, mid, handle: m.handle, text: m.text, reason: reason.slice(0, 40), ts: Date.now() })]);
    await redis(["LTRIM", K.reports, 0, 499]);
  }
  if (Number(await redis(["SCARD", k])) >= 3) {
    await redis(["SADD", K.del(room), mid]);
    await touch(room);
  }
  return { ok: true as const };
}

/** Block hides that account's messages for you everywhere (chat, squads, friends). */
export async function blockAuthor(room: string, uid: string, mid: string) {
  const m = await find(room, mid);
  if (!m?.uid || m.uid === uid) return { ok: false as const };
  await socialBlock(uid, m.handle, true);
  await redis(["SADD", K.blk(uid), m.uid]);
  await redis(["DEL", K.sqmates(uid)]);
  return { ok: true as const };
}

/* ---- Owner moderation ---- */
export async function adminDelete(room: string, mid: string) {
  await redis(["SADD", K.del(room), mid]);
  await touch(room);
}
export async function adminMute(handle: string, hours: number) {
  const uid = await uidOf(handle);
  if (!uid) return null;
  if (hours <= 0) await redis(["DEL", K.mute(uid)]);
  else await redis(["SET", K.mute(uid), "1", "EX", Math.round(hours * 3600)]);
  return uid;
}
export async function adminReports(n = 50) {
  return (((await redis(["LRANGE", K.reports, 0, n - 1])) as string[] | null) ?? []).map((r) => JSON.parse(r));
}
export async function adminRoom(room: string) {
  return (((await redis(["LRANGE", K.list(room), 0, KEEP - 1])) as string[] | null) ?? []).map((r) => {
    const m = JSON.parse(r) as Stored;
    return { id: m.id, handle: m.handle, text: m.text, ts: m.ts, kind: m.kind };
  });
}
/** Test cleanup: drop a whole room. */
export async function adminWipe(room: string) {
  await Promise.all([K.list(room), K.rx(room), K.del(room), K.seen(room), K.final(room), K.sysRate(room), K.sysLock(room)].map((k) => redis(["DEL", k])));
}
