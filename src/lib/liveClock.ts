/**
 * Live game clock between ESPN updates. Pure.
 * ESPN posts no "clock running" flag, so the clock only ticks on evidence: basketball and hockey when two ESPN
 * updates in a row show it moving; football after a snap that keeps the clock running (a run or catch in bounds);
 * soccer always counts up during a half. Every ESPN update re-anchors it, and it never ticks past a cap.
 * Anything else shows ESPN's own value, still.
 */

export type ClockModel = {
  league: string;
  /** ESPN's value as posted. */
  espn: string | null;
  /** Seconds on ESPN's clock at `at` (countdown sports) or elapsed seconds (soccer). Null = cannot tick. */
  secs: number | null;
  /** When the current ESPN value was first seen (ms). */
  at: number;
  /** -1 counts down, +1 counts up, 0 still. */
  dir: -1 | 0 | 1;
  /** Most seconds it may tick away from `secs` before it waits for ESPN. */
  cap: number;
  /** Soccer: "90'+3'" style stoppage base minute, when ESPN shows one. */
  stoppage?: { base: number; plus: number } | null;
};

export type ClockInput = {
  league: string;
  state: "pre" | "in" | "post";
  clock: string | null;
  detail: string;
  period: number | null;
  /** Latest play's type and text (to see clock-stopping plays). */
  lastPlay?: { typeText: string; text: string } | null;
};

const COUNTDOWN = new Set(["nba", "wnba", "ncaam", "ncaaw", "nhl", "nfl", "ncaaf"]);
const SOCCER = new Set(["epl", "mls", "ucl", "laliga", "seriea", "bundesliga", "soccer"]);
export const isSoccerLeague = (l: string) => SOCCER.has(l) || /^soccer|\.\d$/.test(l);

/** "11:46" → 706, "0:47.3" → 47.3, "47.0" → 47. Null when not a clock. */
export function clockSecs(v: string | null): number | null {
  if (!v) return null;
  const s = v.trim();
  let m = s.match(/^(\d{1,2}):(\d{2})(?:\.(\d))?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3]) / 10 : 0);
  m = s.match(/^(\d{1,2})\.(\d)$/);
  if (m) return Number(m[1]) + Number(m[2]) / 10;
  return null;
}

/** "80'" → 80; "45'+2'" → {45, 2}. */
export function soccerMinute(v: string | null): { min: number; plus: number } | null {
  if (!v) return null;
  const m = v.trim().match(/^(\d{1,3})'?(?:\s*\+\s*(\d{1,2})'?)?$/);
  if (!m) return null;
  return { min: Number(m[1]), plus: m[2] ? Number(m[2]) : 0 };
}

const STOPPED_STATUS = /halftime|end of|end \d|end period|intermission|delay|suspend|postponed|overtime break|shootout|final|between/i;
/** Plays after which the clock is stopped until the next restart (all sports). */
const STOP_PLAY = /timeout|end (of )?(the )?(period|quarter|half|game)|end period|free throw|foul|jump ball|review|challenge|injury|official|violation|stoppage|offside|icing|penalty|goal\b|substitution|two-minute|kickoff|extra point|field goal|touchdown|punt|incomplete|out of bounds|\bob\b|spike|intercept|fumble|safety|turnover|sack.*fumble|kneel|end zone/i;
/** Football snaps after which the clock keeps running (in bounds). */
const FOOTBALL_RUNS = /rush|run for|left end|right end|up the middle|left tackle|right tackle|left guard|right guard|pass (short|deep).* to .* for|sacked|pass complete/i;

/** Football: does the clock keep running after this snap? Unknown = false (do not tick). */
export function footballClockRuns(p: { typeText: string; text: string } | null | undefined): boolean {
  if (!p) return false;
  const t = `${p.typeText} ${p.text}`;
  if (STOP_PLAY.test(t)) return false;
  return FOOTBALL_RUNS.test(t);
}

/** Next model from a new ESPN update. `prev` is the model before it; `now` is when it arrived. */
export function nextClock(prev: ClockModel | null, s: ClockInput, now: number): ClockModel {
  const still = (secs: number | null = null): ClockModel => ({ league: s.league, espn: s.clock, secs, at: now, dir: 0, cap: 0 });
  if (s.state !== "in" || !s.clock || STOPPED_STATUS.test(s.detail)) return still();
  const same = prev && prev.league === s.league && prev.espn === s.clock;
  // Same value as before: keep its anchor (the first time ESPN showed it).
  const at = same ? prev!.at : now;

  if (isSoccerLeague(s.league)) {
    const m = soccerMinute(s.clock);
    if (!m) return still();
    // Count up only once ESPN has shown a minute change: then we know roughly where in the minute we are.
    const changed = prev && !same && prev.espn !== null && soccerMinute(prev.espn) !== null;
    const anchored = same ? prev!.dir === 1 : !!changed;
    if (!anchored) return { ...still(), at };
    return { league: s.league, espn: s.clock, secs: (m.plus ? m.min + m.plus : m.min) * 60 - 60, at, dir: 1, cap: 60, stoppage: m.plus ? { base: m.min, plus: m.plus } : null };
  }

  if (!COUNTDOWN.has(s.league)) return still();
  const secs = clockSecs(s.clock);
  if (secs === null) return still();
  const football = s.league === "nfl" || s.league === "ncaaf";
  if (football) {
    // ESPN moves the football clock once per snap. It runs on only after a snap in bounds.
    if (!footballClockRuns(s.lastPlay)) return { ...still(secs), at };
    return { league: s.league, espn: s.clock, secs, at, dir: -1, cap: 40 };
  }
  // Basketball and hockey: a stopping play or the same value 3+ seconds later = stopped.
  if (s.lastPlay && STOP_PLAY.test(`${s.lastPlay.typeText} ${s.lastPlay.text}`) && !/shot|layup|jumper|dunk|rebound/i.test(s.lastPlay.typeText)) {
    return { ...still(secs), at };
  }
  if (same) {
    if (prev!.dir === -1 && now - prev!.at < 3000) return prev!;
    return { ...still(secs), at };
  }
  const prevSecs = prev && prev.league === s.league ? clockSecs(prev.espn) : null;
  // Moving down, and not faster than real time allows: running.
  const moving = prevSecs !== null && secs < prevSecs && prevSecs - secs <= (now - prev!.at) / 1000 + 3;
  return moving ? { league: s.league, espn: s.clock, secs, at, dir: -1, cap: 6 } : { ...still(secs), at };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** What to show at `now`. */
export function clockAt(m: ClockModel, now: number): string | null {
  if (m.dir === 0 || m.secs === null) return m.espn;
  const dt = Math.min(m.cap, Math.max(0, (now - m.at) / 1000));
  if (m.dir === 1) {
    // Soccer: minute ticks over after 60 s, like a stadium clock. Stoppage keeps the "+n'" form.
    const extra = Math.floor(dt / 60);
    if (!extra) return m.espn;
    if (m.stoppage) return `${m.stoppage.base}'+${m.stoppage.plus + extra}'`;
    const sm = soccerMinute(m.espn);
    return sm ? `${sm.min + extra}'` : m.espn;
  }
  const left = Math.max(0, m.secs - dt);
  if (left < 60 && /\./.test(m.espn ?? "") ) return left.toFixed(1);
  if (left < 60 && !/:/.test(m.espn ?? "")) return left.toFixed(1);
  const whole = Math.ceil(left - 1e-6);
  return `${Math.floor(whole / 60)}:${pad(whole % 60)}`;
}
