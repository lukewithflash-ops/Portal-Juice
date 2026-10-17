import "server-only";
import { chatEnabled, redis } from "@/lib/chat";
import { getGameDetail, getLive, getSlateFor } from "@/lib/espn";
import { gradedLines } from "@/lib/historyCore";
import { sportsDate } from "@/lib/slate";
import type { HistoryLine } from "@/lib/types";

/**
 * Store of graded lines (Upstash). pj:hist:day:<YYYYMMDD> → id → HistoryLine. pj:hist:done:<league>:<id>
 * marks a recorded game. pj:hist:queue holds finished games waiting to be graded; pj:hist:scanned:<day>
 * marks a backfill day already queued.
 */
const K = {
  day: (d: string) => `pj:hist:day:${d}`,
  days: "pj:hist:days",
  done: (l: string, id: string) => `pj:hist:done:${l}:${id}`,
  queue: "pj:hist:queue",
  scanned: (d: string) => `pj:hist:scanned:${d}`,
  lock: "pj:hist:lock",
  meta: "pj:hist:meta",
};

/** How far back the backfill reaches, per league (ESPN keeps closing lines for finished games). */
const BACKFILL_FROM: Record<string, string> = { nfl: "20260910", nhl: "20261006", nba: "20261002", mlb: "20260920", ncaaf: "20260926" };

function addDays(day: string, n: number): string {
  const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8) + n));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function historyLines(maxDays = 60): Promise<HistoryLine[]> {
  if (!chatEnabled()) return [];
  const days = (((await redis(["SMEMBERS", K.days])) as string[] | null) ?? []).sort().reverse().slice(0, maxDays);
  const out: HistoryLine[] = [];
  for (const d of days) {
    const raw = (await redis(["HVALS", K.day(d)])) as string[] | null;
    for (const r of raw ?? []) {
      try {
        out.push(JSON.parse(r) as HistoryLine);
      } catch {
        /* skip */
      }
    }
  }
  return out;
}

export type StoreInfo = { lines: number; props: number; sides: number; days: number; games: number; queued: number; lastAt: string | null; from: string | null; to: string | null };

export async function historyInfo(lines?: HistoryLine[]): Promise<StoreInfo> {
  const ls = lines ?? (await historyLines());
  const meta = chatEnabled() ? ((await redis(["HGETALL", K.meta])) as string[] | null) ?? [] : [];
  const m: Record<string, string> = {};
  for (let i = 0; i < meta.length; i += 2) m[meta[i]] = meta[i + 1];
  const dates = ls.map((l) => l.date).sort();
  return {
    lines: ls.length,
    props: ls.filter((l) => l.kind === "prop").length,
    sides: ls.filter((l) => l.kind === "side").length,
    days: new Set(dates).size,
    games: Number(m.games ?? 0),
    queued: chatEnabled() ? Number(await redis(["LLEN", K.queue])) || 0 : 0,
    lastAt: m.lastAt ?? null,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  };
}

/** Queue finished games: today and yesterday always, plus a few backfill days per call (newest first). */
async function scan(now: number, backfillDays: number): Promise<number> {
  const today = sportsDate(new Date(now));
  const days = [today, addDays(today, -1)];
  let d = addDays(today, -2);
  const oldest = Object.values(BACKFILL_FROM).sort()[0];
  let picked = 0;
  while (picked < backfillDays && d >= oldest) {
    if (!(await redis(["EXISTS", K.scanned(d)]))) {
      days.push(d);
      picked++;
    }
    d = addDays(d, -1);
  }
  let n = 0;
  for (const day of days) {
    const slate = await getSlateFor(day).catch(() => null);
    if (!slate) continue;
    for (const g of slate.games) {
      if (g.state !== "post") continue;
      if (day < (BACKFILL_FROM[g.league] ?? "99999999")) continue;
      if (await redis(["EXISTS", K.done(g.league, g.id)])) continue;
      await redis(["RPUSH", K.queue, `${g.league}:${g.id}`]);
      await redis(["SET", K.done(g.league, g.id), "q", "EX", 60 * 86400]);
      n++;
    }
    if (day !== today && day !== addDays(today, -1)) await redis(["SET", K.scanned(day), "1", "EX", 120 * 86400]);
  }
  return n;
}

/** Grade one finished game into the store. */
async function recordGame(league: string, id: string): Promise<number> {
  const [bundle, snap] = await Promise.all([getGameDetail(league, id).catch(() => null), getLive(league, id).catch(() => null)]);
  if (!bundle || !snap || snap.state !== "post") return 0;
  const g = bundle.game;
  const date = sportsDate(new Date(g.start));
  const lines = gradedLines({
    league,
    gameId: id,
    date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
    home: { abbr: g.home.abbr, name: g.home.name, score: snap.homeScore == null ? null : Number(snap.homeScore) },
    away: { abbr: g.away.abbr, name: g.away.name, score: snap.awayScore == null ? null : Number(snap.awayScore) },
    spreadHome: g.price?.spreadHome ?? null,
    props: bundle.props.map((p) => ({ athleteId: p.athleteId, name: p.name, team: p.team, market: p.market, line: p.line, headshot: p.headshot })),
    boxes: snap.boxes,
    plays: snap.plays,
  });
  for (const l of lines) await redis(["HSETNX", K.day(date), l.id, JSON.stringify(l)]);
  if (lines.length) await redis(["SADD", K.days, date]);
  await redis(["SET", K.done(league, id), "1", "EX", 120 * 86400]);
  await redis(["HINCRBY", K.meta, "games", 1]);
  await redis(["HSET", K.meta, "lastAt", new Date().toISOString()]);
  return lines.length;
}

/** One small batch: queue newly finished games, grade a few. Locked so overlapping calls do nothing. */
export async function runHistory(opts: { games?: number; backfillDays?: number; lockS?: number } = {}): Promise<{ ran: boolean; queued: number; graded: number; lines: number }> {
  if (!chatEnabled()) return { ran: false, queued: 0, graded: 0, lines: 0 };
  if ((await redis(["SET", K.lock, "1", "NX", "EX", String(opts.lockS ?? 55)])) !== "OK") return { ran: false, queued: 0, graded: 0, lines: 0 };
  const started = Date.now();
  try {
    const queued = await scan(started, opts.backfillDays ?? 2);
    let graded = 0;
    let lines = 0;
    const max = opts.games ?? 4;
    while (graded < max && Date.now() - started < 40000) {
      const batch: string[] = [];
      for (let i = 0; i < Math.min(3, max - graded); i++) {
        const item = (await redis(["LPOP", K.queue])) as string | null;
        if (item) batch.push(item);
      }
      if (!batch.length) break;
      const res = await Promise.all(
        batch.map(async (item) => {
          const [league, id] = item.split(":");
          try {
            return await recordGame(league, id);
          } catch {
            await redis(["RPUSH", K.queue, item]);
            return 0;
          }
        })
      );
      graded += batch.length;
      lines += res.reduce((a, b) => a + b, 0);
    }
    console.log(JSON.stringify({ event: "history.run", queued, graded, lines, ms: Date.now() - started }));
    return { ran: true, queued, graded, lines };
  } finally {
    await redis(["DEL", K.lock]).catch(() => {});
  }
}
