/** Match a posted prop line to a live box cell. No invented stats. */

import type { LiveBox, LivePlay, LiveSnap } from "@/lib/live";

export type TrackTone = "gold" | "green" | "red" | "flat";

export type TrackRow = {
  id: string;
  name: string;
  team: string;
  headshot: string | null;
  market: string;
  line: number;
  /** Live box value, or last-5 average when the game has not started. */
  value: number | null;
  valueLabel: "live" | "last 5" | null;
  pace: number | null;
  tone: TrackTone;
  stamp: "CLEARED" | "MISSED" | null;
};

export type TrackProp = {
  athleteId: string;
  name: string;
  team: string;
  headshot: string | null;
  market: string;
  line: string;
  recentAvg?: number | null;
  recentGames?: number | null;
};

/** First number in a line such as "15+" or "24.5". */
export function parseLine(raw: string): number | null {
  const m = raw.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Plain cells stay numbers. "2-6" is makes-attempts, so the make count. */
export function statNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  const split = t.match(/^(\d+)\s*-\s*\d+/);
  if (split) return Number(split[1]);
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Groups of aliases. A combo market is several groups summed. */
export function marketGroups(market: string): string[][] {
  const m = market.toLowerCase();
  if (m.includes("points") && m.includes("assists") && m.includes("rebounds")) {
    return [
      ["points", "PTS"],
      ["assists", "AST"],
      ["rebounds", "REB"],
    ];
  }
  if (m.includes("points") && m.includes("assists")) return [["points", "PTS"], ["assists", "AST"]];
  if (m.includes("points") && m.includes("rebounds")) return [["points", "PTS"], ["rebounds", "REB"]];
  if (m.includes("3-point") || m.includes("three point") || m.includes("3pm")) {
    return [["threePointFieldGoalsMade", "3PT"]];
  }
  if (m.includes("pass") && m.includes("yard")) return [["passingYards"]];
  if (m.includes("rush") && m.includes("yard")) return [["rushingYards"]];
  if (m.includes("receiv") && m.includes("yard")) return [["receivingYards"]];
  if (m.includes("reception")) return [["receptions", "REC"]];
  if (m.includes("points")) return [["points", "PTS"]];
  if (m.includes("assist")) return [["assists", "AST"]];
  if (m.includes("rebound")) return [["rebounds", "REB"]];
  if (m.includes("goal")) return [["goals"]];
  return [];
}

function readAlias(map: Record<string, string>, aliases: string[]): number | null {
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(map, key)) return statNumber(map[key]);
  }
  return null;
}

export function liveStat(map: Record<string, string> | undefined, market: string): number | null {
  const groups = marketGroups(market);
  if (!groups.length || !map) return null;
  let sum = 0;
  for (const aliases of groups) {
    const n = readAlias(map, aliases);
    if (n === null) return null;
    sum += n;
  }
  return sum;
}

function clockSeconds(clock: string | null): number | null {
  if (!clock) return null;
  const m = clock.trim().match(/^(\d+):(\d{1,2})(?:\.\d+)?$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Elapsed and regulation length in seconds. Null when the sport has no clock. */
export function clockSpan(
  league: string,
  period: number | null,
  clock: string | null,
  state: LiveSnap["state"]
): { elapsed: number; total: number } | null {
  if (state === "pre") return null;
  if (league === "mlb") return null;
  const spec =
    league === "nba"
      ? { q: 12 * 60, n: 4, ot: 5 * 60 }
      : league === "nhl"
        ? { q: 20 * 60, n: 3, ot: 5 * 60 }
        : league === "nfl" || league === "ncaaf"
          ? { q: 15 * 60, n: 4, ot: 10 * 60 }
          : null;
  if (!spec) return null;
  if (state === "post") {
    const total = spec.q * spec.n;
    return { elapsed: total, total };
  }
  if (period === null || period < 1) return null;
  const remain = clockSeconds(clock);
  if (remain === null) return null;
  const len = period <= spec.n ? spec.q : spec.ot;
  const before = period <= spec.n ? (period - 1) * spec.q : spec.n * spec.q + (period - spec.n - 1) * spec.ot;
  const elapsed = before + Math.max(0, len - remain);
  const total = period <= spec.n ? spec.q * spec.n : spec.n * spec.q + (period - spec.n) * spec.ot;
  if (elapsed <= 0 || total <= 0) return null;
  return { elapsed, total };
}

/** Projected finish. Null until a full minute has been played, or when there is no clock. */
export function paceOf(value: number, span: { elapsed: number; total: number } | null, state: LiveSnap["state"]): number | null {
  if (state !== "in" || !span || span.elapsed < 60) return null;
  return Math.round((value * span.total) / span.elapsed * 10) / 10;
}

function findPlayer(boxes: LiveBox[], id: string) {
  for (const box of boxes) {
    const player = box.players.find((p) => p.id === id);
    if (player) return player;
  }
  return null;
}

export function trackProps(props: TrackProp[], snap: LiveSnap | null, league: string): TrackRow[] {
  const state = snap?.state ?? "pre";
  const span = snap ? clockSpan(league, snap.period, snap.clock, snap.state) : null;
  const rows: TrackRow[] = [];
  for (const prop of props) {
    const line = parseLine(prop.line);
    const groups = marketGroups(prop.market);
    if (line === null || line <= 0 || !groups.length) continue;
    const player = snap ? findPlayer(snap.boxes, prop.athleteId) : null;
    const live = player ? liveStat(player.statMap, prop.market) : null;
    const recentOk = prop.recentAvg != null && (prop.recentGames ?? 0) > 0;
    let value: number | null = null;
    let valueLabel: TrackRow["valueLabel"] = null;
    if (state !== "pre" && live !== null) {
      value = live;
      valueLabel = "live";
    } else if (state === "pre" && recentOk) {
      value = prop.recentAvg ?? null;
      valueLabel = "last 5";
    }
    if (value === null && state !== "pre") continue;
    const pace = value !== null && valueLabel === "live" ? paceOf(value, span, state) : null;
    let tone: TrackTone = "flat";
    let stamp: TrackRow["stamp"] = null;
    if (value !== null && valueLabel === "live" && value >= line) {
      tone = "gold";
      if (state === "post") stamp = "CLEARED";
    } else if (state === "post" && value !== null && value < line) {
      tone = "red";
      stamp = "MISSED";
    } else if (pace !== null && pace >= line) {
      tone = "green";
    } else if (pace !== null && pace < line) {
      tone = "red";
    } else if (valueLabel === "last 5" && value !== null) {
      tone = value >= line ? "green" : "red";
    }
    rows.push({
      id: `${prop.athleteId}:${prop.market}`,
      name: prop.name,
      team: prop.team,
      headshot: prop.headshot,
      market: prop.market.replace(/ milestones$/i, ""),
      line,
      value,
      valueLabel,
      pace,
      tone,
      stamp,
    });
  }
  rows.sort((a, b) => {
    const gap = (r: TrackRow) => (r.value === null ? 9 : Math.abs(1 - r.value / r.line));
    return gap(a) - gap(b);
  });
  return rows;
}

export function isBigPlay(play: LivePlay): boolean {
  const text = `${play.typeText} ${play.text}`.toLowerCase();
  if (play.points >= 3) return true;
  if (/touchdown/.test(text)) return true;
  if (/\b(interception|fumble|dunk|blocked)\b/.test(text)) return true;
  if (/turnover/.test(text) && !/rebound/.test(text)) return true;
  const yards = text.match(/(\d+)\s*-?\s*yard/);
  if (yards && Number(yards[1]) >= 20) return true;
  return false;
}

/** Points by the team that just scored, over the current stretch. Null under a 6-point margin. */
export function scoringRun(plays: LivePlay[]): { teamId: string; us: number; them: number } | null {
  const scores = plays.filter((p) => p.scoring && p.points > 0 && p.teamId);
  if (!scores.length) return null;
  const team = scores[scores.length - 1].teamId as string;
  let us = 0;
  for (let i = scores.length - 1; i >= 0; i--) {
    if (scores[i].teamId !== team) break;
    us += scores[i].points;
  }
  if (us >= 6) return { teamId: team, us, them: 0 };
  us = 0;
  let them = 0;
  for (let i = scores.length - 1; i >= 0; i--) {
    if (scores[i].teamId === team) us += scores[i].points;
    else them += scores[i].points;
    if (them > 4) break;
  }
  if (us >= 6 && us - them >= 6) return { teamId: team, us, them };
  return null;
}

export function leadChanged(plays: LivePlay[]): boolean {
  const scores = plays.filter((p) => p.scoring && p.homeScore !== null && p.awayScore !== null);
  if (scores.length < 2) return false;
  const sign = (p: LivePlay) => {
    const d = (p.homeScore as number) - (p.awayScore as number);
    return d > 0 ? 1 : d < 0 ? -1 : 0;
  };
  const now = sign(scores[scores.length - 1]);
  const prev = sign(scores[scores.length - 2]);
  return now !== 0 && prev !== 0 && now !== prev;
}

export type Drive = {
  teamId: string;
  plays: number;
  yards: number | null;
  ball: number;
  firstDown: number | null;
  redZone: boolean;
};

/** Current NFL drive from yard markers ESPN sent. */
export function currentDrive(plays: LivePlay[]): Drive | null {
  const marked = [...plays].reverse().filter((p) => p.yardsToEndzone !== null && p.teamId);
  if (!marked.length) return null;
  const teamId = marked[0].teamId as string;
  const stretch = [];
  for (const p of marked) {
    if (p.teamId !== teamId) break;
    stretch.push(p);
  }
  const ball = marked[0].yardsToEndzone as number;
  const start = stretch[stretch.length - 1].yardsToEndzone as number;
  const latest = marked[0];
  const firstDown =
    latest.distance !== null && latest.yardsToEndzone !== null
      ? Math.max(0, latest.yardsToEndzone - latest.distance)
      : null;
  return {
    teamId,
    plays: stretch.length,
    yards: stretch.length > 1 ? start - ball : null,
    ball,
    firstDown,
    redZone: ball <= 20,
  };
}
