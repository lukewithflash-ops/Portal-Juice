import "server-only";
import { cleanText, redis } from "@/lib/chat";
import { getProfile, getSquad, ensureProfile } from "@/lib/social";
import { emotesOf, lookOf, markActivity } from "@/lib/coins";
import { FREE_EMOTES, type Look } from "@/lib/coinsCore";

/** Squad chat: members only, names come from the account's handle (never typed in). */
export type SquadMsg = { id: string; handle: string; text: string; ts: number; mentions: string[]; rx: Record<string, number>; mine?: boolean; look?: Look };

const K = {
  list: (sq: string) => `pj:sqc:${sq}`,
  rx: (sq: string) => `pj:sqc:rx:${sq}`,
  rxWho: (sq: string, m: string, e: string) => `pj:sqc:rxw:${sq}:${m}:${e}`,
  read: (u: string, sq: string) => `pj:sqc:read:${u}:${sq}`,
  last: (sq: string) => `pj:sqc:last:${sq}`,
};

async function memberSquad(uid: string, sq: string) {
  const s = await getSquad(sq);
  return s && s.members.includes(uid) ? s : null;
}

async function handles(ids: string[]) {
  return (await Promise.all(ids.map(async (u) => (await getProfile(u))?.handle))).filter(Boolean) as string[];
}

export async function messages(uid: string, sq: string): Promise<{ msgs: SquadMsg[]; members: string[]; seen: string[]; dm: boolean } | null> {
  const s = await memberSquad(uid, sq);
  if (!s) return null;
  const me = (await getProfile(uid))?.handle;
  const raw = ((await redis(["LRANGE", K.list(sq), 0, 99])) as string[] | null) ?? [];
  const rxFlat = ((await redis(["HGETALL", K.rx(sq)])) as string[] | null) ?? [];
  const rx = new Map<string, Record<string, number>>();
  for (let i = 0; i < rxFlat.length; i += 2) {
    const [mid, e] = String(rxFlat[i]).split("|");
    rx.set(mid, { ...(rx.get(mid) ?? {}), [e]: Number(rxFlat[i + 1]) || 0 });
  }
  const msgs: SquadMsg[] = [];
  for (const r of raw) {
    try {
      const m = JSON.parse(r) as SquadMsg & { uid: string };
      msgs.push({ id: m.id, handle: m.handle, text: m.text, ts: m.ts, mentions: m.mentions, rx: rx.get(m.id) ?? {}, mine: m.handle === me });
    } catch {}
  }
  const members = await handles(s.members);
  const looks: Record<string, Look> = {};
  await Promise.all(s.members.map(async (u) => {
    const h = (await getProfile(u))?.handle;
    if (h) looks[h] = await lookOf(u).catch(() => ({}));
  }));
  for (const m of msgs) m.look = looks[m.handle];
  await redis(["SET", K.read(uid, sq), Date.now(), "EX", 60 * 86400]);
  // "Seen": who (besides me) has opened the chat since my latest message.
  const lastMine = msgs.find((m) => m.mine)?.ts ?? 0;
  const seen: string[] = [];
  if (lastMine) {
    await Promise.all(s.members.filter((u) => u !== uid).map(async (u) => {
      const r = Number(await redis(["GET", K.read(u, sq)])) || 0;
      const h = (await getProfile(u))?.handle;
      if (h && r >= lastMine) seen.push(h);
    }));
  }
  return { msgs: msgs.reverse(), members, seen, dm: !!s.dm };
}

export async function send(uid: string, sq: string, raw: unknown) {
  const s = await memberSquad(uid, sq);
  if (!s) return { ok: false as const, error: "Not in that squad.", status: 403 };
  const t = cleanText(raw);
  if (!t.ok) return { ok: false as const, error: t.error, status: 400 };
  const rk = `pj:rl:sqc:${uid}`;
  const n = Number(await redis(["INCR", rk]));
  if (n === 1) await redis(["EXPIRE", rk, 2]);
  if (n > 1) return { ok: false as const, error: "One sec.", status: 429 };
  const prof = await ensureProfile(uid);
  const members = await handles(s.members);
  const mentions = [...new Set([...t.text.matchAll(/@([A-Za-z0-9_]{3,16})/g)].map((m) => m[1]).filter((h) => members.some((x) => x.toLowerCase() === h.toLowerCase())))];
  const msg = { id: crypto.randomUUID(), uid, handle: prof.handle, text: t.text, ts: Date.now(), mentions };
  await redis(["LPUSH", K.list(sq), JSON.stringify(msg)]);
  await redis(["LTRIM", K.list(sq), 0, 299]);
  await redis(["SET", K.last(sq), msg.ts]);
  await redis(["SET", K.read(uid, sq), msg.ts, "EX", 60 * 86400]);
  await markActivity(uid, "chat").catch(() => {});
  return { ok: true as const };
}

/** One reaction per person per emote per message; coin emotes need to be owned. */
export async function react(uid: string, sq: string, mid: string, emote: string) {
  if (!(await memberSquad(uid, sq))) return { ok: false as const, error: "Not in that squad." };
  const free = FREE_EMOTES.some((e) => e.id === emote);
  if (!free && !(await emotesOf(uid)).includes(emote)) return { ok: false as const, error: "Unlock that emote first." };
  const first = await redis(["SET", `${K.rxWho(sq, mid, emote)}:${uid}`, "1", "NX", "EX", 30 * 86400]);
  if (first !== "OK") return { ok: true as const };
  await redis(["HINCRBY", K.rx(sq), `${mid}|${emote}`, 1]);
  await markActivity(uid, "react").catch(() => {});
  return { ok: true as const };
}

/** Squads with unread counts, for badges and the one-tap list. */
export async function unread(uid: string) {
  const ids = ((await redis(["SMEMBERS", `pj:usq:${uid}`])) as string[] | null) ?? [];
  const out = await Promise.all(ids.map(async (id) => {
    const s = await getSquad(id);
    if (!s) return null;
    const read = Number(await redis(["GET", K.read(uid, id)])) || 0;
    const raw = ((await redis(["LRANGE", K.list(id), 0, 49])) as string[] | null) ?? [];
    const me = (await getProfile(uid))?.handle?.toLowerCase();
    let n = 0;
    let at = 0;
    let last: { handle: string; text: string; ts: number } | null = null;
    try {
      const m0 = raw[0] ? (JSON.parse(raw[0]) as { handle: string; text: string; ts: number }) : null;
      if (m0) last = { handle: m0.handle, text: String(m0.text).slice(0, 80), ts: m0.ts };
    } catch {}
    for (const r of raw) {
      try {
        const m = JSON.parse(r) as { ts: number; uid: string; mentions: string[] };
        if (m.ts <= read) break;
        if (m.uid === uid) continue;
        n++;
        if (m.mentions?.some((h) => h.toLowerCase() === me)) at++;
      } catch {}
    }
    return { id, name: s.name, dm: !!s.dm, members: await handles(s.members), unread: n, mentions: at, last };
  }));
  return out.filter(Boolean);
}
