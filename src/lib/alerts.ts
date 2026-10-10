import { gameRoute } from "@/lib/gameRoute";
/**
 * Game and leg updates worth a heads-up. Pure: compares two real snapshots.
 * Used by the in-app toasts and by closed-app push. No money wording.
 */

import type { LivePlay, LiveSnap } from "@/lib/live";
import { unitsNeeded, type Leg } from "@/lib/motivation";
import { freshSubs } from "@/lib/lineup";

export type AlertKind = "tile" | "score" | "lead" | "big" | "close" | "cleared" | "final" | "player" | "sub";

export const ALERT_KINDS: { kind: AlertKind; label: string; hint: string }[] = [
  { kind: "tile", label: "Live game on lock screen", hint: "One quiet notification per game you follow that updates in place: score, clock, your props. Buzzes only for big moments." },
  { kind: "cleared", label: "Prop cleared", hint: "A logged leg hits its line." },
  { kind: "player", label: "Your player", hint: "A player on your slips moves toward the line. One per player every 90 seconds." },
  { kind: "sub", label: "Your player subbed out", hint: "A player on your picks goes to the bench or is subbed off." },
  { kind: "close", label: "Prop close", hint: "1 or 2 away from the line." },
  { kind: "final", label: "Game final", hint: "Final score for your games." },
  { kind: "lead", label: "Lead change", hint: "The lead flips." },
  { kind: "big", label: "Big plays", hint: "Touchdowns, turnovers, goals, home runs: only in starred games, your team's game, or plays by players on your picks." },
  { kind: "score", label: "End of each quarter", hint: "The score at the end of each quarter, period, or half." },
];

export type AlertPrefs = Record<AlertKind, boolean>;
export const DEFAULT_ALERTS: AlertPrefs = { tile: true, cleared: true, player: true, close: true, final: true, lead: true, big: true, score: true, sub: true };

export type GameAlert = {
  kind: AlertKind;
  /** Stable id so one event fires once. */
  key: string;
  title: string;
  body: string;
  url: string;
  /** Set on "Your player" moments. */
  player?: { name: string; athleteId: string | null; league: string; gain: number; pickId: string };
  /** Leg alerts: the meter for the rich push image. */
  meter?: { name: string; athleteId: string | null; value: number | null; line: number; market: string; side: "Over" | "Under" };
  /** Big plays: the play text, so we can tell whose play it was. */
  play?: string;
};

/** Plays worth a buzz: touchdowns, turnovers, goals, home runs. Not threes or long gains. */
export function isKeyPlay(p: LivePlay): boolean {
  const t = `${p.typeText} ${p.text}`.toLowerCase();
  if (/touchdown/.test(t)) return true;
  if (/\bintercept/.test(t) || /fumble lost|fumbles? .*recovered by/.test(t) || /turnover on downs/.test(t)) return true;
  if (/\bgoal\b/.test(t) && p.scoring) return true;
  if (/home run|homers/.test(t)) return true;
  return false;
}

/** Does this play name one of these players? Matches "J.Allen", "Josh Allen", or a unique last name. */
export function playNames(text: string, names: string[]): boolean {
  const t = text.toLowerCase();
  return names.some((n) => {
    const parts = n.toLowerCase().trim().split(/\s+/);
    if (parts.length < 2) return false;
    const last = parts[parts.length - 1];
    return t.includes(`${parts[0][0]}.${last}`) || t.includes(`${parts[0][0]}. ${last}`) || t.includes(n.toLowerCase());
  });
}

/**
 * Noise filter, the same for push and in-app toasts. Big plays only fire in games you starred or your team's
 * game, or when a player on your picks made the play. Everything else passes through.
 */
export function keepAlert(a: GameAlert, followed: boolean, pickNames: string[]): boolean {
  if (a.kind === "sub") return a.play ? playNames(a.play, pickNames) : false;
  if (a.kind !== "big") return true;
  return followed || (a.play ? playNames(a.play, pickNames) : false);
}

const scoreLine = (s: LiveSnap) => `${s.awayAbbr} ${s.awayScore ?? 0} · ${s.homeScore ?? 0} ${s.homeAbbr}`;
const lead = (s: { awayScore: string | null; homeScore: string | null }) => {
  const d = (Number(s.homeScore) || 0) - (Number(s.awayScore) || 0);
  return d > 0 ? 1 : d < 0 ? -1 : 0;
};

function bigLabel(p: LivePlay): string {
  const t = `${p.typeText} ${p.text}`.toLowerCase();
  if (/touchdown/.test(t)) return "Touchdown";
  if (/intercept/.test(t)) return "Picked off";
  if (/fumble|turnover/.test(t)) return "Turnover";
  if (/\bgoal\b/.test(t) && p.scoring) return "Goal";
  if (/home run/.test(t)) return "Home run";
  if (p.points >= 3) return "From deep";
  return "Big play";
}

export function periodName(league: string, n: number): string {
  const ord = (k: number) => `${k}${k === 1 ? "st" : k === 2 ? "nd" : k === 3 ? "rd" : "th"}`;
  if (league === "nfl" || league === "ncaaf" || league === "nba" || league === "wnba") return n <= 4 ? `Q${n}` : "OT";
  if (league === "ncaam") return n === 1 ? "the 1st half" : n === 2 ? "the 2nd half" : "OT";
  if (league === "nhl") return n <= 3 ? `the ${ord(n)} period` : "OT";
  if (league === "mlb") return `the ${ord(n)} inning`;
  return n === 1 ? "the 1st half" : `period ${n}`;
}

/** Updates between two pulls of one game. Nothing fires on the first look. */
export function gameEvents(league: string, id: string, prev: LiveSnap | null, next: LiveSnap): GameAlert[] {
  if (!prev) return [];
  const url = gameRoute(league, id);
  const g = `${league}/${id}`;
  const out: GameAlert[] = [];
  if (prev.state !== "post" && next.state === "post") {
    out.push({ kind: "final", key: `${g}:final`, title: "Final", body: scoreLine(next), url });
    return out;
  }
  if (next.state !== "in") return out;
  const scored = prev.awayScore !== next.awayScore || prev.homeScore !== next.homeScore;
  const was = lead(prev);
  const now = lead(next);
  if (scored && was !== 0 && now !== 0 && was !== now) {
    const leader = now > 0 ? next.homeAbbr : next.awayAbbr;
    out.push({ kind: "lead", key: `${g}:lead:${next.awayScore}-${next.homeScore}`, title: `${leader} take the lead`, body: `${scoreLine(next)} · ${next.detail}`, url });
  }
  const seen = new Set(prev.plays.map((p) => p.id));
  const fresh = next.plays.filter((p) => !seen.has(p.id));
  const big = [...fresh].reverse().find(isKeyPlay);
  if (big && prev.plays.length) {
    out.push({ kind: "big", key: `${g}:big:${big.id}`, title: bigLabel(big), body: big.text.slice(0, 140), url, play: big.text });
  }
  // Subs: kept only when the player going out is on your picks (see keepAlert).
  for (const sub of freshSubs(league, prev, next).slice(-4)) {
    if (!sub.outName) continue;
    out.push({ kind: "sub", key: `${g}:sub:${sub.text}`, title: `🪑 ${sub.outName} subbed out`, body: `${sub.inName ? `${sub.inName} in · ` : ""}${sub.clock ? `${sub.clock} · ` : ""}${scoreLine(next)}`, url, play: sub.outName });
  }
  // Score only at the end of a quarter, period, or half (finals fire above).
  if (prev.period != null && next.period != null && next.period > prev.period) {
    out.push({ kind: "score", key: `${g}:end:${prev.period}`, title: `End of ${periodName(league, prev.period)}`, body: `${scoreLine(next)}`, url });
  }
  return out;
}

/** Updates for one logged leg. */
export function legEvents(prev: Leg | null, next: Leg): GameAlert[] {
  if (!prev) return [];
  const url = gameRoute(next.league, next.gameId);
  const out: GameAlert[] = [];
  const meter = { name: next.name, athleteId: next.athleteId ?? null, value: next.value, line: next.line, market: next.market, side: next.side };
  if (prev.status !== "cleared" && next.status === "cleared") {
    out.push({
      kind: "cleared",
      key: `${next.pickId}:cleared`,
      title: "Hit!",
      body: `${next.name} ${next.side === "Under" ? "stayed under" : "cleared"} ${next.line} ${next.market}${next.value !== null ? ` (${next.value})` : ""}.`,
      url,
      meter,
    });
    return out;
  }
  // Your player: an over leg moved toward its line.
  if (
    next.side === "Over" &&
    !next.final &&
    next.value !== null &&
    prev.value !== null &&
    next.value > prev.value &&
    next.status !== "cleared"
  ) {
    const gain = Math.round((next.value - prev.value) * 10) / 10;
    const toHit = Math.round(Math.max(0, next.line - next.value) * 10) / 10;
    out.push({
      kind: "player",
      key: `${next.pickId}:player:${next.value}`,
      title: `${next.name} +${gain}`,
      body: `${next.value} of ${next.line} ${next.market} · ${toHit} to hit.`,
      url,
      player: { name: next.name, athleteId: next.athleteId ?? null, league: next.league, gain, pickId: next.pickId },
      meter,
    });
  }
  if (next.side === "Over" && !next.final && next.value !== null && next.status !== "cleared") {
    const need = unitsNeeded(next.line, next.value);
    const before = prev.value === null ? Infinity : unitsNeeded(prev.line, prev.value);
    if (need >= 1 && need <= 2 && need < before) {
      out.push({
        kind: "close",
        key: `${next.pickId}:close:${need}`,
        title: `${need} away!`,
        body: `${next.name} ${next.value} of ${next.line} ${next.market}.`,
        url,
        meter,
      });
    }
  }
  return out;
}

export function readAlertPrefs(raw: unknown): AlertPrefs {
  const out = { ...DEFAULT_ALERTS };
  if (raw && typeof raw === "object") {
    for (const { kind } of ALERT_KINDS) {
      const v = (raw as Record<string, unknown>)[kind];
      if (typeof v === "boolean") out[kind] = v;
    }
  }
  return out;
}
