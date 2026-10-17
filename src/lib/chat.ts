/** Game chat. Persists only when Upstash Redis REST env is set. */

export type ChatNote = {
  id: string;
  handle: string;
  text: string;
  ts: number;
  parentId: string | null;
  likes: number;
  /** "sys" lines are play-by-play markers posted by the thread itself. */
  kind?: "msg" | "sys";
  /** Posted from a signed-in account with that handle. */
  verified?: boolean;
  /** Emote id → count. */
  rx?: Record<string, number>;
};

const BANNED = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "dick",
  "cunt",
  "nigger",
  "faggot",
  "slut",
  "retard",
  "kike",
  "spic",
  "chink",
  "tranny",
  "whore",
  "pussy",
  "cock",
  "motherfucker",
];

const SLURS = ["nigger", "nigga", "faggot"];
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i", "|": "l" };

/** Profanity filter: leetspeak and spacing tricks, whole words for swears, anywhere for slurs. */
export function profane(text: string): boolean {
  const norm = text.toLowerCase().replace(/[013457@$!|]/g, (c) => LEET[c] ?? c).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const squashed = norm.replace(/[^a-z]/g, "").replace(/(.)\1{2,}/g, "$1$1");
  if (SLURS.some((w) => squashed.includes(w))) return true;
  // "f u c k" and "f.u.c.k": join runs of single letters back into a word.
  const joined = norm.replace(/\b([a-z])[\s.*_-]+(?=[a-z]\b)/g, "$1");
  const words = joined.split(/[^a-z]+/).filter(Boolean).map((w) => w.replace(/(.)\1{2,}/g, "$1"));
  return words.some((w) => BANNED.some((b) => w === b || (b.length > 4 && w.startsWith(b)) || w === b + "s" || w === b + "ing"));
}

function redisEnv(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

export function chatEnabled(): boolean {
  return redisEnv() !== null;
}

export function cleanHandle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const h = raw.trim();
  if (!/^[A-Za-z0-9_]{2,16}$/.test(h)) return null;
  return h;
}

export function cleanText(raw: unknown): { ok: true; text: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Empty note." };
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, error: "Empty note." };
  if (text.length > 280) return { ok: false, error: "280 characters max." };
  if (/https?:|www\./i.test(text)) return { ok: false, error: "Links stay off the thread." };
  if (profane(text)) return { ok: false, error: "That message was blocked by the filter." };
  return { ok: true, text };
}

type RedisResult = { result?: unknown };

export async function redis(command: (string | number)[]): Promise<unknown> {
  const env = redisEnv();
  if (!env) throw new Error("no-store");
  const url = env.url;
  const token = env.token;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("store");
  const body = (await res.json()) as RedisResult;
  return body.result;
}

function threadKey(league: string, id: string) {
  return `pj:chat:${league}:${id}`;
}
function likeKey(league: string, id: string) {
  return `pj:likes:${league}:${id}`;
}

export async function listNotes(league: string, id: string): Promise<ChatNote[]> {
  const raw = await redis(["LRANGE", threadKey(league, id), "0", "199"]);
  const likes = (await redis(["HGETALL", likeKey(league, id)])) as string[] | null;
  const likeMap = new Map<string, number>();
  if (Array.isArray(likes)) {
    for (let i = 0; i < likes.length; i += 2) {
      likeMap.set(String(likes[i]), Number(likes[i + 1]) || 0);
    }
  }
  const rxFlat = ((await redis(["HGETALL", `pj:chat:rx:${league}:${id}`])) as string[] | null) ?? [];
  const rx = new Map<string, Record<string, number>>();
  for (let i = 0; i < rxFlat.length; i += 2) {
    const [mid, emote] = String(rxFlat[i]).split("|");
    const m = rx.get(mid) ?? {};
    m[emote] = Number(rxFlat[i + 1]) || 0;
    rx.set(mid, m);
  }
  const hidden = new Set(((await redis(["SMEMBERS", `pj:chat:hidden:${league}:${id}`])) as string[] | null) ?? []);
  const notes: ChatNote[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    try {
      const n = JSON.parse(String(item)) as ChatNote;
      if (!n?.id || !n.text || hidden.has(n.id)) continue;
      notes.push({ ...n, likes: likeMap.get(n.id) ?? n.likes ?? 0, rx: rx.get(n.id) ?? {} });
    } catch {
      /* skip a bad row */
    }
  }
  return notes;
}

export async function postNote(
  league: string,
  id: string,
  note: Omit<ChatNote, "likes">,
  rateKey: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const n = Number(await redis(["INCR", rateKey]));
  if (n === 1) await redis(["EXPIRE", rateKey, "5"]);
  if (n > 1) return { ok: false, error: "Wait a few seconds.", status: 429 };
  const burstKey = rateKey.replace(/^pj:rl:/, "pj:rlb:").split(":").slice(0, 5).join(":");
  const b = Number(await redis(["INCR", burstKey]));
  if (b === 1) await redis(["EXPIRE", burstKey, "600"]);
  if (b > 20) return { ok: false, error: "That's a lot of messages. Take a breather.", status: 429 };
  const key = threadKey(league, id);
  await redis(["LPUSH", key, JSON.stringify({ ...note, likes: 0 })]);
  await redis(["LTRIM", key, "0", "199"]);
  return { ok: true };
}

export async function likeNote(league: string, id: string, noteId: string): Promise<number> {
  const n = Number(await redis(["HINCRBY", likeKey(league, id), noteId, "1"]));
  return Number.isFinite(n) ? n : 0;
}

/** A play-by-play marker in the thread (score, TD, goal). Posted once per play. */
export async function postSystem(league: string, id: string, playId: string, text: string): Promise<void> {
  const added = Number(await redis(["SADD", `pj:chat:sysseen:${league}:${id}`, playId]));
  if (added !== 1) return;
  await redis(["EXPIRE", `pj:chat:sysseen:${league}:${id}`, 3 * 86400]);
  const key = threadKey(league, id);
  await redis(["LPUSH", key, JSON.stringify({ id: crypto.randomUUID(), handle: "Portal", text, ts: Date.now(), parentId: null, likes: 0, kind: "sys" })]);
  await redis(["LTRIM", key, "0", "199"]);
}
export async function seenSystem(league: string, id: string): Promise<number> {
  return Number(await redis(["EXISTS", `pj:chat:sysseen:${league}:${id}`])) || 0;
}
export async function markSystem(league: string, id: string, playIds: string[]): Promise<void> {
  if (!playIds.length) return;
  await redis(["SADD", `pj:chat:sysseen:${league}:${id}`, ...playIds]);
  await redis(["EXPIRE", `pj:chat:sysseen:${league}:${id}`, 3 * 86400]);
}

export async function reactNote(league: string, id: string, noteId: string, emote: string): Promise<void> {
  await redis(["HINCRBY", `pj:chat:rx:${league}:${id}`, `${noteId}|${emote}`, 1]);
  await redis(["EXPIRE", `pj:chat:rx:${league}:${id}`, 7 * 86400]);
}

/** Three distinct reports hide a message for everyone. */
export async function reportNote(league: string, id: string, noteId: string, who: string): Promise<boolean> {
  const k = `pj:chat:rep:${league}:${id}:${noteId}`;
  await redis(["SADD", k, who]);
  await redis(["EXPIRE", k, 7 * 86400]);
  const n = (((await redis(["SMEMBERS", k])) as string[] | null) ?? []).length;
  if (n >= 3) {
    await redis(["SADD", `pj:chat:hidden:${league}:${id}`, noteId]);
    await redis(["EXPIRE", `pj:chat:hidden:${league}:${id}`, 7 * 86400]);
    return true;
  }
  return false;
}
