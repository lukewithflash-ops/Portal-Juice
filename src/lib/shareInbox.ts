/** Short-lived hand-off for items shared into Portal Juice (iOS Share Extension, PWA share target). */
import { randomBytes } from "crypto";

export type SharedItem = { image?: string; text?: string; url?: string };
const TTL = 15 * 60;
const MAX_IMAGE = 900_000; // data-URL chars; Upstash request cap is ~1 MB

function env() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

async function cmd(args: (string | number)[]): Promise<unknown> {
  const e = env();
  if (!e) throw new Error("storage off");
  const r = await fetch(e.url, { method: "POST", headers: { authorization: `Bearer ${e.token}` }, body: JSON.stringify(args), cache: "no-store" });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return ((await r.json()) as { result?: unknown }).result;
}

export function cleanShare(raw: SharedItem): SharedItem | { error: string } {
  const out: SharedItem = {};
  if (typeof raw.image === "string" && raw.image) {
    if (!/^data:image\/(jpeg|png|webp|heic);base64,/.test(raw.image)) return { error: "Not an image." };
    if (raw.image.length > MAX_IMAGE) return { error: "That image is too big. Try a screenshot." };
    out.image = raw.image;
  }
  if (typeof raw.text === "string" && raw.text.trim()) out.text = raw.text.slice(0, 8000);
  if (typeof raw.url === "string" && /^https?:\/\//i.test(raw.url.trim())) out.url = raw.url.trim().slice(0, 2000);
  if (!out.image && !out.text && !out.url) return { error: "Nothing to share." };
  return out;
}

export async function putShare(item: SharedItem): Promise<string> {
  const id = randomBytes(12).toString("base64url");
  await cmd(["SET", `pj:share:${id}`, JSON.stringify(item), "EX", TTL]);
  return id;
}

/** One read only: the item is deleted as it is taken. */
export async function takeShare(id: string): Promise<SharedItem | null> {
  if (!/^[A-Za-z0-9_-]{16}$/.test(id)) return null;
  const v = await cmd(["GETDEL", `pj:share:${id}`]);
  return typeof v === "string" ? (JSON.parse(v) as SharedItem) : null;
}
