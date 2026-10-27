import "server-only";
import { createHash } from "node:crypto";
import { chatEnabled, redis } from "@/lib/chat";

/**
 * Owner retention counters. Privacy-safe: only a salted hash of an account/device id is kept,
 * in a per-day set that expires after 120 days. No names, no IPs, no pick contents.
 */
const TTL = 120 * 86400;
export const dayOf = (t = Date.now()) => new Date(t).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const h = (id: string) => createHash("sha256").update(`pj-m:${id}`).digest("hex").slice(0, 20);
const K = { dau: (d: string) => `pj:m:dau:${d}`, neu: (d: string) => `pj:m:new:${d}`, picks: (d: string) => `pj:m:picks:${d}`, first: "pj:m:first", since: "pj:m:since" };

export async function recordOpen(id: string): Promise<void> {
  if (!chatEnabled() || !id) return;
  const d = dayOf(), x = h(id);
  await redis(["SETNX", K.since, d]);
  await redis(["SADD", K.dau(d), x]);
  await redis(["EXPIRE", K.dau(d), TTL]);
  if (Number(await redis(["HSETNX", K.first, x, d])) === 1) {
    await redis(["SADD", K.neu(d), x]);
    await redis(["EXPIRE", K.neu(d), TTL]);
  }
}

export async function recordPicks(n: number): Promise<void> {
  if (!chatEnabled() || n <= 0) return;
  const d = dayOf();
  await redis(["SETNX", K.since, d]);
  await redis(["INCRBY", K.picks(d), Math.min(n, 500)]);
  await redis(["EXPIRE", K.picks(d), TTL]);
}

export type DayRow = { day: string; active: number; fresh: number; picks: number; d1: number | null; d7: number | null };

async function returned(cohort: string, later: string): Promise<number> {
  const a = ((await redis(["SMEMBERS", K.neu(cohort)])) as string[]) ?? [];
  if (!a.length) return 0;
  const hit = (await redis(["SMISMEMBER", K.dau(later), ...a])) as number[];
  return hit.filter((v) => Number(v) === 1).length;
}

export async function dashboard(days = 14): Promise<{ since: string | null; today: string; rows: DayRow[] }> {
  const today = dayOf();
  const since = chatEnabled() ? ((await redis(["GET", K.since])) as string | null) : null;
  const rows: DayRow[] = [];
  const plus = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  for (let i = days - 1; i >= 0; i--) {
    const day = plus(today, -i);
    if (!since || day < since) { rows.push({ day, active: 0, fresh: 0, picks: 0, d1: null, d7: null }); continue; }
    const active = Number(await redis(["SCARD", K.dau(day)])) || 0;
    const fresh = Number(await redis(["SCARD", K.neu(day)])) || 0;
    const picks = Number(await redis(["GET", K.picks(day)])) || 0;
    const d1 = fresh && plus(day, 1) < today ? Math.round(((await returned(day, plus(day, 1))) / fresh) * 100) : null;
    const d7 = fresh && plus(day, 7) < today ? Math.round(((await returned(day, plus(day, 7))) / fresh) * 100) : null;
    rows.push({ day, active, fresh, picks, d1, d7 });
  }
  return { since, today, rows };
}
