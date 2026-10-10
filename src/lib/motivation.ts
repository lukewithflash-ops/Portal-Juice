/**
 * Live slip motivation. Turns a logged leg plus a live box score into a progress meter,
 * a pace read, and a short line about what just happened. Real box values only.
 * No money wording anywhere: legs are "Hit!" or "Cleared!", never paid.
 */

import type { LiveSnap } from "@/lib/live";
import type { Pick } from "@/lib/types";
import { clockSpan, liveStat, marketGroups, paceOf, playerByName, type TrackTone } from "@/lib/tracker";
import { combinedChance, livePropChance, playedShare, pregameChance, type Chance } from "@/lib/chance";

export type LegStatus = "waiting" | "on-track" | "behind" | "cleared" | "missed" | "no-match";

export type Leg = {
  pickId: string;
  slipKey: string;
  league: string;
  gameId: string;
  name: string;
  market: string;
  line: number;
  side: "Over" | "Under";
  /** Live box value. Null before tip or when the name is not in the box yet. */
  value: number | null;
  /** Straight-line finish at the current rate. A pace, not a prediction. Null with no game clock. */
  pace: number | null;
  /** Over: units still needed to clear. Under: room left under the line. */
  toGo: number | null;
  /** 0–100 fill for the meter. */
  fill: number;
  tone: TrackTone;
  status: LegStatus;
  /** "18 of 24.5 PTS · 6.5 to go" */
  progress: string;
  /** Short line from real events, or null. */
  hype: string | null;
  final: boolean;
  /** ESPN athlete id from the box, once matched. */
  athleteId?: string | null;
  /** Chance to hit, 0–100, with where it came from. Null with nothing to go on. */
  chance?: Chance | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Group key so legs saved together read as one slip. */
export function slipKeyOf(p: Pick): string {
  if (p.slipId) return p.slipId;
  if (p.link) return "link:" + p.link;
  return `${p.book}|${p.gameId ?? ""}|${p.createdAt.slice(0, 16)}`;
}

/** Whole units still needed. A 24.5 line at 18 needs 7. A "15+" line at 12 needs 3. */
export function unitsNeeded(line: number, value: number): number {
  const gap = line - value;
  if (gap < 0) return 0;
  return Number.isInteger(line) ? Math.max(0, Math.ceil(gap)) : Math.floor(gap) + 1;
}

function shortMarket(m: string): string {
  const t = m.replace(/ milestones$/i, "").trim();
  const map: [RegExp, string][] = [
    [/points.*rebounds.*assists|pts\s*\+\s*reb\s*\+\s*ast|pra/i, "PRA"],
    [/3-point|three point|3pm/i, "3PM"],
    [/pass.*yard/i, "pass yds"],
    [/rush.*yard/i, "rush yds"],
    [/receiv.*yard/i, "rec yds"],
    [/reception/i, "rec"],
    [/^points$/i, "pts"],
    [/^assists$/i, "ast"],
    [/^rebounds$/i, "reb"],
  ];
  for (const [re, s] of map) if (re.test(t)) return s;
  return t.toLowerCase();
}

/** Leg plus its chance to hit (see chance.ts). */
export function legFromPick(pick: Pick, snap: LiveSnap | null, prevValue: number | null = null): Leg | null {
  const leg = legCore(pick, snap, prevValue);
  if (!leg) return leg;
  return { ...leg, chance: legChance(leg, pick, snap) };
}

export function legChance(leg: Leg, pick: Pick, snap: LiveSnap | null): Chance | null {
  if (!snap || snap.state === "pre") return pregameChance(pick.odds);
  if (leg.value === null) return snap.state === "post" ? null : pregameChance(pick.odds);
  const span = clockSpan(leg.league, snap.period, snap.clock, snap.state);
  const played = playedShare(leg.league, span, snap.period, snap.state, snap.bug?.half ?? null);
  return livePropChance({ value: leg.value, line: leg.line, side: leg.side, played, final: leg.final, market: leg.market });
}

/** Every leg in a slip has to hit. Null until each leg has a chance. */
export function slipChance(slip: SlipLive): number | null {
  return combinedChance(slip.legs.map((l) => l.chance?.pct ?? null));
}

function legCore(pick: Pick, snap: LiveSnap | null, prevValue: number | null = null): Leg | null {
  if (!pick.market || !pick.gameId || !pick.league) return null;
  if (!marketGroups(pick.market).length || !(pick.line > 0)) return null;
  const side: Leg["side"] = pick.selection === "Under" ? "Under" : "Over";
  const line = pick.line;
  const market = shortMarket(pick.market);
  const base = {
    pickId: pick.id,
    slipKey: slipKeyOf(pick),
    league: pick.league,
    gameId: pick.gameId,
    name: pick.subject,
    market,
    line,
    side,
    athleteId: null as string | null,
  };
  const state = snap?.state ?? "pre";
  if (!snap || state === "pre") {
    return { ...base, value: null, pace: null, toGo: null, fill: 0, tone: "flat", status: "waiting", progress: `${side} ${line} ${market}`, hype: null, final: false };
  }
  const player = playerByName(snap.boxes, pick.subject);
  base.athleteId = player?.id ?? null;
  const value = player ? liveStat(player.statMap, pick.market, snap.plays, player.name) : null;
  const final = state === "post";
  if (value === null) {
    return { ...base, value: null, pace: null, toGo: null, fill: 0, tone: "flat", status: "no-match", progress: `${side} ${line} ${market}`, hype: final ? null : "Not in the box yet", final };
  }
  const span = clockSpan(pick.league, snap.period, snap.clock, snap.state);
  const pace = paceOf(value, span, snap.state);
  const jumped = prevValue !== null && value > prevValue ? round1(value - prevValue) : 0;
  let status: LegStatus;
  let tone: TrackTone;
  let toGo: number;
  let fill: number;
  let hype: string | null = null;
  let progress: string;

  if (side === "Over") {
    toGo = round1(Math.max(0, line - value));
    fill = Math.max(0, Math.min(100, (value / line) * 100));
    const need = unitsNeeded(line, value);
    if (need === 0) {
      status = "cleared";
      tone = "gold";
      hype = jumped ? "Hit!" : "Cleared!";
    } else if (final) {
      status = "missed";
      tone = "red";
    } else {
      const onPace = pace !== null ? pace >= line : null;
      status = onPace === false ? "behind" : "on-track";
      tone = onPace === null ? "flat" : onPace ? "green" : "red";
      if (need === 1) hype = "1 away!";
      else if (need <= 3) hype = `${need} away!`;
      else if (jumped) hype = `+${jumped} just now`;
      else if (onPace) hype = "On pace. Keep it coming.";
      else if (onPace === false) hype = "Needs a run.";
    }
    progress = `${value} of ${line} ${market}` + (toGo > 0 ? ` · ${toGo} to go` : "");
  } else {
    toGo = round1(Math.max(0, line - value));
    fill = Math.max(0, Math.min(100, (value / line) * 100));
    if (value >= line) {
      status = "missed";
      tone = "red";
    } else if (final) {
      status = "cleared";
      tone = "gold";
      hype = "Hit! Stayed under.";
    } else {
      const under = pace !== null ? pace < line : null;
      status = under === false ? "behind" : "on-track";
      tone = under === null ? "flat" : under ? "green" : "red";
      if (toGo <= 1) hype = "On the edge. Hold it.";
      else if (jumped) hype = `+${jumped} just now. ${toGo} of room.`;
      else if (under) hype = "Holding under.";
    }
    progress = `${value} of ${line} ${market} · ${value >= line ? "over the line" : `${toGo} of room`}`;
  }
  return { ...base, value, pace, toGo, fill, tone, status, progress, hype, final };
}

export type SlipLive = {
  key: string;
  legs: Leg[];
  hit: number;
  total: number;
  missed: number;
};

/** Legs grouped into slips, in first-seen order. */
export function groupSlips(legs: Leg[]): SlipLive[] {
  const map = new Map<string, Leg[]>();
  for (const l of legs) {
    const list = map.get(l.slipKey) ?? [];
    list.push(l);
    map.set(l.slipKey, list);
  }
  return [...map.entries()].map(([key, list]) => ({
    key,
    legs: list,
    hit: list.filter((l) => l.status === "cleared").length,
    total: list.length,
    missed: list.filter((l) => l.status === "missed").length,
  }));
}

export const TONE_COLOR: Record<TrackTone, string> = {
  gold: "var(--gold)",
  green: "var(--plus)",
  red: "var(--minus)",
  flat: "#a1a1aa",
};

export const PACE_NOTE = "Pace is the current rate stretched to a full game. Chance to hit: estimate from pace and price. Not a guarantee.";
