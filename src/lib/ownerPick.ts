/**
 * Owner daily pick (display name below is the ONE place to rename it).
 * Two slots a day: "vip" (VIP-only) and "free" (everyone). Posted only by owner accounts,
 * built from the real DraftKings number ESPN carries for the game. Graded on the ESPN final.
 */
import type { Game } from "@/lib/slate";

/** Rename the feature here. */
export const DAILY_PICK_NAME = "Bettor's Choice";

export type OwnerSlot = "vip" | "free";
export type OwnerMarket = "spread" | "total" | "ml";
export type OwnerPick = {
  slot: OwnerSlot;
  date: string;
  league: string;
  gameId: string;
  label: string;
  awayAbbr: string;
  homeAbbr: string;
  start: string;
  market: OwnerMarket;
  /** Team abbr for spread/ml, "Over"/"Under" for totals. */
  side: string;
  line: number | null;
  odds: string | null;
  provider: string;
  note: string;
  postedAt: string;
  /** "assistant for owner" when posted via the owner-agent secret path. */
  postedBy?: string;
  result: "hit" | "miss" | "push" | null;
  final: string | null;
};

const num = (s: string | null | undefined) => {
  const n = s == null ? NaN : Number(String(s).replace(/^\+/, ""));
  return Number.isFinite(n) ? n : null;
};

export function isDraftKings(provider: string | null | undefined) {
  return /draft\s*kings/i.test(provider ?? "");
}

/** Build a pick from the game's real DraftKings price. Returns an error string if the number is not there. */
export function buildOwnerPick(g: Game, slot: OwnerSlot, market: OwnerMarket, side: string, note: string, date: string, now = new Date()): OwnerPick | string {
  const p = g.price;
  if (g.state !== "pre") return "That game has started.";
  if (!p || !isDraftKings(p.provider)) return "No DraftKings number for this game yet.";
  const home = side === g.home.abbr, away = side === g.away.abbr;
  let line: number | null = null, odds: string | null = null;
  if (market === "total") {
    if (side !== "Over" && side !== "Under") return "Pick Over or Under.";
    line = p.total; odds = side === "Over" ? p.overJuice : p.underJuice;
    if (line === null) return "No DraftKings total posted.";
  } else {
    if (!home && !away) return "Pick a team in this game.";
    if (market === "spread") {
      line = num(home ? p.homeSpread : p.awaySpread) ?? (p.spreadHome === null ? null : home ? p.spreadHome : -p.spreadHome);
      odds = home ? p.homeSpreadJuice : p.awaySpreadJuice;
      if (line === null) return "No DraftKings spread posted.";
    } else {
      odds = home ? p.homeMl : p.awayMl;
      if (!odds) return "No DraftKings moneyline posted.";
    }
  }
  return {
    slot, date, league: g.league, gameId: g.id, label: `${g.away.abbr} @ ${g.home.abbr}`, awayAbbr: g.away.abbr, homeAbbr: g.home.abbr,
    start: g.start, market, side, line, odds: odds ?? null, provider: "DraftKings", note: note.trim().slice(0, 200), postedAt: now.toISOString(), result: null, final: null,
  };
}

export function gradeOwnerPick(p: Pick<OwnerPick, "market" | "side" | "line" | "homeAbbr">, away: number | null, home: number | null): OwnerPick["result"] {
  if (away === null || home === null || !Number.isFinite(away) || !Number.isFinite(home)) return null;
  if (p.market === "total") {
    const t = away + home;
    if (t === p.line) return "push";
    return (p.side === "Over") === t > (p.line ?? 0) ? "hit" : "miss";
  }
  const margin = p.side === p.homeAbbr ? home - away : away - home;
  const c = margin + (p.market === "spread" ? (p.line ?? 0) : 0);
  if (c === 0) return "push";
  return c > 0 ? "hit" : "miss";
}

export type OwnerRecord = { w: number; l: number; p: number; rate: number | null; streak: string | null };

/** Picks in any order; streak counts from the most recent graded W/L (pushes skipped). */
export function ownerRecord(picks: Pick<OwnerPick, "date" | "result">[]): OwnerRecord {
  const g = picks.filter((x) => x.result).sort((a, b) => b.date.localeCompare(a.date));
  const w = g.filter((x) => x.result === "hit").length, l = g.filter((x) => x.result === "miss").length, p = g.length - w - l;
  const wl = g.filter((x) => x.result !== "push");
  let n = 0;
  while (n < wl.length && wl[n].result === wl[0].result) n++;
  return { w, l, p, rate: w + l ? Math.round((w / (w + l)) * 1000) / 10 : null, streak: n ? `${wl[0].result === "hit" ? "W" : "L"}${n}` : null };
}

export function ownerPickText(p: Pick<OwnerPick, "market" | "side" | "line">): string {
  if (p.market === "ml") return `${p.side} ML`;
  const l = p.line ?? 0;
  return p.market === "total" ? `${p.side} ${l}` : `${p.side} ${l > 0 ? "+" : ""}${l}`;
}
