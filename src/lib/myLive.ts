/**
 * My Live: one view of every game you care about, your open picks and parlays, and a quiet play feed.
 * Pure helpers. Real ESPN values only; W/L/P/open only, no money.
 */
import type { LiveSnap, LivePlay } from "@/lib/live";
import type { Pick } from "@/lib/types";
import type { ScoreRow } from "@/lib/slate";
import type { Follow } from "@/lib/follows";
import { bigLabel, isKeyPlay, playNames } from "@/lib/alerts";
import { sideOf, gradePick } from "@/lib/grade";
import { sideLine } from "@/lib/plusLegs";
import { legFromPick, unitsNeeded, type Leg } from "@/lib/motivation";
import { clockSpan, type TrackTone } from "@/lib/tracker";
import { chanceTone, playedShare } from "@/lib/chance";

export type LegState = "waiting" | "alive" | "behind" | "hit" | "missed" | "push" | "no-match";

export type LegView = {
  pickId: string;
  slipKey: string;
  league: string;
  gameId: string;
  key: string;
  kind: "prop" | "team";
  /** Player or team. */
  name: string;
  /** "Over 24.5 pts", "BUF -3.5", "BUF ML", "Over 47.5 total". */
  label: string;
  /** Which way you went, for the colored chip. */
  side: string;
  value: number | null;
  valueText: string;
  lineText: string;
  fill: number;
  tone: TrackTone;
  state: LegState;
  note: string;
  /** Chance to hit, 0–100: pace model for props, ESPN win chance for sides. */
  chance: number | null;
  athleteId: string | null;
  /** Graded from the final box here, before the Log catches up. */
  auto: boolean;
  /** Settled in your Log. */
  settled: boolean;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const gameKey = (league: string, id: string) => `${league}/${id}`;

const SCALE: Record<string, number> = { nfl: 14, ncaaf: 14, nba: 12, wnba: 12, ncaam: 12, ncaaw: 12, mlb: 4, nhl: 2 };

export function fmtLine(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

const STATUS_STATE: Record<string, LegState> = { win: "hit", loss: "missed", push: "push" };

function propState(l: Leg): LegState {
  if (l.status === "cleared") return "hit";
  if (l.status === "missed") return "missed";
  if (l.status === "on-track") return "alive";
  if (l.status === "behind") return "behind";
  if (l.status === "no-match") return "no-match";
  return "waiting";
}

const TONE_OF: Record<LegState, TrackTone | null> = { hit: "gold", missed: "red", push: "flat", waiting: null, alive: null, behind: null, "no-match": "flat" };

/** A player prop, from the same meter the Log and slips use. */
export function propView(pick: Pick, leg: Leg, snap: LiveSnap | null): LegView {
  let state = propState(leg);
  let auto = false;
  if (pick.status !== "open") state = STATUS_STATE[pick.status] ?? state;
  else if (snap?.state === "post") {
    const g = gradePick(pick, snap);
    if (g) {
      state = STATUS_STATE[g];
      auto = true;
    }
  }
  return {
    pickId: pick.id,
    slipKey: leg.slipKey,
    league: leg.league,
    gameId: leg.gameId,
    key: gameKey(leg.league, leg.gameId),
    kind: "prop",
    name: leg.name,
    label: pick.plus ? `${sideLine(pick)} ${leg.market}` : `${leg.side} ${leg.line} ${leg.market}`,
    side: leg.side,
    value: leg.value,
    valueText: leg.value === null ? "—" : String(leg.value),
    lineText: pick.plus ? sideLine(pick) : String(leg.line),
    fill: leg.fill,
    tone: TONE_OF[state] ?? leg.tone,
    state,
    note: leg.progress,
    chance: state === "hit" ? 100 : state === "missed" ? 0 : leg.chance?.pct ?? null,
    athleteId: leg.athleteId ?? null,
    auto,
    settled: pick.status !== "open",
  };
}

/** Spread, total, or moneyline: live score against your line. Null when it isn't a team leg. */
export function teamView(pick: Pick, snap: LiveSnap | null, slipKey: string): LegView | null {
  const m = (pick.market ?? "").toLowerCase();
  if (m !== "total" && m !== "spread" && m !== "moneyline") return null;
  if (!pick.league || !pick.gameId) return null;
  const sideName = pick.subject;
  const over = pick.selection !== "Under";
  const label = m === "total" ? `${over ? "Over" : "Under"} ${pick.line} total` : m === "spread" ? `${sideName} ${fmtLine(pick.line)}` : `${sideName} ML`;
  const base: LegView = {
    pickId: pick.id,
    slipKey,
    league: pick.league,
    gameId: pick.gameId,
    key: gameKey(pick.league, pick.gameId),
    kind: "team",
    name: m === "total" ? pick.subject : sideName,
    label,
    side: m === "total" ? (over ? "Over" : "Under") : m === "spread" ? "Spread" : "ML",
    value: null,
    valueText: "—",
    lineText: m === "moneyline" ? "" : m === "spread" ? fmtLine(pick.line) : String(pick.line),
    fill: 0,
    tone: "flat",
    state: "waiting",
    note: label,
    chance: null,
    athleteId: null,
    auto: false,
    settled: pick.status !== "open",
  };
  const settledState = pick.status !== "open" ? STATUS_STATE[pick.status] : null;
  const scored = !!snap && snap.state !== "pre" && snap.awayScore != null && snap.homeScore != null;
  if (!snap || !scored) {
    return settledState ? { ...base, state: settledState, tone: TONE_OF[settledState] ?? "flat", fill: 100 } : base;
  }
  const a = Number(snap.awayScore) || 0;
  const h = Number(snap.homeScore) || 0;
  const final = snap.state === "post";
  const graded = settledState ?? (final ? (() => { const g = gradePick(pick, snap); return g ? STATUS_STATE[g] : null; })() : null);
  const auto = !settledState && !!graded;
  const scale = SCALE[pick.league] ?? 2;
  let out: LegView;
  if (m === "total") {
    const v = snap.tennis ? snap.tennis.games : a + h;
    const line = pick.line;
    const span = clockSpan(pick.league, snap.period, snap.clock, snap.state);
    const played = snap.tennis ? 0 : playedShare(pick.league, span, snap.period, snap.state, snap.bug?.half ?? null);
    const pace = !final && played >= 0.1 ? round1(v / played) : null;
    let state: LegState = pace === null ? "alive" : (over ? pace > line : pace < line) ? "alive" : "behind";
    if (over && v > line) state = "hit";
    if (!over && v > line) state = "missed";
    const note = over
      ? v > line ? `${v} of ${line} · over the line` : `${v} of ${line} · ${unitsNeeded(line, v)} to go${pace !== null ? ` · pace ${pace}` : ""}`
      : v > line ? `${v} of ${line} · over the line` : `${v} of ${line} · ${round1(line - v)} of room${pace !== null ? ` · pace ${pace}` : ""}`;
    out = { ...base, value: v, valueText: String(v), fill: clamp(line > 0 ? (v / line) * 100 : 0, 0, 100), state, note, tone: state === "alive" ? "green" : state === "behind" ? "red" : "flat" };
  } else {
    const side = sideOf(pick.subject, snap);
    if (!side) return { ...base, state: settledState ?? "no-match", note: "Can't tell which team this is" };
    const mine = side === "away" ? a : h;
    const theirs = side === "away" ? h : a;
    const abbr = side === "away" ? snap.awayAbbr : snap.homeAbbr;
    const margin = mine - theirs;
    const marginText = margin > 0 ? `+${margin}` : String(margin);
    const label2 = m === "spread" ? `${abbr} ${fmtLine(pick.line)}` : `${abbr} ML`;
    if (m === "spread") {
      const cover = round1(margin + pick.line);
      const state: LegState = cover > 0 ? "alive" : cover < 0 ? "behind" : "alive";
      const note = cover > 0 ? `Covering by ${cover}` : cover < 0 ? `Needs ${-cover} more` : "On the number";
      out = { ...base, label: label2, value: margin, valueText: marginText, fill: clamp(50 + 50 * (cover / scale), 2, 100), state, note, tone: cover > 0 ? "green" : cover < 0 ? "red" : "flat" };
    } else {
      const win = snap.homeWin != null && !final ? clamp(side === "home" ? snap.homeWin : 100 - snap.homeWin, 0, 100) : null;
      const state: LegState = margin >= 0 ? "alive" : "behind";
      const unit = snap.tennis ? (Math.abs(margin) === 1 ? " set" : " sets") : "";
      const note = `${margin > 0 ? `Up ${margin}${unit}` : margin < 0 ? `Down ${-margin}${unit}` : snap.tennis ? "Sets level" : "Tied"}${win !== null ? ` · ESPN ${Math.round(win)}% to win` : ""}`;
      const tone: TrackTone = win !== null ? chanceTone(win) === "gold" ? "green" : chanceTone(win) : margin > 0 ? "green" : margin < 0 ? "red" : "flat";
      out = { ...base, label: label2, value: margin, valueText: marginText, fill: win ?? clamp(50 + 50 * (margin / scale), 2, 100), state, note, tone, chance: win };
    }
  }
  if (graded) out = { ...out, state: graded, tone: TONE_OF[graded] ?? "flat", auto, chance: graded === "hit" ? 100 : graded === "missed" ? 0 : out.chance };
  if (out.state === "hit" && !graded) out = { ...out, tone: "gold", chance: 100 };
  if (out.state === "missed" && !graded) out = { ...out, tone: "red", chance: 0 };
  return out;
}

/** Every pick tied to a game, as a live leg. Uses the hub's legs (with their hype lines) when it has them. */
export function legViews(picks: Pick[], snaps: Record<string, LiveSnap>, hubLegs: Leg[], slipKeyOf: (p: Pick) => string): LegView[] {
  const out: LegView[] = [];
  for (const p of picks) {
    if (!p.league || !p.gameId) continue;
    const snap = snaps[gameKey(p.league, p.gameId)] ?? null;
    const team = teamView(p, snap, slipKeyOf(p));
    if (team) {
      out.push(team);
      continue;
    }
    const leg = hubLegs.find((l) => l.pickId === p.id) ?? legFromPick(p, snap);
    if (leg) out.push(propView(p, leg, snap));
  }
  return out;
}

export type SlipView = {
  key: string;
  legs: LegView[];
  hit: number;
  alive: number;
  missed: number;
  push: number;
  total: number;
  /** Overall: every leg hit, any leg missed, otherwise still alive (or not started). */
  state: "hit" | "missed" | "alive" | "waiting";
  /** 0 live, 1 not started, 2 done. */
  rank: number;
  /** Every leg together, when each leg has a chance. Rough: same-game legs move together. */
  chance: number | null;
};

export function groupViews(legs: LegView[], states: Record<string, "pre" | "in" | "post" | undefined>): SlipView[] {
  const map = new Map<string, LegView[]>();
  for (const l of legs) {
    const list = map.get(l.slipKey) ?? [];
    list.push(l);
    map.set(l.slipKey, list);
  }
  const out = [...map.entries()].map(([key, list]): SlipView => {
    const hit = list.filter((l) => l.state === "hit").length;
    const missed = list.filter((l) => l.state === "missed").length;
    const push = list.filter((l) => l.state === "push").length;
    const alive = list.length - hit - missed - push;
    const anyLive = list.some((l) => states[l.key] === "in" && !(l.state === "hit" || l.state === "missed" || l.state === "push"));
    const allDone = alive === 0;
    const notStarted = list.every((l) => l.state === "waiting");
    const state: SlipView["state"] = missed ? "missed" : allDone && hit + push === list.length ? "hit" : notStarted ? "waiting" : "alive";
    const pcts = list.map((l) => (l.state === "hit" || l.state === "push" ? 100 : l.chance));
    const chance = list.length > 1 && pcts.every((p) => p != null) ? round1(pcts.reduce<number>((acc, p) => acc * ((p as number) / 100), 1) * 100) : null;
    return { key, legs: list, hit, alive, missed, push, total: list.length, state, rank: anyLive ? 0 : allDone || missed ? 2 : 1, chance };
  });
  return out.sort((x, y) => x.rank - y.rank);
}

export type GameReason = "picks" | "team" | "follow";

export type GameView = {
  key: string;
  league: string;
  id: string;
  state: "pre" | "in" | "post";
  snap: LiveSnap | null;
  row: ScoreRow | null;
  start: string | null;
  reasons: GameReason[];
  legs: LegView[];
};

/** Same calendar day in this browser's zone. */
export function sameLocalDay(iso: string | null | undefined, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/**
 * Games you care about, split into live, coming up, and final today.
 * Live: games with your picks first, then your team, then games you follow.
 */
export function buildGames(input: {
  picks: Pick[];
  follows: Follow[];
  favRow: ScoreRow | null;
  rows: ScoreRow[];
  snaps: Record<string, LiveSnap>;
  legs: LegView[];
  now: Date;
}): { live: GameView[]; later: GameView[]; final: GameView[] } {
  const { picks, follows, favRow, rows, snaps, legs, now } = input;
  const map = new Map<string, GameView>();
  const add = (league: string, id: string, reason: GameReason) => {
    const k = gameKey(league, id);
    const have = map.get(k);
    if (have) {
      if (!have.reasons.includes(reason)) have.reasons.push(reason);
      return;
    }
    const snap = snaps[k] ?? null;
    const row = rows.find((r) => r.id === id && r.league === league) ?? null;
    const state = snap?.state ?? row?.state;
    if (!state) return;
    map.set(k, { key: k, league, id, state, snap, row, start: row?.start ?? snap?.start ?? null, reasons: [reason], legs: legs.filter((l) => l.key === k) });
  };
  for (const p of picks) if (p.league && p.gameId) add(p.league, p.gameId, "picks");
  if (favRow) add(favRow.league, favRow.id, "team");
  for (const f of follows) add(f.league, f.id, "follow");
  const rank = (g: GameView) => (g.reasons.includes("picks") ? 0 : g.reasons.includes("team") ? 1 : 2);
  const all = [...map.values()];
  const t = (g: GameView) => (g.start ? Date.parse(g.start) : Number.MAX_SAFE_INTEGER);
  const live = all.filter((g) => g.state === "in").sort((a, b) => rank(a) - rank(b) || t(a) - t(b));
  // Coming up: today, plus later games that carry an open pick.
  const later = all
    .filter(
      (g) =>
        g.state === "pre" &&
        (sameLocalDay(g.start, now) || (!g.start && !!g.row) || (!!g.start && Date.parse(g.start) > now.getTime() && g.legs.some((l) => !l.settled)))
    )
    .sort((a, b) => t(a) - t(b));
  // Final: today's games only (on today's scoreboard, or started today), newest first.
  const final = all.filter((g) => g.state === "post" && (!!g.row || sameLocalDay(g.start, now) || g.legs.length > 0)).sort((a, b) => t(b) - t(a));
  return { live, later, final };
}

export type FeedItem = {
  id: string;
  gameKey: string;
  league: string;
  gameId: string;
  text: string;
  tag: string;
  mine: boolean;
  score: string;
  when: string;
  teamId: string | null;
  /** Position in the game's play list; later plays sort first within one game. */
  order: number;
};

/**
 * Quiet feed: plays by players on your picks (any game), and key plays (touchdowns, turnovers, goals,
 * home runs) only in games you follow or your team's game. No generic every-score spam.
 */
export function buildFeed(games: GameView[], perGame = 12): FeedItem[] {
  const out: FeedItem[] = [];
  for (const g of games) {
    const s = g.snap;
    if (!s || s.state === "pre") continue;
    const names = [...new Set(g.legs.filter((l) => l.kind === "prop").map((l) => l.name))];
    const followed = g.reasons.includes("follow") || g.reasons.includes("team");
    let kept = 0;
    for (let i = s.plays.length - 1; i >= 0 && kept < perGame; i--) {
      const p: LivePlay = s.plays[i];
      if (!p.text) continue;
      const mine = names.length > 0 && playNames(p.text, names);
      const key = followed && isKeyPlay(p);
      if (!mine && !key) continue;
      kept++;
      const sc = p.awayScore != null && p.homeScore != null ? `${s.awayAbbr} ${p.awayScore} · ${p.homeScore} ${s.homeAbbr}` : `${s.awayAbbr} @ ${s.homeAbbr}`;
      out.push({
        id: `${g.key}:${p.id}`,
        gameKey: g.key,
        league: g.league,
        gameId: g.id,
        text: p.text.trim(),
        tag: mine ? "Your player" : bigLabel(p),
        mine,
        score: sc,
        when: [p.period ? periodTag(g.league, p.period) : "", p.clock && !/^0:00$/.test(p.clock) && g.league !== "mlb" ? p.clock : ""].filter(Boolean).join(" "),
        teamId: p.teamId,
        order: i,
      });
    }
  }
  return out;
}

function periodTag(league: string, period: string): string {
  const n = Number(period);
  if (!Number.isFinite(n) || n <= 0) return period;
  if (league === "mlb") return `Inn ${n}`;
  if (league === "nhl") return n <= 3 ? `P${n}` : "OT";
  if (league === "nfl" || league === "ncaaf" || league === "nba" || league === "wnba") return n <= 4 ? `Q${n}` : "OT";
  if (league === "ncaam") return n <= 2 ? `H${n}` : "OT";
  return `P${n}`;
}

/** "7:30 PM" today, "Sat 7:30 PM" another day. In this browser's zone. */
export function fmtStart(iso: string | null, now: Date): string {
  if (!iso) return "Today";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Today";
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameLocalDay(iso, now) ? time : `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

export const _test = { teamView, groupViews, buildFeed, buildGames, fmtLine, sameLocalDay };
