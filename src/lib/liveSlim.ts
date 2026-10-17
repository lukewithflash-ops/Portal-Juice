/**
 * A lighter live snapshot for the hub and My Live: score, clock, situation, box scores and recent plays.
 * Drops shot maps, the full win-chance line, subs and pitch maps. Pure.
 */
import type { LiveSnap } from "@/lib/live";

const FOOTBALL = new Set(["nfl", "ncaaf"]);
/** Plays kept for non-football games. Enough for alerts and the feed between 2.5s pulls. */
export const SLIM_PLAYS = 40;
export const BATCH_MAX = 16;

export function slimSnap(league: string, snap: LiveSnap): LiveSnap {
  const live = snap.drives.find((d) => d.live);
  const last = snap.drives[snap.drives.length - 1];
  return {
    ...snap,
    // Football keeps every play: the longest-pass prop reads them.
    plays: FOOTBALL.has(league) ? snap.plays : snap.plays.slice(-SLIM_PLAYS),
    drives: live ? [live] : last ? [last] : [],
    win: snap.win.length ? [snap.win[snap.win.length - 1]] : [],
    winIds: undefined,
    winMarks: undefined,
    shots: undefined,
    keyPlays: undefined,
    subs: snap.subs ? snap.subs.slice(-8) : undefined,
    atBat: snap.atBat ? { ...snap.atBat, pitches: [] } : snap.atBat,
  };
}

/** "nfl:401,nba:402" → [{league, id}], deduped, valid ids only, capped. */
export function parseBatch(raw: string | null): { league: string; id: string }[] {
  const out: { league: string; id: string }[] = [];
  for (const part of (raw ?? "").split(",")) {
    const m = /^([a-z0-9.-]{2,24}):(\d{1,14})$/i.exec(part.trim());
    if (!m) continue;
    const league = m[1].toLowerCase();
    if (out.some((t) => t.league === league && t.id === m[2])) continue;
    out.push({ league, id: m[2] });
    if (out.length >= BATCH_MAX) break;
  }
  return out;
}
