/**
 * Chance to hit, for the live tracker. Pure and transparent:
 * - Pregame: implied chance from the posted price (or recent hit rate when there is no price).
 * - In game (props): what is left to get, against an expected remaining amount. The expected amount
 *   blends the posted line (the market's full-game number) with the live pace, weighted by how much
 *   of the game is played. Counting stats use Poisson; yardage uses a normal curve.
 * - Team picks: ESPN win probability for moneylines; score + time left for spreads and totals.
 * 100 once hit, 0 once it cannot happen. An estimate, never a guarantee.
 */

export const CHANCE_NOTE = "Estimate from pace and price. Not a guarantee.";

export type ChanceSource = "price" | "recent" | "price + recent" | "pace" | "win prob" | "score + clock" | "done";
export type Chance = { pct: number; source: ChanceSource };

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const pct = (p: number) => Math.round(clamp(p) * 1000) / 10;

/** American odds to implied chance, 0–1. Null for missing or invalid odds. */
export function impliedFromAmerican(odds: number | null | undefined): number | null {
  if (odds == null || !Number.isFinite(odds) || Math.abs(odds) < 100) return null;
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** P(X >= k) for X ~ Poisson(mu). */
export function poissonAtLeast(k: number, mu: number): number {
  if (k <= 0) return 1;
  if (mu <= 0) return 0;
  let term = Math.exp(-mu);
  let below = term;
  for (let i = 1; i < k; i++) {
    term *= mu / i;
    below += term;
  }
  return clamp(1 - below);
}

export function pregameChance(odds: number | null | undefined, recent?: { hits: number; games: number } | null): Chance | null {
  const p = impliedFromAmerican(odds);
  const r = recent && recent.games >= 3 ? (recent.hits + 1) / (recent.games + 2) : null;
  if (p != null && r != null) return { pct: pct(0.7 * p + 0.3 * r), source: "price + recent" };
  if (p != null) return { pct: pct(p), source: "price" };
  if (r != null) return { pct: pct(r), source: "recent" };
  return null;
}

/** Stats that come in big chunks (yards) use a normal curve; counts use Poisson. */
export function isYardage(market: string): boolean {
  return /yd|yard/i.test(market);
}

/**
 * In-game prop chance.
 * played: share of the game done, 0–1. value: current stat. line: the prop line.
 * prior: full-game expected amount before the game (defaults to the line).
 */
export function livePropChance(o: {
  value: number;
  line: number;
  side: "Over" | "Under";
  played: number;
  final: boolean;
  market: string;
  prior?: number | null;
}): Chance {
  const need = o.line - o.value; // over needs more than this
  const overHit = o.value > o.line;
  if (overHit) return { pct: o.side === "Over" ? 100 : 0, source: "done" };
  if (o.final) return { pct: o.side === "Over" ? 0 : 100, source: "done" };
  const played = clamp(o.played, 0, 0.995);
  const left = 1 - played;
  const prior = o.prior && o.prior > 0 ? o.prior : o.line;
  const pace = played > 0.02 ? o.value / played : prior;
  const w = clamp(played, 0, 0.75);
  const rate = (1 - w) * prior + w * pace; // full-game rate
  const mu = Math.max(0.01, rate * left);
  let over: number;
  // Integer amounts: to beat x.5 you need ceil(need); to beat a whole line you need need + 1.
  const k = Number.isInteger(need) ? need + 1 : Math.ceil(need);
  if (isYardage(o.market)) {
    // Yardage comes in gains of ~8–12; variance ≈ mean × 10.
    over = 1 - normCdf((need - mu) / Math.sqrt(mu * 10));
  } else if (/pts|point|pra|\+/i.test(o.market)) {
    // Points come in 1s, 2s, and 3s; variance ≈ mean × 2.2.
    over = 1 - normCdf((k - 0.5 - mu) / Math.sqrt(mu * 2.2));
  } else {
    over = poissonAtLeast(k, mu);
  }
  return { pct: pct(o.side === "Over" ? over : 1 - over), source: "pace" };
}

/** Typical full-game spread of the final margin and total, per league. Public rules of thumb. */
const SIGMA: Record<string, { margin: number; total: number }> = {
  nfl: { margin: 13.5, total: 13.5 },
  ncaaf: { margin: 16, total: 16 },
  nba: { margin: 12, total: 18 },
  mlb: { margin: 4.2, total: 4.4 },
  nhl: { margin: 2.4, total: 2.3 },
};

/**
 * Team pick chance in game.
 * side scores are current; spreadHome is the posted home spread (negative = home favored);
 * total is the posted total. played 0–1.
 */
export function liveTeamChance(o: {
  league: string;
  kind: "moneyline" | "spread" | "total";
  pick: "home" | "away" | "over" | "under";
  home: number;
  away: number;
  played: number;
  final: boolean;
  line: number | null;
  homeWin?: number | null;
  spreadHome?: number | null;
  total?: number | null;
}): Chance | null {
  const sig = SIGMA[o.league] ?? SIGMA.nfl;
  const left = 1 - clamp(o.played);
  const margin = o.home - o.away;
  if (o.kind === "moneyline") {
    if (o.final) return { pct: (o.pick === "home" ? margin > 0 : margin < 0) ? 100 : 0, source: "done" };
    if (o.homeWin == null) return null;
    const h = clamp(o.homeWin / 100);
    return { pct: pct(o.pick === "home" ? h : 1 - h), source: "win prob" };
  }
  if (o.line == null) return null;
  if (o.kind === "spread") {
    // Line is from the picked team's view. Picked margin + line > 0 covers.
    const mine = o.pick === "home" ? margin : -margin;
    if (o.final) return { pct: mine + o.line > 0 ? 100 : 0, source: "done" };
    const expHome = (o.spreadHome != null ? -o.spreadHome : 0) * left;
    const expMine = o.pick === "home" ? expHome : -expHome;
    const sd = Math.max(0.5, sig.margin * Math.sqrt(left));
    return { pct: pct(1 - normCdf((-o.line - mine - expMine) / sd)), source: "score + clock" };
  }
  const now = o.home + o.away;
  if (now > o.line) return { pct: o.pick === "over" ? 100 : 0, source: "done" };
  if (o.final) return { pct: o.pick === "over" ? 0 : 100, source: "done" };
  const full = o.total ?? o.line;
  const pace = o.played > 0.05 ? now / o.played : full;
  const w = clamp(o.played, 0, 0.75);
  const mu = ((1 - w) * full + w * pace) * left;
  const sd = Math.max(0.5, sig.total * Math.sqrt(left));
  const over = 1 - normCdf((o.line - now - mu) / sd);
  return { pct: pct(o.pick === "over" ? over : 1 - over), source: "score + clock" };
}

/** Share of the game played, from the period and clock. MLB uses innings (and the half). */
export function playedShare(
  league: string,
  span: { elapsed: number; total: number } | null,
  period: number | null,
  state: "pre" | "in" | "post",
  half?: "top" | "bottom" | null
): number {
  if (state === "pre") return 0;
  if (state === "post") return 1;
  if (league === "mlb") {
    if (!period) return 0;
    const done = period - 1 + (half === "bottom" ? 0.5 : 0) + 0.25;
    return clamp(done / Math.max(9, period));
  }
  if (!span) return 0;
  const reg = league === "nba" ? 48 * 60 : league === "nhl" ? 60 * 60 : 60 * 60;
  return clamp(span.elapsed / Math.max(reg, span.total));
}

/** All legs together. Same-game legs move together, so this is a rough number. */
export function combinedChance(pcts: (number | null)[]): number | null {
  if (!pcts.length || pcts.some((p) => p == null)) return null;
  return pct(pcts.reduce<number>((a, p) => a * ((p as number) / 100), 1));
}

export function chanceTone(p: number | null): "gold" | "green" | "red" | "flat" {
  if (p == null) return "flat";
  if (p >= 99.9) return "gold";
  if (p >= 50) return "green";
  return "red";
}
