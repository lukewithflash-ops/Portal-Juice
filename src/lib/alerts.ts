/**
 * Game and leg updates worth a heads-up. Pure: compares two real snapshots.
 * Used by the in-app toasts and by closed-app push. No money wording.
 */

import type { LivePlay, LiveSnap } from "@/lib/live";
import { unitsNeeded, type Leg } from "@/lib/motivation";
import { isBigPlay } from "@/lib/tracker";

export type AlertKind = "score" | "lead" | "big" | "close" | "cleared" | "final";

export const ALERT_KINDS: { kind: AlertKind; label: string; hint: string }[] = [
  { kind: "cleared", label: "Prop cleared", hint: "A logged leg hits its line." },
  { kind: "close", label: "Prop close", hint: "1 or 2 away from the line." },
  { kind: "final", label: "Game final", hint: "Final score for your games." },
  { kind: "lead", label: "Lead change", hint: "The lead flips." },
  { kind: "big", label: "Big plays", hint: "Touchdowns, turnovers, 20+ yard plays, threes, goals." },
  { kind: "score", label: "Score updates", hint: "Every score. Basketball is held to one a minute." },
];

export type AlertPrefs = Record<AlertKind, boolean>;
export const DEFAULT_ALERTS: AlertPrefs = { cleared: true, close: true, final: true, lead: true, big: true, score: false };

export type GameAlert = {
  kind: AlertKind;
  /** Stable id so one event fires once. */
  key: string;
  title: string;
  body: string;
  url: string;
};

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

/** Updates between two pulls of one game. Nothing fires on the first look. */
export function gameEvents(league: string, id: string, prev: LiveSnap | null, next: LiveSnap): GameAlert[] {
  if (!prev) return [];
  const url = `/games/${league}/${id}`;
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
  const big = [...fresh].reverse().find(isBigPlay);
  if (big && prev.plays.length) {
    out.push({ kind: "big", key: `${g}:big:${big.id}`, title: bigLabel(big), body: big.text.slice(0, 140), url });
  }
  if (scored) {
    out.push({ kind: "score", key: `${g}:score:${next.awayScore}-${next.homeScore}`, title: "Score", body: `${scoreLine(next)} · ${next.detail}`, url });
  }
  return out;
}

/** Updates for one logged leg. */
export function legEvents(prev: Leg | null, next: Leg): GameAlert[] {
  if (!prev) return [];
  const url = `/games/${next.league}/${next.gameId}`;
  const out: GameAlert[] = [];
  if (prev.status !== "cleared" && next.status === "cleared") {
    out.push({
      kind: "cleared",
      key: `${next.pickId}:cleared`,
      title: "Hit!",
      body: `${next.name} ${next.side === "Under" ? "stayed under" : "cleared"} ${next.line} ${next.market}${next.value !== null ? ` (${next.value})` : ""}.`,
      url,
    });
    return out;
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
