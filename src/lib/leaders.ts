import "server-only";
import { createHash } from "node:crypto";
import { chatEnabled, redis } from "@/lib/chat";
import { cleanLeg, rankLeaders, type LeaderRow, type Published } from "@/lib/leaderRank";

const KEY = "pj:leaders";
const OWNER = "pj:leaders:owner";

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function leadersEnabled() {
  return chatEnabled();
}

export async function listLeaders(): Promise<LeaderRow[]> {
  if (!chatEnabled()) return [];
  const raw = (await redis(["HGETALL", KEY])) as string[] | null;
  const all: Published[] = [];
  for (let i = 1; raw && i < raw.length; i += 2) {
    try {
      const p = JSON.parse(raw[i]) as Published;
      if (p && typeof p.handle === "string" && Array.isArray(p.legs)) all.push(p);
    } catch {
      /* skip a bad row */
    }
  }
  return rankLeaders(all);
}

/** Publish or replace a handle's legs. The device token that first claimed a handle is the only one that can update it. */
export async function publish(handle: string, token: string, rawLegs: unknown[]): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!chatEnabled()) return { ok: false, error: "Leaders open when the store is connected." };
  if (!/^[A-Za-z0-9_-]{24,80}$/.test(token)) return { ok: false, error: "Bad device token." };
  const legs = rawLegs.map(cleanLeg).filter((l) => l !== null).slice(0, 300);
  if (!legs.length) return { ok: false, error: "No settled or open lines to share." };
  const key = handle.toLowerCase();
  await redis(["HSETNX", OWNER, key, hash(token)]);
  const owner = (await redis(["HGET", OWNER, key])) as string | null;
  if (owner !== hash(token)) return { ok: false, error: "That handle is taken." };
  const row: Published = { handle, legs, updatedAt: new Date().toISOString() };
  await redis(["HSET", KEY, key, JSON.stringify(row)]);
  return { ok: true, count: legs.length };
}

export async function unpublish(handle: string, token: string): Promise<boolean> {
  if (!chatEnabled()) return false;
  const key = handle.toLowerCase();
  const owner = (await redis(["HGET", OWNER, key])) as string | null;
  if (!owner || owner !== hash(token)) return false;
  await redis(["HDEL", KEY, key]);
  return true;
}
