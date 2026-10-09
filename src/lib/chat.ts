/** Game chat. Persists only when Upstash Redis REST env is set. */

export type ChatNote = {
  id: string;
  handle: string;
  text: string;
  ts: number;
  parentId: string | null;
  likes: number;
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
];

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
  const lower = text.toLowerCase();
  if (BANNED.some((w) => lower.includes(w))) return { ok: false, error: "That note was blocked." };
  return { ok: true, text };
}

type RedisResult = { result?: unknown };

async function redis(command: (string | number)[]): Promise<unknown> {
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
  const notes: ChatNote[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    try {
      const n = JSON.parse(String(item)) as ChatNote;
      if (!n?.id || !n.text) continue;
      notes.push({ ...n, likes: likeMap.get(n.id) ?? n.likes ?? 0 });
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
  const key = threadKey(league, id);
  await redis(["LPUSH", key, JSON.stringify({ ...note, likes: 0 })]);
  await redis(["LTRIM", key, "0", "199"]);
  return { ok: true };
}

export async function likeNote(league: string, id: string, noteId: string): Promise<number> {
  const n = Number(await redis(["HINCRBY", likeKey(league, id), noteId, "1"]));
  return Number.isFinite(n) ? n : 0;
}
