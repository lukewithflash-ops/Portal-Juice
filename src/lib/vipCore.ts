/**
 * VIP picks: pure rules. A pick only qualifies when the ESPN numbers line up hard behind it.
 * Nothing here invents a stat: reasons are the breakdown's own pros (each quotes its numbers) plus the
 * recent record of that exact line. W/L/P only. No money, no units. Not a guarantee.
 */
import { statLabel, type LegInput, type LegReport } from "@/lib/breakdown";
import { pregameChance } from "@/lib/chance";
import { lineOk } from "@/lib/lineSanity";
import { factorCheck, type FactorCtx } from "@/lib/whyCore";

export const VIP_NOTE = "Not a guarantee.";
export const VIP_PRICE = { monthly: "$9.99/month", yearly: "$59.99/year" } as const;
export const VIP_MAX = 5;
export const VIP_MIN_LEAD_MS = 30 * 60 * 1000;
export const CHANCE_LABEL = "Model hit chance (estimate)";

export type Tier = "Max" | "High" | "Solid";
export type VipResult = "win" | "loss" | "push";

export type VipPick = {
  id: string;
  date: string;
  league: string;
  gameId: string;
  game: string;
  start: string;
  /** "Jalen Brunson over 26.5 points", "BOS -3.5", "Over 221.5". */
  title: string;
  sub: string;
  kind: LegInput["kind"];
  leg: LegInput;
  home: string;
  away: string;
  /** Reasons, each with its real numbers (heaviest first). */
  reasons: string[];
  /** The main thing against it, when the data has one. */
  risk: string | null;
  recent: { hits: number; games: number; what: string } | null;
  odds: number | null;
  provider: string | null;
  tier: Tier;
  chance: number;
  chanceSource: string;
  score: number;
  /** Set once, before the game starts. Never edited. */
  createdAt: string;
  result: VipResult | null;
  final: string | null;
  gradedAt: string | null;
};

export type Candidate = {
  leg: LegInput;
  report: LegReport;
  recent: { hits: number; games: number; what: string } | null;
  game: { label: string; start: string; home: string; away: string; state: "pre" | "in" | "post"; provider: string | null };
  /** Injuries (ESPN), line move since open, DK Network money splits. */
  ctx?: FactorCtx | null;
};

export type Verdict = { ok: true; chance: number; source: string; tier: Tier } | { ok: false; why: string };

/** The bar a leg has to clear. Strict on purpose: zero picks beats a weak pick. */
export function qualifies(c: Candidate, now = Date.now()): Verdict {
  const r = c.report;
  if (c.game.state !== "pre") return { ok: false, why: "started" };
  const start = Date.parse(c.game.start);
  if (!Number.isFinite(start) || start - now < VIP_MIN_LEAD_MS) return { ok: false, why: "too close to start" };
  if (start - now > 36 * 3600 * 1000) return { ok: false, why: "too far out" };
  if (r.lean !== "strong") return { ok: false, why: "lean not strong" };
  const fx = factorCheck(c.leg, c.ctx);
  if (fx.skip) return { ok: false, why: fx.skip };
  if (r.pros.length < 3) return { ok: false, why: "fewer than 3 reasons" };
  if (r.cons.length * 2 > r.pros.length) return { ok: false, why: "too many reasons against" };
  if (c.leg.kind === "prop") {
    if (c.leg.line == null || !(c.leg.line > 0) || !lineOk(c.leg.league, statLabel(c.leg.league, c.leg.stat), c.leg.line)) return { ok: false, why: "line fails sanity check" };
    if (!c.recent || c.recent.games < 8) return { ok: false, why: "game log under 8" };
    if (c.recent.hits / c.recent.games < 0.7) return { ok: false, why: "line hit under 70% of last games" };
  } else {
    if (c.leg.kind !== "moneyline" && (c.leg.line == null || !Number.isFinite(c.leg.line))) return { ok: false, why: "no line" };
    if (!c.recent || c.recent.games < 5) return { ok: false, why: "team sample under 5" };
    if (c.recent.hits / c.recent.games < 0.6) return { ok: false, why: "line hit under 60% recently" };
  }
  if (r.odds == null || !Number.isFinite(r.odds)) return { ok: false, why: "no DK price" };
  if (r.odds < -220) return { ok: false, why: "price too short" };
  const ch = pregameChance(r.odds, c.recent);
  if (!ch || ch.pct < 55) return { ok: false, why: "hit chance under 55%" };
  let tier: Tier = ch.pct >= 64 && r.score >= 5 ? "Max" : ch.pct >= 59 && r.score >= 4 ? "High" : "Solid";
  // Soft flags (key player questionable, public side) cap the tier; they never raise it.
  if (fx.cons.length && tier === "Max") tier = "High";
  return { ok: true, chance: ch.pct, source: ch.source, tier };
}

const TIER_RANK: Record<Tier, number> = { Max: 3, High: 2, Solid: 1 };

/** Best qualifying legs: one per player or game side, at most two per game, at most `room`. */
export function selectVip(cands: Candidate[], room: number, taken: { gameId: string; key: string }[] = [], now = Date.now()) {
  const ok = cands
    .map((c) => ({ c, v: qualifies(c, now) }))
    .filter((x): x is { c: Candidate; v: Extract<Verdict, { ok: true }> } => x.v.ok)
    .sort((a, b) => TIER_RANK[b.v.tier] - TIER_RANK[a.v.tier] || b.v.chance - a.v.chance || b.c.report.score - a.c.report.score);
  const out: { c: Candidate; v: Extract<Verdict, { ok: true }> }[] = [];
  const keys = new Set(taken.map((t) => t.key));
  const perGame = new Map<string, number>();
  for (const t of taken) perGame.set(t.gameId, (perGame.get(t.gameId) ?? 0) + 1);
  for (const x of ok) {
    if (out.length >= room) break;
    const key = legKey(x.c.leg);
    if (keys.has(key)) continue;
    if ((perGame.get(x.c.leg.gameId) ?? 0) >= 2) continue;
    keys.add(key);
    perGame.set(x.c.leg.gameId, (perGame.get(x.c.leg.gameId) ?? 0) + 1);
    out.push(x);
  }
  return out;
}

/** Same player, or same game market, counts once (no over and under of one thing). */
export function legKey(l: LegInput): string {
  return l.kind === "prop" ? `${l.gameId}:p:${l.athleteId ?? l.athleteName}` : `${l.gameId}:${l.kind === "moneyline" ? "spread" : l.kind}`;
}

export function toVip(c: Candidate, v: Extract<Verdict, { ok: true }>, date: string, now = new Date()): VipPick {
  const pros = [...c.report.pros].sort((a, b) => b.weight - a.weight).map((p) => p.text);
  const cons = [...c.report.cons].sort((a, b) => a.weight - b.weight).map((p) => p.text);
  const fx = factorCheck(c.leg, c.ctx);
  const base = c.recent && !pros.some((p) => p.includes(` of last ${c.recent!.games}`)) ? [c.recent.what, ...pros] : pros;
  // Market/injury notes go second so the record line stays first.
  const reasons = fx.pros.length ? [base[0], ...fx.pros.slice(0, 2), ...base.slice(1)].filter(Boolean) : base;
  cons.unshift(...fx.cons);
  return {
    id: `${date}:${legKey(c.leg)}`.replace(/[^A-Za-z0-9:_-]/g, "_"),
    date,
    league: c.leg.league,
    gameId: c.leg.gameId,
    game: c.game.label,
    start: c.game.start,
    title: c.report.title,
    sub: c.report.sub,
    kind: c.leg.kind,
    leg: c.leg,
    home: c.game.home,
    away: c.game.away,
    reasons: reasons.slice(0, 5),
    risk: cons[0] ?? null,
    recent: c.recent,
    odds: c.report.odds,
    provider: c.game.provider,
    tier: v.tier,
    chance: v.chance,
    chanceSource: v.source,
    score: c.report.score,
    createdAt: now.toISOString(),
    result: null,
    final: null,
    gradedAt: null,
  };
}

export type VipTeaser = Pick<VipPick, "id" | "date" | "league" | "game" | "start" | "tier" | "kind" | "result" | "final"> & { locked: true };

export function teaser(p: VipPick): VipTeaser {
  return { id: p.id, date: p.date, league: p.league, game: p.game, start: p.start, tier: p.tier, kind: p.kind, result: p.result, final: p.final, locked: true };
}

export type VipRecord = {
  wins: number;
  losses: number;
  pushes: number;
  open: number;
  rate: number | null;
  /** "W3" or "L1": current run of wins or losses, pushes skipped. */
  streak: { kind: "W" | "L"; n: number } | null;
  best: number;
  bySport: { league: string; wins: number; losses: number; pushes: number }[];
};

export function vipRecord(picks: VipPick[]): VipRecord {
  const graded = picks.filter((p) => p.result).sort((a, b) => (a.gradedAt ?? a.start).localeCompare(b.gradedAt ?? b.start) || a.start.localeCompare(b.start));
  const wins = graded.filter((p) => p.result === "win").length;
  const losses = graded.filter((p) => p.result === "loss").length;
  const pushes = graded.filter((p) => p.result === "push").length;
  let streak: VipRecord["streak"] = null;
  let best = 0;
  let run = 0;
  for (const p of graded) {
    if (p.result === "push") continue;
    const k = p.result === "win" ? "W" : "L";
    streak = streak && streak.kind === k ? { kind: k, n: streak.n + 1 } : { kind: k, n: 1 };
    run = k === "W" ? run + 1 : 0;
    best = Math.max(best, run);
  }
  const by = new Map<string, { league: string; wins: number; losses: number; pushes: number }>();
  for (const p of graded) {
    const r = by.get(p.league) ?? { league: p.league, wins: 0, losses: 0, pushes: 0 };
    if (p.result === "win") r.wins++;
    else if (p.result === "loss") r.losses++;
    else r.pushes++;
    by.set(p.league, r);
  }
  return {
    wins,
    losses,
    pushes,
    open: picks.filter((p) => !p.result).length,
    rate: wins + losses ? Math.round((wins / (wins + losses)) * 1000) / 10 : null,
    streak,
    best,
    bySport: [...by.values()].sort((a, b) => b.wins + b.losses - (a.wins + a.losses)),
  };
}
