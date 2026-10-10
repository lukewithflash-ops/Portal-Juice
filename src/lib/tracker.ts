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

/** One stat in a market: any of these box score keys, times a weight. `opt` terms count as 0 when missing. */
export type Term = { aliases: string[]; w: number; opt?: boolean; max?: "plays-pass" };

const T = (aliases: string[], w = 1, opt = false): Term => ({ aliases, w, opt });

/** PrizePicks-style fantasy scoring. Football: pass yd 0.04, pass TD 4, INT -1, rush/rec yd 0.1, rec 1, rush/rec TD 6, fumble lost -1. */
export const FANTASY_FOOTBALL: Term[] = [
  T(["passingYards"], 0.04, true),
  T(["passingTouchdowns"], 4, true),
  T(["interceptions"], -1, true),
  T(["rushingYards"], 0.1, true),
  T(["receivingYards"], 0.1, true),
  T(["receptions"], 1, true),
  T(["rushingTouchdowns"], 6, true),
  T(["receivingTouchdowns"], 6, true),
  T(["fumblesLost"], -1, true),
];
/** Basketball: pts 1, reb 1.2, ast 1.5, stl 3, blk 3, TO -1. */
export const FANTASY_HOOPS: Term[] = [
  T(["points", "PTS"], 1, true),
  T(["rebounds", "REB"], 1.2, true),
  T(["assists", "AST"], 1.5, true),
  T(["steals", "STL"], 3, true),
  T(["blocks", "BLK"], 3, true),
  T(["turnovers", "TO"], -1, true),
];
export const FANTASY_NOTE = "PrizePicks-style scoring";

const PTS = T(["points", "PTS"]);
const REB = T(["rebounds", "REB"]);
const AST = T(["assists", "AST"]);

/** The box score terms behind a market. Empty when we cannot compute it live. */
export function marketTerms(market: string): Term[] {
  const m = market.toLowerCase();
  if (/fantasy/.test(m)) return [{ aliases: ["fantasy"], w: 1 }];
  if (/longest/.test(m)) {
    if (/rush|run/.test(m)) return [T(["longRushing"])];
    if (/recep|catch/.test(m)) return [T(["longReception"])];
    if (/pass|complet/.test(m)) return [{ aliases: ["longPassing"], w: 1, max: "plays-pass" }];
    return [];
  }
  if (m.includes("points") && m.includes("assists") && m.includes("rebounds")) return [PTS, AST, REB];
  if (m.includes("points") && m.includes("assists")) return [PTS, AST];
  if (m.includes("points") && m.includes("rebounds")) return [PTS, REB];
  if (m.includes("rebounds") && m.includes("assists")) return [REB, AST];
  if (m.includes("steals") && m.includes("blocks")) return [T(["steals", "STL"]), T(["blocks", "BLK"])];
  if (m.includes("3-point") || m.includes("three point") || m.includes("3pm") || m.includes("3-pointers")) return [T(["threePointFieldGoalsMade", "3PT"])];
  if (/rush/.test(m) && /rec/.test(m) && /yard/.test(m)) return [T(["rushingYards"], 1, true), T(["receivingYards"], 1, true)];
  if (/pass/.test(m) && /rush/.test(m) && /yard/.test(m)) return [T(["passingYards"], 1, true), T(["rushingYards"], 1, true)];
  if (m.includes("pass") && m.includes("yard")) return [T(["passingYards"])];
  if (m.includes("rush") && m.includes("yard")) return [T(["rushingYards"])];
  if (m.includes("receiv") && m.includes("yard")) return [T(["receivingYards"])];
  if (/pass(ing)? (td|touchdown)/.test(m)) return [T(["passingTouchdowns"])];
  if (m.includes("completion")) return [T(["completions"])];
  if (/pass(ing)? att/.test(m)) return [T(["passingAttempts"])];
  if (/rush(ing)? att|carries/.test(m)) return [T(["rushingAttempts"])];
  if (m.includes("reception")) return [T(["receptions", "REC"])];
  if (m.includes("target")) return [T(["receivingTargets"])];
  if (m.includes("interception")) return [T(["interceptions"])];
  if (m.includes("turnover")) return [T(["turnovers", "TO"])];
  if (m.includes("steal")) return [T(["steals", "STL"])];
  if (m.includes("block")) return [T(["blocks", "BLK"])];
  if (m.includes("points")) return [PTS];
  if (m.includes("assist")) return [AST];
  if (m.includes("rebound")) return [REB];
  if (m.includes("goal")) return [T(["goals"])];
  return [];
}

/** Old shape kept for callers that only need to know a market is trackable. */
export function marketGroups(market: string): string[][] {
  return marketTerms(market).map((t) => t.aliases);
}

function readAlias(map: Record<string, string>, aliases: string[]): number | null {
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(map, key)) return statNumber(map[key]);
  }
  return null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function sumTerms(map: Record<string, string>, terms: Term[]): number | null {
  let sum = 0;
  let any = false;
  for (const t of terms) {
    const n = readAlias(map, t.aliases);
    if (n === null) {
      if (!t.opt) return null;
      continue;
    }
    any = true;
    sum += n * t.w;
  }
  return any ? r2(sum) : null;
}

/** Longest completion from the play feed, e.g. "J.Allen pass short right to K.Coleman ... for 23 yards". */
export function longestPassFromPlays(plays: { text: string }[], name: string): number | null {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1].replace(/[^A-Za-z'-]/g, "");
  const tag = new RegExp(`\\b${parts[0][0]}\\.\\s?${last}\\s+pass\\b(?!.*\\bincomplete\\b).*?\\bfor (-?\\d+) yards?`, "i");
  let best: number | null = null;
  for (const p of plays) {
    const m = p.text.match(tag);
    if (m) best = Math.max(best ?? -99, Number(m[1]));
  }
  return best;
}

export function liveStat(map: Record<string, string> | undefined, market: string, plays?: { text: string }[], name?: string): number | null {
  const terms = marketTerms(market);
  if (!terms.length || !map) return null;
  if (terms[0].aliases[0] === "fantasy") {
    const hoops = "points" in map || "PTS" in map;
    return sumTerms(map, hoops ? FANTASY_HOOPS : FANTASY_FOOTBALL);
  }
  if (terms[0].max === "plays-pass") {
    const box = readAlias(map, terms[0].aliases);
    if (box !== null) return box;
    return plays && name ? longestPassFromPlays(plays, name) : null;
  }
  return sumTerms(map, terms);
}

function clockSeconds(clock: string | null): number | null {
  if (!clock) return null;
  const c = clock.trim();
  const m = c.match(/^(\d+):(\d{1,2})(?:\.\d+)?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const s = c.match(/^(\d{1,2})(?:\.\d+)?$/);
  return s ? Number(s[1]) : null;
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
      : league === "wnba" || league === "ncaaw"
        ? { q: 10 * 60, n: 4, ot: 5 * 60 }
        : league === "ncaam"
          ? { q: 20 * 60, n: 2, ot: 5 * 60 }
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

export function playerByName(boxes: LiveBox[], subject: string) {
  const want = subject.toLowerCase().replace(/\s+/g, " ").trim();
  if (want.length < 2) return null;
  const all = boxes.flatMap((b) => b.players);
  return (
    all.find((p) => p.name.toLowerCase() === want) ??
    all.find((p) => p.name.toLowerCase().includes(want) || want.includes(p.name.toLowerCase())) ??
    null
  );
}

/** Player name at the start of ESPN play text ("Donovan Mitchell makes…"). Null when the text does not lead with a name. */
export function playerFromText(text: string): string | null {
  const m = text.trim().match(/^((?:[A-Z][A-Za-z.'-]*\s+){1,3}?(?:[A-Z][A-Za-z.'-]+))(?:\s+(?:Jr\.|Sr\.|II|III|IV))?(?=\s+[a-z(])/);
  if (!m) return null;
  const full = text.trim().slice(0, m[0].length);
  if (/^(End|Start|Timeout|Official|Jump Ball|Full|Kickoff|Two)\b/.test(full)) return null;
  return full;
}

export type PlayKind = "three" | "dunk" | "bucket" | "miss" | "ft" | "rebound" | "turnover" | "foul" | "block" | "steal" | "sub" | "td" | "fg" | "pass" | "rush" | "sack" | "punt" | "pick" | "goal" | "shot" | "save" | "penalty" | "hit" | "out" | "period" | "other";

/** Icon bucket from ESPN's own type text and play text. Display only. */
export function playKind(p: LivePlay): PlayKind {
  const t = `${p.typeText} ${p.text}`.toLowerCase();
  if (/end (of )?(the )?(period|quarter|half|game|inning)|end period|start|timeout/.test(t)) return "period";
  if (/substitution|enters the game/.test(t)) return "sub";
  if (/touchdown/.test(t)) return "td";
  if (/field goal good|extra point good/.test(t)) return "fg";
  if (/intercept/.test(t)) return "pick";
  if (/fumble|turnover|bad pass|traveling|offensive foul turnover/.test(t)) return "turnover";
  if (/sack/.test(t)) return "sack";
  if (/punt/.test(t)) return "punt";
  if (/penalty/.test(t)) return "penalty";
  if (/\bgoal\b/.test(t) && p.scoring) return "goal";
  if (/save|saved/.test(t)) return "save";
  if (/home run|single|double|triple/.test(t) && !/double play/.test(t)) return "hit";
  if (/strikes out|flies out|grounds out|lines out|pops out|out at/.test(t)) return "out";
  if (/free throw/.test(t)) return "ft";
  if (/block/.test(t)) return "block";
  if (/steal/.test(t)) return "steal";
  if (/foul/.test(t)) return "foul";
  if (/rebound/.test(t)) return "rebound";
  if (/dunk/.test(t) && p.scoring) return "dunk";
  if (p.scoring && p.points >= 3 && /three|3-pt|3pt/.test(t)) return "three";
  if (/pass (complete|incomplete)|pass short|pass deep/.test(t)) return "pass";
  if (/rush|run for|left end|right end|up the middle|left tackle|right tackle|left guard|right guard/.test(t)) return "rush";
  if (/shot|layup|jumper|hook|tip|dunk/.test(t)) return p.scoring ? "bucket" : /miss/.test(t) ? "miss" : "shot";
  return "other";
}

/** True when ESPN's type text marks a field-goal attempt with a location (not a free throw). */
export function isShotAttempt(p: LivePlay): boolean {
  if (p.x === null || p.y === null) return false;
  const t = `${p.typeText} ${p.text}`.toLowerCase();
  if (/free throw/.test(t)) return false;
  return /shot|layup|dunk|jumper|hook|tip|three point/.test(t);
}
