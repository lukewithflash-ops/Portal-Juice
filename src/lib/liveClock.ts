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
  /** When the server built this snapshot (ISO). */
  servedAt?: string | null;
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
export function nextClock(prev: ClockModel | null, s: ClockInput, recv: number): ClockModel {
  // Anchor to when the server read the feed (never in the future, never more than 4s back).
  const sa = s.servedAt ? Date.parse(s.servedAt) : NaN;
  const now = Number.isFinite(sa) ? Math.min(recv, Math.max(recv - 4000, sa)) : recv;
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

export type StopReason = { label: string; playId: string | null; known: boolean };
type ReasonPlay = { id: string; typeText: string; text: string; teamId: string | null };
type ReasonSnap = {
  state: string;
  detail: string;
  awayId: string;
  homeId: string;
  awayAbbr: string;
  homeAbbr: string;
  awayName?: string | null;
  homeName?: string | null;
  plays: ReasonPlay[];
};

/** Why the clock is still, read only from the feed: status detail first, then the latest play. Never guesses a cause. */
export function stopReason(league: string, s: ReasonSnap): StopReason | null {
  if (s.state !== "in") return null;
  const d = s.detail || "";
  const soccer = isSoccerLeague(league);
  const football = league === "nfl" || league === "ncaaf";
  const unit = soccer || league.startsWith("ncaam") ? "half" : league === "nhl" ? "period" : "quarter";
  if (/halftime|^ht$/i.test(d)) return { label: "Halftime", playId: null, known: true };
  if (/two[- ]minute/i.test(d)) return { label: "Two-minute warning", playId: null, known: true };
  if (/delay|suspend/i.test(d)) return { label: /suspend/i.test(d) ? "Suspended" : "Delayed", playId: null, known: true };
  if (/intermission/i.test(d)) return { label: "Intermission", playId: null, known: true };
  if (/^end\b|end of/i.test(d)) return { label: d.replace(/\s+/g, " ").trim().slice(0, 28), playId: null, known: true };
  const p = s.plays.length ? s.plays[s.plays.length - 1] : null;
  if (!p) return { label: "Clock stopped", playId: null, known: false };
  const t = `${p.typeText} ${p.text}`;
  const teamAbbr = (): string | null => {
    if (p.teamId && p.teamId === s.awayId) return s.awayAbbr;
    if (p.teamId && p.teamId === s.homeId) return s.homeAbbr;
    for (const [abbr, name] of [[s.awayAbbr, s.awayName], [s.homeAbbr, s.homeName]] as const) {
      if (new RegExp(`\\b${abbr}\\b`).test(p.text)) return abbr;
      const nick = (name ?? "").split(" ").pop();
      if (nick && nick.length > 2 && p.text.toLowerCase().includes(nick.toLowerCase())) return abbr;
    }
    return null;
  };
  const r = (label: string): StopReason => ({ label, playId: p.id, known: true });
  if (/\bvar\b|video assistant/i.test(t)) return r("VAR check");
  if (/review|challenge|replay/i.test(t)) return r("Official review");
  if (/official'?s? ?tv|tv timeout|media timeout|commercial/i.test(t)) return r("TV timeout");
  if (/timeout/i.test(t)) {
    const a = teamAbbr();
    return r(a ? `Timeout ${a}` : /official/i.test(t) ? "Official timeout" : "Timeout");
  }
  if (/two[- ]minute/i.test(t)) return r("Two-minute warning");
  if (/injur/i.test(t)) return r("Injury");
  if (/end (of )?(the )?(game|regulation)/i.test(t)) return r("End of regulation");
  if (/end (of )?(the )?(\d\w* )?(period|quarter|half)|end period|end quarter/i.test(t)) return r(`End of ${/half/i.test(t) ? "half" : unit}`);
  if (/halftime/i.test(t)) return r("Halftime");
  if (/delay/i.test(t) && !/delay of game/i.test(t)) return r("Delay");
  if (football) {
    if (/penalty|flag|delay of game|false start|holding|offside|pass interference/i.test(t)) return r("Penalty flag");
    if (/touchdown/i.test(t)) return r("Touchdown");
    if (/extra point|two-point|2pt|pat\b/i.test(t)) return r("PAT");
    if (/field goal/i.test(t)) return r(/no good|missed|blocked/i.test(t) ? "Missed FG" : "Field goal");
    if (/safety/i.test(t)) return r("Safety");
    if (/kickoff/i.test(t)) return r("Kickoff");
    if (/punt/i.test(t)) return r("Punt · change of possession");
    if (/intercept|fumble|turnover on downs|downs\b/i.test(t)) return r("Change of possession");
    if (/incomplete|spike/i.test(t)) return r("Incomplete pass");
    if (/out of bounds|\bob\b/i.test(t)) return r("Out of bounds");
    if (/kneel/i.test(t)) return r("Kneel down");
  } else if (league === "nhl") {
    if (/goal\b/i.test(t) && !/no goal|goalie|goaltender/i.test(t)) return r("Goal");
    if (/penalty|minor|major|misconduct/i.test(t)) { const a = teamAbbr(); return r(a ? `Penalty ${a} · power play` : "Penalty"); }
    if (/icing/i.test(t)) return r("Icing");
    if (/offside/i.test(t)) return r("Offside");
    if (/stoppage|faceoff|puck (out|over)|frozen|net off/i.test(t)) return r(/faceoff/i.test(t) ? "Faceoff" : "Stoppage");
  } else if (soccer) {
    if (/goal/i.test(t)) return r("Goal");
    if (/substitut/i.test(t)) return r("Substitution");
    if (/card|foul/i.test(t)) return r(/yellow/i.test(t) ? "Foul · yellow card" : /red/i.test(t) ? "Red card" : "Foul");
    if (/offside/i.test(t)) return r("Offside");
  } else {
    if (/free throw/i.test(t)) return r("Free throws");
    if (/foul/i.test(t)) return r("Foul");
    if (/out of bounds|turnover|traveling|violation|kicked ball|backcourt|shot clock/i.test(t)) return r(/out of bounds/i.test(t) ? "Out of bounds" : "Turnover");
    if (/jump ball/i.test(t)) return r("Jump ball");
    if (/substitution|enters the game/i.test(t)) return r("Substitution");
  }
  return { label: "Clock stopped", playId: p.id, known: false };
}
