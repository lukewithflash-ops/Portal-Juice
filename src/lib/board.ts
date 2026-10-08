import type { HistoryLine, Sport } from "./types";

export const HOT_WINDOW = 15;
export const HOT_MIN_SAMPLE = 5;
export const COLD_MIN_SAMPLE = 8;
export const STREAK_MIN = 2;
export const LIST_SIZE = 10;

/** Prop cleared = actual stat went over the closing number. */
export function propCleared(h: HistoryLine): boolean {
  return h.result > h.closingLine;
}

/** Side covered = margin + closing spread > 0. A push is not a cover. */
export function sideCovered(h: HistoryLine): boolean {
  return h.result + h.closingLine > 0;
}

export type StreakRow = {
  key: string;
  sport: Sport;
  subject: string;
  team: string;
  market: string;
  streak: number;
  sample: number;
  lastLine: number;
  lastDate: string;
  headshotUrl: string | null;
};

export type RateRow = {
  key: string;
  sport: Sport;
  subject: string;
  team: string;
  market: string;
  hits: number;
  sample: number;
  hitRate: number;
  lastLine: number;
  lastDate: string;
  headshotUrl: string | null;
};

function groupNewestFirst(lines: HistoryLine[], kind: HistoryLine["kind"]) {
  const groups = new Map<string, HistoryLine[]>();
  for (const h of lines) {
    if (h.kind !== kind) continue;
    if (!Number.isFinite(h.closingLine) || !Number.isFinite(h.result)) continue;
    const key = `${h.sport}|${h.subject}|${h.market}`;
    const arr = groups.get(key) ?? [];
    arr.push(h);
    groups.set(key, arr);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));
  }
  return groups;
}

function streaks(
  lines: HistoryLine[],
  kind: HistoryLine["kind"],
  hit: (h: HistoryLine) => boolean
): StreakRow[] {
  const out: StreakRow[] = [];
  for (const [key, arr] of groupNewestFirst(lines, kind)) {
    let streak = 0;
    for (const h of arr) {
      if (!hit(h)) break;
      streak++;
    }
    if (streak < STREAK_MIN) continue;
    const last = arr[0];
    out.push({
      key,
      sport: last.sport,
      subject: last.subject,
      team: last.team,
      market: last.market,
      streak,
      sample: arr.length,
      lastLine: last.closingLine,
      lastDate: last.date,
      headshotUrl: last.headshotUrl,
    });
  }
  return out
    .sort((a, b) => b.streak - a.streak || b.sample - a.sample || a.subject.localeCompare(b.subject))
    .slice(0, LIST_SIZE);
}

export function streakingPlayers(lines: HistoryLine[]): StreakRow[] {
  return streaks(lines, "prop", propCleared);
}

export function streakingTeams(lines: HistoryLine[]): StreakRow[] {
  return streaks(lines, "side", sideCovered);
}

function rates(lines: HistoryLine[], minSample: number): RateRow[] {
  const out: RateRow[] = [];
  for (const [key, arr] of groupNewestFirst(lines, "prop")) {
    const window = arr.slice(0, HOT_WINDOW);
    if (window.length < minSample) continue;
    const hits = window.filter(propCleared).length;
    const last = window[0];
    out.push({
      key,
      sport: last.sport,
      subject: last.subject,
      team: last.team,
      market: last.market,
      hits,
      sample: window.length,
      hitRate: hits / window.length,
      lastLine: last.closingLine,
      lastDate: last.date,
      headshotUrl: last.headshotUrl,
    });
  }
  return out;
}

/** Highest hit rate over the last 15 logged lines (min 5 to rank). */
export function hotProps(lines: HistoryLine[]): RateRow[] {
  return rates(lines, HOT_MIN_SAMPLE)
    .sort((a, b) => b.hitRate - a.hitRate || b.sample - a.sample)
    .slice(0, LIST_SIZE);
}

/** Lowest hit rate over the same window. Anyone under 8 samples is hidden. */
export function coldProps(lines: HistoryLine[]): RateRow[] {
  return rates(lines, COLD_MIN_SAMPLE)
    .sort((a, b) => a.hitRate - b.hitRate || b.sample - a.sample)
    .slice(0, LIST_SIZE);
}
