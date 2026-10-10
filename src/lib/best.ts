import { gameRoute } from "@/lib/gameRoute";
/** Rankings from numbers we already have. Not a recommendation. */

import { americanNumber, impliedChance } from "@/lib/detail";
import type { Game, Trend } from "@/lib/slate";

export type Favorite = {
  id: string;
  label: string;
  side: string;
  odds: string;
  implied: number;
  provider: string;
  href: string;
  /** One plain sentence built only from the fields above plus any posted open-to-now move. */
  homework: string;
};

export type LineMove = {
  id: string;
  label: string;
  text: string;
  delta: number;
  href: string;
  provider: string;
  homework: string;
  /** Color for the printed side. Totals have no side: always flat. Spread rows print the home side. */
  tone: "plus" | "minus" | "flat";
};

export type HotTrend = Trend & { delta: number; homework: string };

export function pct(implied: number): string {
  return `${Math.round(implied * 100)}%`;
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

/** "total moved 48.5 → 49.5 since open" or null when either end is missing or they match. */
export function moveClause(g: Game): string | null {
  const p = g.price;
  if (!p) return null;
  if (p.total !== null && p.totalOpen !== null && p.total !== p.totalOpen) {
    return `total moved ${fmtNum(p.totalOpen)} → ${fmtNum(p.total)} since open`;
  }
  if (p.spreadHome !== null && p.spreadHomeOpen !== null && p.spreadHome !== p.spreadHomeOpen) {
    return `${g.home.abbr} spread moved ${fmtNum(p.spreadHomeOpen)} → ${fmtNum(p.spreadHome)} since open`;
  }
  return null;
}

export function marketFavorites(games: Game[]): Favorite[] {
  const rows: Favorite[] = [];
  for (const g of games) {
    const price = g.price;
    if (!price) continue;
    const sides = [
      { side: g.away.abbr, odds: price.awayMl },
      { side: g.home.abbr, odds: price.homeMl },
    ];
    let best: Favorite | null = null;
    for (const s of sides) {
      const n = americanNumber(s.odds);
      if (n === null || !s.odds) continue;
      const implied = impliedChance(n);
      const row: Favorite = {
        id: `${g.id}-${s.side}`,
        label: `${g.away.abbr} @ ${g.home.abbr}`,
        side: s.side,
        odds: s.odds,
        implied,
        provider: price.provider,
        href: gameRoute(g.league, g.id),
        homework: "",
      };
      if (!best || row.implied > best.implied) best = row;
    }
    if (best) {
      const move = moveClause(g);
      best.homework = `${best.side} ${pct(best.implied)} implied at ${best.odds} (${price.provider})${move ? `, ${move}` : ""}.`;
      rows.push(best);
    }
  }
  rows.sort((a, b) => b.implied - a.implied);
  return rows.slice(0, 5);
}

export function biggestMoves(games: Game[]): LineMove[] {
  const rows: LineMove[] = [];
  for (const g of games) {
    const price = g.price;
    if (!price) continue;
    const label = `${g.away.abbr} @ ${g.home.abbr}`;
    const href = gameRoute(g.league, g.id);
    if (price.total !== null && price.totalOpen !== null && price.total !== price.totalOpen) {
      rows.push({
        id: `${g.id}-total`,
        label,
        text: `Total ${price.totalOpen} → ${price.total}`,
        delta: price.total - price.totalOpen,
        tone: "flat",
        href,
        provider: price.provider,
        homework: `Total moved ${fmtNum(price.totalOpen)} → ${fmtNum(price.total)} since open, ${price.total > price.totalOpen ? "up" : "down"} ${fmtNum(Math.abs(price.total - price.totalOpen))} (${price.provider}).`,
      });
    }
    if (price.spreadHome !== null && price.spreadHomeOpen !== null && price.spreadHome !== price.spreadHomeOpen) {
      rows.push({
        id: `${g.id}-spread`,
        label,
        text: `Spread ${price.spreadHomeOpen} → ${price.spreadHome}`,
        delta: price.spreadHome - price.spreadHomeOpen,
        // Home spread up (−3 → −2.5) is a better number for the home side.
        tone: price.spreadHome > price.spreadHomeOpen ? "plus" : "minus",
        href,
        provider: price.provider,
        homework: `${g.home.abbr} spread moved ${fmtNum(price.spreadHomeOpen)} → ${fmtNum(price.spreadHome)} since open, ${fmtNum(Math.abs(price.spreadHome - price.spreadHomeOpen))} points (${price.provider}).`,
      });
    }
  }
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return rows.slice(0, 5);
}

/** Last-5 minus the season average from the same log. Only when the season is longer. */
export function hotTrends(trends: Trend[]): HotTrend[] {
  const rows: HotTrend[] = [];
  for (const t of trends) {
    if (t.seasonAvg === null || t.seasonGames === null || t.seasonGames <= t.games) continue;
    if (!Number.isFinite(t.avg) || t.games < 1) continue;
    const delta = Math.round((t.avg - t.seasonAvg) * 10) / 10;
    if (delta <= 0) continue;
    rows.push({
      ...t,
      delta,
      homework: `${fmtNum(t.avg)} ${t.statLabel} over the last ${t.games} vs ${fmtNum(t.seasonAvg)} across ${t.seasonGames} logged games (+${fmtNum(delta)}).`,
    });
  }
  rows.sort((a, b) => b.delta - a.delta);
  return rows.slice(0, 5);
}

/** MVP sentence from the posted price and ESPN's stat line. Null when the price is unusable. */
export function mvpHomework(row: { implied: number; odds: string; stats: string }, provider: string): string | null {
  if (!Number.isFinite(row.implied) || row.implied <= 0 || !row.odds) return null;
  const stats = row.stats?.trim();
  return `${pct(row.implied)} implied at ${row.odds} (${provider})${stats ? `. Season: ${stats}` : ""}.`;
}
