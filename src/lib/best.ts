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
};

export type LineMove = {
  id: string;
  label: string;
  text: string;
  delta: number;
  href: string;
  provider: string;
};

export type HotTrend = Trend & { delta: number };

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
        href: `/games/${g.league}/${g.id}`,
      };
      if (!best || row.implied > best.implied) best = row;
    }
    if (best) rows.push(best);
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
    const href = `/games/${g.league}/${g.id}`;
    if (price.total !== null && price.totalOpen !== null && price.total !== price.totalOpen) {
      rows.push({
        id: `${g.id}-total`,
        label,
        text: `Total ${price.totalOpen} → ${price.total}`,
        delta: price.total - price.totalOpen,
        href,
        provider: price.provider,
      });
    }
    if (price.spreadHome !== null && price.spreadHomeOpen !== null && price.spreadHome !== price.spreadHomeOpen) {
      rows.push({
        id: `${g.id}-spread`,
        label,
        text: `Spread ${price.spreadHomeOpen} → ${price.spreadHome}`,
        delta: price.spreadHome - price.spreadHomeOpen,
        href,
        provider: price.provider,
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
    rows.push({ ...t, delta: Math.round((t.avg - t.seasonAvg) * 10) / 10 });
  }
  rows.sort((a, b) => b.delta - a.delta);
  return rows.slice(0, 5);
}
