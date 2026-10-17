import "server-only";
import { chatEnabled, redis } from "@/lib/chat";
import { getLive, getSlate, getSlateFor } from "@/lib/espn";
import { gradePick } from "@/lib/grade";
import { pickFromLeg } from "@/lib/legPick";
import { rankGames, sportsDate, type Game } from "@/lib/slate";
import { gameLegRows } from "@/lib/topPicks";
import { selectVip, toVip, legKey, VIP_MAX, VIP_MIN_LEAD_MS, vipRecord, type Candidate, type VipPick, type VipRecord } from "@/lib/vipCore";

/**
 * VIP picks in Upstash. Each pick is written once with HSETNX before its game starts and never edited,
 * except for the grade after the final. pj:vip:day:<YYYYMMDD> holds one day; pj:vip:days indexes days.
 */
const K = {
  day: (d: string) => `pj:vip:day:${d}`,
  days: "pj:vip:days",
  lock: "pj:vip:lock",
  next: "pj:vip:next",
  seen: (league: string, id: string) => `pj:vip:seen:${league}:${id}`,
  drop: (d: string) => `pj:vip:drop:${d}`,
  lm: (league: string, id: string) => `pj:vip:lm:${league}:${id}`,
};

const GAMES_PER_RUN = 10;
const RECHECK_S = 3 * 3600;

function parse(raw: string[] | null): VipPick[] {
  const out: VipPick[] = [];
  for (let i = 1; raw && i < raw.length; i += 2) {
    try {
      out.push(JSON.parse(raw[i]) as VipPick);
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || b.chance - a.chance);
}

export async function vipDay(date: string): Promise<VipPick[]> {
  if (!chatEnabled()) return [];
  return parse((await redis(["HGETALL", K.day(date)])) as string[] | null);
}

export async function vipHistory(maxDays = 120): Promise<VipPick[]> {
  if (!chatEnabled()) return [];
  const days = (((await redis(["SMEMBERS", K.days])) as string[] | null) ?? []).sort().reverse().slice(0, maxDays);
  const all = await Promise.all(days.map((d) => vipDay(d)));
  return all.flat().sort((a, b) => b.start.localeCompare(a.start));
}

export async function vipRecordAll(): Promise<{ record: VipRecord; history: VipPick[] }> {
  const history = await vipHistory();
  return { record: vipRecord(history), history };
}

function addDays(day: string, n: number): string {
  const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8) + n));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Pre-game games that open 30 minutes to 14 hours from now, today and tomorrow (PT). */
async function upcoming(now: number): Promise<Game[]> {
  const today = sportsDate(new Date(now));
  const [a, b] = await Promise.all([getSlate().catch(() => null), getSlateFor(addDays(today, 1)).catch(() => null)]);
  const seen = new Set<string>();
  const games = [...(a?.games ?? []), ...(b?.games ?? [])].filter((g) => {
    const k = `${g.league}:${g.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    const t = Date.parse(g.start);
    return g.state === "pre" && t - now >= VIP_MIN_LEAD_MS && t - now <= 14 * 3600 * 1000;
  });
  return rankGames(games);
}

export type VipRun = { ran: boolean; checked: number; added: VipPick[]; graded: number; why?: string };

/** Look at the next batch of games and lock in any legs that clear the bar. Throttled and locked. */
export async function runVip(opts: { force?: boolean; now?: number } = {}): Promise<VipRun> {
  const now = opts.now ?? Date.now();
  if (!chatEnabled()) return { ran: false, checked: 0, added: [], graded: 0, why: "no store" };
  if (!opts.force && (await redis(["SET", K.next, "1", "NX", "EX", "600"])) !== "OK") return { ran: false, checked: 0, added: [], graded: 0, why: "throttled" };
  if ((await redis(["SET", K.lock, String(now), "NX", "EX", "240"])) !== "OK") return { ran: false, checked: 0, added: [], graded: 0, why: "running" };
  try {
    const graded = await settleVip();
    const games = await upcoming(now);
    const batch: Game[] = [];
    for (const g of games) {
      if (batch.length >= GAMES_PER_RUN) break;
      if ((await redis(["SET", K.seen(g.league, g.id), "1", "NX", "EX", String(RECHECK_S)])) === "OK") batch.push(g);
    }
    const cands: Candidate[] = [];
    for (let i = 0; i < batch.length; i += 4) {
      const part = await Promise.all(batch.slice(i, i + 4).map((g) => gameLegRows(g.league, g.id).catch(() => ({ g: null, rows: [] }))));
      part.forEach(({ g, rows }) => {
        if (!g) return;
        for (const r of rows)
          cands.push({ leg: r.leg, report: r.report, recent: r.recent, game: { label: g.label, start: g.start, home: g.home.abbr, away: g.away.abbr, state: g.state, provider: g.odds?.provider ?? null } });
      });
    }
    const added: VipPick[] = [];
    const byDate = new Map<string, Candidate[]>();
    for (const c of cands) {
      const d = sportsDate(new Date(c.game.start));
      byDate.set(d, [...(byDate.get(d) ?? []), c]);
    }
    for (const [date, list] of byDate) {
      const have = await vipDay(date);
      const room = VIP_MAX - have.length;
      if (room <= 0) continue;
      const picks = selectVip(list, room, have.map((p) => ({ gameId: p.gameId, key: legKey(p.leg) })), now);
      for (const { c, v } of picks) {
        const p = toVip(c, v, date, new Date(now));
        if (Number(await redis(["HSETNX", K.day(date), p.id, JSON.stringify(p)])) === 1) added.push(p);
      }
      if (picks.length) await redis(["SADD", K.days, date]);
    }
    console.log(JSON.stringify({ event: "vip.run", checked: batch.length, cands: cands.length, added: added.length, graded }));
    return { ran: true, checked: batch.length, added, graded };
  } finally {
    await redis(["DEL", K.lock]).catch(() => {});
  }
}

/** Grade open VIP picks whose game is final on ESPN. Only result/final/gradedAt change. */
export async function settleVip(): Promise<number> {
  const days = (((await redis(["SMEMBERS", K.days])) as string[] | null) ?? []).sort().reverse().slice(0, 7);
  let n = 0;
  for (const d of days) {
    for (const p of await vipDay(d)) {
      if (p.result || Date.parse(p.start) > Date.now() - 90 * 60 * 1000) continue;
      const snap = await getLive(p.league, p.gameId).catch(() => null);
      if (!snap || snap.state !== "post") continue;
      const res = gradePick(pickFromLeg(p.leg, { home: p.home, away: p.away }, { odds: p.odds }), snap);
      if (!res || res === "open") continue;
      const done: VipPick = { ...p, result: res, final: `${snap.awayAbbr} ${snap.awayScore} – ${snap.homeAbbr} ${snap.homeScore}`, gradedAt: new Date().toISOString() };
      await redis(["HSET", K.day(d), p.id, JSON.stringify(done)]);
      n++;
    }
  }
  return n;
}

/** First pick of a day: claim the once-a-day drop push. */
export async function claimDrop(date: string): Promise<boolean> {
  return (await redis(["SET", K.drop(date), "1", "NX", "EX", String(2 * 86400)])) === "OK";
}

/** Line move since the last look at this game: totals and spreads, full points only. */
export async function lineMoved(g: Game): Promise<{ text: string } | null> {
  const p = g.price;
  if (!p) return null;
  const now = { total: p.total, spread: p.spreadHome };
  const prevRaw = (await redis(["GET", K.lm(g.league, g.id)])) as string | null;
  await redis(["SET", K.lm(g.league, g.id), JSON.stringify(now), "EX", String(2 * 86400)]);
  if (!prevRaw) return null;
  const prev = JSON.parse(prevRaw) as typeof now;
  const parts: string[] = [];
  if (prev.total != null && now.total != null && Math.abs(now.total - prev.total) >= 1) parts.push(`Total ${prev.total} → ${now.total}`);
  if (prev.spread != null && now.spread != null && Math.abs(now.spread - prev.spread) >= 1) {
    const f = (x: number) => `${g.home.abbr} ${x > 0 ? "+" : ""}${x}`;
    parts.push(`Spread ${f(prev.spread)} → ${f(now.spread)}`);
  }
  return parts.length ? { text: parts.join(" · ") } : null;
}

/** Picks for today and tomorrow (PT): late-night runs lock tomorrow's early games. */
export async function vipUpcoming(now = Date.now()): Promise<VipPick[]> {
  const today = sportsDate(new Date(now));
  const [a, b] = await Promise.all([vipDay(today), vipDay(addDays(today, 1))]);
  return [...a, ...b];
}
