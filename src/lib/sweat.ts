/** Sweat mode: a parlay down to its last live leg (every other leg hit or pushed). Pure. */
import { resolveStat, shortStat } from "@/lib/statAlias";
import type { LegView, SlipView } from "@/lib/myLive";

export type Sweat = { slipKey: string; leg: LegView; hit: number; total: number };

export function sweatOf(slip: SlipView): Sweat | null {
  if (slip.total < 2 || slip.missed > 0) return null;
  const open = slip.legs.filter((l) => l.state !== "hit" && l.state !== "push");
  if (open.length !== 1) return null;
  const leg = open[0];
  if (leg.state !== "alive" && leg.state !== "behind") return null;
  return { slipKey: slip.key, leg, hit: slip.hit, total: slip.total };
}

export function sweats(slips: SlipView[]): Sweat[] {
  return slips.map(sweatOf).filter((s): s is Sweat => !!s);
}

/** Units still needed on an over: "1 more SOG". Null when not an over prop or already there. */
export function needed(line: number | null, value: number | null, over: boolean): number | null {
  if (line == null || value == null || !over) return null;
  const n = Math.floor(line) + 1 - value;
  return n > 0 ? Math.round(n * 10) / 10 : null;
}

/** Heartbeat period: 1.3s far from the line, down to 0.4s at the edge. */
export function beatSeconds(fill: number): number {
  const f = Math.max(0, Math.min(1, fill > 1 ? fill / 100 : fill));
  return Math.round((1.3 - 0.9 * f) * 100) / 100;
}

const ABBR: [RegExp, string][] = [
  [/shots? on goal|\bsog\b|^shots$/i, "SOG"], [/points|\bpts\b/i, "pts"], [/rebounds?/i, "reb"], [/assists?/i, "ast"],
  [/3-?pointers?|threes/i, "3PM"], [/hits?\b/i, "hits"], [/strikeouts?/i, "K"], [/total bases/i, "TB"], [/goals?/i, "goal"],
  [/saves?/i, "saves"], [/receiving yards/i, "rec yds"], [/rushing yards/i, "rush yds"], [/passing yards/i, "pass yds"], [/receptions?/i, "rec"],
];
const BASIC = new Set(["points", "rebounds", "assists", "3-pointers", "hits", "strikeouts", "total bases", "goals", "saves", "receiving yards", "rushing yards", "passing yards", "receptions", "shots on goal"]);
export function statShort(market: string): string {
  // Alias table first: "2-pt att", "Pts+Reb+Ast" and other specific stats keep their own short name, never "pts".
  const r = resolveStat(market, { strict: true });
  if (r && !BASIC.has(r.label)) return shortStat(r.label);
  for (const [re, s] of ABBR) if (re.test(market)) return s;
  return market.toLowerCase();
}
