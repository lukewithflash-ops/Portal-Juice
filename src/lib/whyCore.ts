/**
 * "Why" panel + pick factors: pure functions over real feeds only.
 * Injuries = ESPN game summary. Splits = DraftKings Network public betting splits. Trends = ESPN finals with
 * DraftKings closing lines (VIP Data). Similar spots = Portal's own graded picks. Nothing here estimates a number.
 */
import type { LegInput } from "@/lib/breakdown";
import { sideTeam, type DkSplitEvent, type DkSplitRow, type TeamGame, type TeamSummary } from "@/lib/teamDataCore";

export type InjuryIn = { team: string; name: string; status: string };
export type WhyInjury = InjuryIn & { level: "out" | "doubtful" | "questionable" | "other"; key: boolean };

export function injuryLevel(status: string): WhyInjury["level"] {
  const s = status.toLowerCase();
  if (/^out|injured reserve|^ir\b|suspend|season/.test(s)) return "out";
  if (/doubt/.test(s)) return "doubtful";
  if (/question|day-to-day|game-time|probable/.test(s)) return "questionable";
  return "other";
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** Key = the player is one of ESPN's listed team leaders for this game. */
export function whyInjuries(inj: InjuryIn[], leaders: { team: string; name: string }[]): WhyInjury[] {
  const lead = new Set(leaders.map((l) => `${l.team}:${norm(l.name)}`));
  const rank = { out: 0, doubtful: 1, questionable: 2, other: 3 };
  return inj
    .map((i) => ({ ...i, level: injuryLevel(i.status), key: lead.has(`${i.team}:${norm(i.name)}`) }))
    .filter((i) => i.level !== "other")
    .sort((a, b) => Number(b.key) - Number(a.key) || rank[a.level] - rank[b.level]);
}

/** Match a DK Network splits event to an ESPN game by abbreviation, then by nickname. */
export function findSplits(events: DkSplitEvent[], g: { homeAbbr: string; awayAbbr: string; homeName: string; awayName: string }): DkSplitEvent | null {
  const nick = (s: string) => s.trim().split(/\s+/).pop()!.toLowerCase();
  return (
    events.find((e) => e.homeAbbr === g.homeAbbr && e.awayAbbr === g.awayAbbr) ??
    events.find((e) => nick(e.home) === nick(g.homeName) && nick(e.away) === nick(g.awayName)) ??
    null
  );
}

export type MarketKind = "spread" | "total" | "moneyline";
export const marketKind = (name: string): MarketKind | null =>
  /total/i.test(name) ? "total" : /spread|puck|run line/i.test(name) ? "spread" : /money/i.test(name) ? "moneyline" : null;

/** The split row for one leg's side, or null. */
export function splitRow(ev: DkSplitEvent | null, leg: Pick<LegInput, "kind" | "side" | "pick">): DkSplitRow | null {
  if (!ev || leg.kind === "prop") return null;
  const m = ev.markets.find((x) => marketKind(x.name) === leg.kind);
  if (!m || m.rows.length !== 2 || m.rows.some((r) => r.bets >= 100 || r.handle >= 100)) return null;
  if (leg.kind === "total") return m.rows.find((r) => (leg.pick === "under" ? /^under/i : /^over/i).test(r.side)) ?? null;
  return m.rows.find((r) => sideTeam(r.side, ev) === leg.side) ?? null;
}

export type Move = { spreadHome: number | null; spreadHomeOpen: number | null; total: number | null; totalOpen: number | null };

/** Points the line moved toward the leg's side since open (+ = toward, - = against). Null when not posted. */
export function moveToward(leg: Pick<LegInput, "kind" | "side" | "pick">, m: Move | null): number | null {
  if (!m) return null;
  if (leg.kind === "total") {
    if (m.total == null || m.totalOpen == null) return null;
    const d = m.total - m.totalOpen;
    return leg.pick === "under" ? -d : d;
  }
  if (leg.kind === "spread" || leg.kind === "moneyline") {
    if (m.spreadHome == null || m.spreadHomeOpen == null) return null;
    const d = m.spreadHome - m.spreadHomeOpen; // negative = home got stronger
    return leg.side === "home" ? -d : d;
  }
  return null;
}

export type FactorCtx = { injuries: WhyInjury[]; move: Move | null; splits: DkSplitEvent | null; home: string; away: string };
export type Factors = { skip: string | null; pros: string[]; cons: string[] };

const n1 = (n: number) => String(Math.round(n * 10) / 10);

/** Injuries, line move and money splits as pick factors. Strict: any hard flag skips the pick. */
export function factorCheck(leg: LegInput, ctx: FactorCtx | null | undefined): Factors {
  const f: Factors = { skip: null, pros: [], cons: [] };
  if (!ctx) return f;
  const team = leg.side === "home" ? ctx.home : leg.side === "away" ? ctx.away : null;
  const opp = leg.side === "home" ? ctx.away : leg.side === "away" ? ctx.home : null;
  if (leg.kind === "prop") {
    const me = ctx.injuries.find((i) => leg.athleteName && norm(i.name) === norm(leg.athleteName));
    if (me) f.skip = `${me.name} is listed ${me.status} (ESPN)`;
  } else {
    const keyOut = (t: string | null) => ctx.injuries.filter((i) => i.team === t && i.key && (i.level === "out" || i.level === "doubtful"));
    if (team) {
      const mine = keyOut(team);
      if (mine.length) f.skip = `${team} key player ${mine[0].name} listed ${mine[0].status} (ESPN)`;
      const theirs = keyOut(opp);
      if (theirs.length) f.pros.push(`${opp} key player ${theirs[0].name} listed ${theirs[0].status} (ESPN)`);
      const q = ctx.injuries.filter((i) => i.team === team && i.key && i.level === "questionable");
      if (q.length) f.cons.push(`${team} key player ${q[0].name} listed ${q[0].status} (ESPN)`);
    } else if (leg.kind === "total") {
      const out = ctx.injuries.filter((i) => i.key && (i.level === "out" || i.level === "doubtful"));
      if (out.length && leg.pick === "over") f.cons.push(`Key players out: ${out.slice(0, 2).map((i) => `${i.name} (${i.team})`).join(", ")} (ESPN)`);
    }
  }
  const mv = moveToward(leg, ctx.move);
  if (mv != null && mv <= -1.5 && !f.skip) f.skip = `Line moved ${n1(-mv)} pts against this side since open`;
  else if (mv != null && mv >= 1) f.pros.push(`Line moved ${n1(mv)} pts toward this side since open`);
  const row = splitRow(ctx.splits, leg);
  if (row) {
    if (mv != null && row.handle >= 65 && mv <= -0.5 && !f.skip) f.skip = `Reverse line move against: ${row.handle}% of DK money on this side, line moved away`;
    else if (mv != null && row.handle <= 35 && mv >= 0.5) f.pros.push(`Reverse line move: only ${row.handle}% of DK money here, line still moved toward this side`);
    if (row.handle - row.bets >= 15) f.pros.push(`DK money ${row.handle}% vs bets ${row.bets}% on this side (bigger tickets here)`);
    if (row.bets >= 75) f.cons.push(`Public side: ${row.bets}% of DK bets`);
  }
  return f;
}

/* ---------- Trends from VIP Data team summaries ---------- */

export type Trend = { team: string; last5: string; last10: string; ats10: string; ou10: string; venue: string | null; rest: string | null; sample: number };

const wl = (gs: TeamGame[]) => {
  const w = gs.filter((g) => g.pf > g.pa).length;
  const l = gs.filter((g) => g.pf < g.pa).length;
  const t = gs.length - w - l;
  return `${w}-${l}${t ? `-${t}` : ""}`;
};
const ats = (gs: TeamGame[]) => {
  let c = 0, m = 0, p = 0;
  for (const g of gs) {
    if (g.sp == null) continue;
    const d = g.pf - g.pa + g.sp;
    if (d > 0) c++; else if (d < 0) m++; else p++;
  }
  return c + m + p ? `${c}-${m}${p ? `-${p}` : ""}` : "—";
};
const ou = (gs: TeamGame[]) => {
  let o = 0, u = 0, p = 0;
  for (const g of gs) {
    if (g.tot == null) continue;
    const d = g.pf + g.pa - g.tot;
    if (d > 0) o++; else if (d < 0) u++; else p++;
  }
  return o + u + p ? `${o}-${u}${p ? `-${p}` : ""}` : "—";
};

/** `recent` is newest first (TeamSummary.recent). */
export function trendOf(s: TeamSummary, home: boolean, restDays: number | null): Trend {
  const r = s.recent.slice(0, 10);
  const v = s.splits.find((x) => x.key === `Venue:${home ? "Home" : "Away"}`);
  return {
    team: s.team,
    last5: wl(r.slice(0, 5)),
    last10: wl(r),
    ats10: ats(r),
    ou10: ou(r),
    venue: v ? `${v.r.w}-${v.r.l}${v.r.t ? `-${v.r.t}` : ""} ${home ? "home" : "away"}` : null,
    rest: restDays == null ? null : restDays <= 1 ? "Back-to-back" : `${restDays} days rest`,
    sample: r.length,
  };
}

/* ---------- Portal's record in similar spots ---------- */

export type SimPick = {
  league: string;
  kind: "spread" | "total" | "moneyline" | "prop";
  /** Team the pick backed (sides only). */
  team: string | null;
  home: string;
  away: string;
  /** Backed the home team (sides only). */
  atHome: boolean | null;
  /** Favorite = negative spread / negative ML price. */
  fav: boolean | null;
  /** abs(spread) for spread picks. */
  num: number | null;
  result: "W" | "L" | "P";
};

export type SimRow = { label: string; w: number; l: number; p: number; n: number; note: string };

export const bandOf = (x: number) => (x < 3 ? "<3" : x < 7 ? "3–6.5" : x < 10 ? "7–9.5" : "10+");

export function sampleNote(n: number): string {
  return n === 0 ? "No graded picks yet" : n < 10 ? "Small sample" : n < 30 ? "Building sample" : "";
}

function row(label: string, ps: SimPick[]): SimRow {
  const w = ps.filter((p) => p.result === "W").length;
  const l = ps.filter((p) => p.result === "L").length;
  const p = ps.length - w - l;
  return { label, w, l, p, n: ps.length, note: sampleNote(w + l) };
}

/** Graded Portal picks in spots like this game's: same teams, same home/road + fav/dog spread spot and band, same market. */
export function similarRecord(all: SimPick[], g: { league: string; home: string; away: string; spreadHome: number | null; lg: string }): SimRow[] {
  const ps = all.filter((p) => p.league === g.league);
  const out: SimRow[] = [];
  for (const t of [g.away, g.home]) out.push(row(`Games with ${t}`, ps.filter((p) => p.home === t || p.away === t)));
  if (g.spreadHome != null && g.spreadHome !== 0) {
    const b = bandOf(Math.abs(g.spreadHome));
    const homeFav = g.spreadHome < 0;
    const spot = (atHome: boolean, fav: boolean) => `${atHome ? "Home" : "Road"} ${fav ? "fav" : "dog"} ${fav ? "-" : "+"}${b} spread`;
    const sp = ps.filter((p) => p.kind === "spread" && p.num != null && bandOf(p.num) === b);
    out.push(row(spot(true, homeFav), sp.filter((p) => p.atHome === true && p.fav === homeFav)));
    out.push(row(spot(false, !homeFav), sp.filter((p) => p.atHome === false && p.fav === !homeFav)));
  }
  out.push(row(`${g.lg} totals`, ps.filter((p) => p.kind === "total")));
  out.push(row(`All ${g.lg} Portal picks`, ps));
  return out;
}
