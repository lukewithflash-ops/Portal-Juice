/** Who is on the field/court/ice now vs bench, and the subs feed. Pure, real ESPN data only. */
import type { LivePlayer, LiveSnap, LineupSub } from "@/lib/live";

export type LineupTeam = {
  abbr: string;
  on: LivePlayer[];
  bench: LivePlayer[];
  /** True when the on list is our best read, not ESPN's own flag or a clean replay. */
  bestRead?: boolean;
  /** Overrides the "On the court" label for this team (baseball: "At bat"). */
  onLabel?: string;
  /** Extra line under the team: who is at the plate, runners, goalie in net. */
  extra?: string | null;
};
export type Lineup = { teams: LineupTeam[]; subs: LineupSub[]; note: string | null; mode: "live" | "starters" | "roster" | "none"; offense?: string | null; defense?: string | null };

/** How many are on at once. */
export const ON_COUNT: Record<string, number> = { nba: 5, wnba: 5, ncaam: 5, ncaaw: 5, nhl: 6, soccer: 11, mlb: 9, nfl: 11, ncaaf: 11 };
const FOUL_OUT: Record<string, number> = { nba: 6, wnba: 6, ncaam: 5, ncaaw: 5 };

const HOOPS = new Set(["nba", "wnba", "ncaam", "ncaaw"]);
const FOOTBALL = new Set(["nfl", "ncaaf"]);

/** "Jalen Brunson enters the game for Josh Hart" → { in, out }. */
export function parseHoopsSub(text: string): { inName: string; outName: string } | null {
  const m = text.trim().match(/^(.+?) enters the game for (.+?)\.?$/i);
  return m ? { inName: m[1].trim(), outName: m[2].trim() } : null;
}

const same = (a: string, b: string) => {
  const x = a.toLowerCase().replace(/[^a-z ]/g, "").trim();
  const y = b.toLowerCase().replace(/[^a-z ]/g, "").trim();
  return x === y || (x.length > 3 && y.length > 3 && (x.endsWith(" " + y.split(" ").pop()) && x[0] === y[0]));
};

const norm = (n: string) => n.toLowerCase().replace(/[^a-z ]/g, "").trim();
/** Exact name first (Jalen vs Jaylin Williams), then the initial + last name fallback. */
function findPlayer(players: LivePlayer[], name: string): LivePlayer | undefined {
  return players.find((x) => norm(x.name) === norm(name)) ?? players.find((x) => same(x.name, name));
}

export function lineupOf(league: string, snap: LiveSnap | null, soccer: boolean): Lineup {
  if (!snap) return { teams: [], subs: [], note: null, mode: "none" };
  if (soccer) {
    const teams = snap.boxes.map((b): LineupTeam => {
      const on = b.players.filter((p) => p.onField);
      // Never more than 11. If ESPN's sub flags overcount, keep the starters who weren't subbed and say it's a best read.
      if (on.length <= 11) return { abbr: b.abbr, on, bench: b.players.filter((p) => !p.onField) };
      const keep = [...on.filter((p) => !p.starter), ...on.filter((p) => p.starter)].slice(0, 11);
      return { abbr: b.abbr, on: keep, bench: b.players.filter((p) => !keep.includes(p)), bestRead: true };
    });
    return { teams, subs: snap.subs ?? [], note: snap.state === "pre" ? "Expected starters from ESPN." : null, mode: teams.some((t) => t.on.length) ? (snap.state === "pre" ? "starters" : "live") : "none" };
  }
  if (HOOPS.has(league)) return hoopsLineup(league, snap);
  if (league === "mlb") return mlbLineup(snap);
  if (league === "nhl") return nhlLineup(snap);
  if (FOOTBALL.has(league)) {
    const tid = snap.situation?.teamId ?? null;
    const offense = tid ? (tid === snap.homeId ? snap.homeAbbr : tid === snap.awayId ? snap.awayAbbr : null) : null;
    const defense = offense ? (offense === snap.homeAbbr ? snap.awayAbbr : snap.homeAbbr) : null;
    const teams = snap.boxes.map((b) => ({ abbr: b.abbr, on: [], bench: b.players.filter((p) => p.played) }));
    return { teams, subs: [], note: "ESPN doesn't post live personnel. Shows who has the ball and who has played.", mode: "roster", offense, defense };
  }
  const teams = snap.boxes.map((b) => ({ abbr: b.abbr, on: [], bench: b.players.filter((p) => p.played) }));
  return { teams, subs: [], note: "ESPN doesn't post live lines for this sport. Shows who has played.", mode: teams.some((t) => t.bench.length) ? "roster" : "none" };
}

/** New subs between two snapshots (soccer key events or basketball sub plays). */
export function freshSubs(league: string, prev: LiveSnap, next: LiveSnap): LineupSub[] {
  if (next.subs?.length) {
    const seen = new Set((prev.subs ?? []).map((s) => s.text));
    return next.subs.filter((s) => !seen.has(s.text));
  }
  if (!HOOPS.has(league)) return [];
  const seen = new Set(prev.plays.map((p) => p.id));
  return next.plays
    .filter((p) => !seen.has(p.id))
    .map((p) => ({ p, s: parseHoopsSub(p.text) }))
    .filter((x) => x.s)
    .map(({ p, s }) => ({ clock: p.clock, teamAbbr: "", inName: s!.inName, outName: s!.outName, text: p.text }));
}

type SubEvent = { inName: string | null; outName: string | null; out?: boolean; text: string; period: number | null; clock: string };

function hoopsEvents(snap: LiveSnap): SubEvent[] {
  const src = snap.subLog ?? snap.plays.map((p) => ({ text: p.text, period: Number(p.period.match(/\d+/)?.[0]) || null, clock: p.clock, type: p.typeText }));
  const out: SubEvent[] = [];
  for (const r of src) {
    const s = parseHoopsSub(r.text);
    if (s) out.push({ ...s, text: r.text, period: r.period, clock: r.clock });
    else {
      const m = r.text.match(/^(.+?)\s+(?:ejected|is ejected|fouls out|has fouled out|disqualified)/i) ?? r.text.match(/ejection[^A-Za-z]*(?:on\s+)?(.+?)\.?$/i);
      if (m) out.push({ inName: null, outName: m[1].trim(), out: true, text: r.text, period: r.period, clock: r.clock });
    }
  }
  return out;
}

const periodLabel = (league: string, n: number | null) => {
  if (!n) return "";
  const regs = league === "ncaam" ? 2 : 4;
  return n > regs ? (n - regs > 1 ? `OT${n - regs}` : "OT") : league === "ncaam" ? `H${n}` : `Q${n}`;
};

/**
 * Basketball: who is on the floor right now, never more than five.
 * 1) ESPN's boxscore "active" flag (it is the on-court flag) when it marks exactly five.
 * 2) Otherwise starters + every substitution this game, in order, minus ejections and foul-outs.
 * 3) Still not five: the five most recently checked in, labeled a best read.
 */
export function hoopsLineup(league: string, snap: LiveSnap): Lineup {
  const cap = 5;
  const events = hoopsEvents(snap);
  const subs: LineupSub[] = [];
  const last = new Map<string, number>();
  const sets = new Map<string, Set<string>>();
  for (const b of snap.boxes) sets.set(b.abbr, new Set(b.players.filter((p) => p.starter).map((p) => p.id)));
  events.forEach((e, i) => {
    for (const b of snap.boxes) {
      const pin = e.inName ? findPlayer(b.players, e.inName) : undefined;
      const pout = e.outName ? findPlayer(b.players, e.outName) : undefined;
      if (!pin && !pout) continue;
      const set = sets.get(b.abbr)!;
      if (pout) set.delete(pout.id);
      if (pin) {
        set.add(pin.id);
        last.set(pin.id, i);
      }
      if (!e.out) subs.push({ clock: [periodLabel(league, e.period), e.clock].filter(Boolean).join(" "), teamAbbr: b.abbr, inName: pin?.name ?? e.inName, outName: pout?.name ?? e.outName, text: e.text });
      break;
    }
  });
  const foulLimit = FOUL_OUT[league] ?? 6;
  const gone = (p: LivePlayer) => p.ejected === true || Number(p.statMap.PF ?? p.statMap.fouls ?? 0) >= foulLimit;
  let anyBest = false;
  let usedFlag = false;
  const teams = snap.boxes.map((b): LineupTeam => {
    const flagged = b.players.filter((p) => p.active === true && !gone(p));
    if (snap.state !== "pre" && flagged.length === cap) {
      usedFlag = true;
      return { abbr: b.abbr, on: flagged, bench: b.players.filter((p) => !flagged.includes(p)) };
    }
    const set = sets.get(b.abbr)!;
    let on = b.players.filter((p) => set.has(p.id) && !gone(p));
    let bestRead = false;
    if (snap.state !== "pre" && on.length !== cap) {
      bestRead = true;
      // Most recent check-ins are the confident ones; starters who never sat come last.
      on = on.sort((x, y) => (last.get(y.id) ?? -1) - (last.get(x.id) ?? -1)).slice(0, cap);
    }
    if (on.length > cap) on = on.slice(0, cap);
    anyBest ||= bestRead;
    return { abbr: b.abbr, on, bench: b.players.filter((p) => !on.includes(p)), bestRead };
  });
  const note =
    snap.state === "pre"
      ? "Expected starters from ESPN."
      : anyBest
        ? "Best read from starters plus ESPN's sub log; ESPN doesn't log every change between periods."
        : usedFlag
          ? snap.state === "post" ? "The five on the floor at the final horn, from ESPN." : "From ESPN's on-court flag, checked against the sub log."
          : "From starters plus every sub ESPN logged this game.";
  return { teams, subs, note, mode: teams.some((t) => t.on.length) ? (snap.state === "pre" ? "starters" : "live") : "none" };
}

const BENCH_POS = new Set(["DH", "PH", "PR"]);

/** Baseball: the nine in the field for the defense, the lineup and plate/bases for the offense. */
export function mlbLineup(snap: LiveSnap): Lineup {
  const half = snap.bug?.half ?? null;
  const [away, home] = [snap.boxes.find((b) => b.abbr === snap.awayAbbr) ?? snap.boxes[0], snap.boxes.find((b) => b.abbr === snap.homeAbbr) ?? snap.boxes[1]];
  const fielding = snap.state === "in" && half ? (half === "top" ? home : away) : null;
  const hasFlags = snap.boxes.some((b) => b.players.some((p) => typeof p.active === "boolean"));
  if (!hasFlags || snap.state === "pre") {
    const teams = snap.boxes.map((b) => ({ abbr: b.abbr, on: [], bench: b.players.filter((p) => p.played) }));
    return { teams, subs: [], note: "Lineups show once ESPN posts them.", mode: teams.some((t) => t.bench.length) ? "roster" : "none" };
  }
  const names = new Map(snap.boxes.flatMap((b) => b.players.map((p) => [p.id, p.name] as const)));
  const teams = snap.boxes.map((b): LineupTeam => {
    const pitcherNow = b.players.find((p) => p.pitchingNow);
    if (b === fielding) {
      let on = b.players.filter((p) => p.inLineup && p.pos !== "P" && !BENCH_POS.has(p.pos ?? ""));
      if (pitcherNow && !on.includes(pitcherNow)) on = [pitcherNow, ...on];
      const bestRead = on.length !== 9;
      on = on.slice(0, 9);
      return { abbr: b.abbr, on, bench: b.players.filter((p) => !on.includes(p) && p.played), bestRead, onLabel: "In the field" };
    }
    const batting = b.players.filter((p) => p.inLineup).slice(0, 9);
    const bug = snap.bug;
    const atPlate = bug?.batterId ? names.get(bug.batterId) : null;
    const runners = (bug?.runnerIds ?? []).map((id) => names.get(id)).filter(Boolean);
    const bases = bug ? [bug.onFirst && "1st", bug.onSecond && "2nd", bug.onThird && "3rd"].filter(Boolean).join(", ") : "";
    const extra = b !== fielding && fielding
      ? [atPlate ? `At the plate: ${atPlate}` : null, runners.length ? `On base: ${runners.join(", ")}` : bases ? `On base: ${bases}` : "Bases empty"].filter(Boolean).join(" · ")
      : null;
    return { abbr: b.abbr, on: batting, bench: b.players.filter((p) => !batting.includes(p) && p.played), onLabel: fielding ? "Batting order" : "Lineup now", extra };
  });
  return {
    teams,
    subs: [],
    note: fielding ? "From ESPN's lineup flags: current pitcher plus the eight in the field (DH and pinch hitters aren't in the field)." : snap.state === "post" ? "Final lineups from ESPN." : "From ESPN's lineup flags.",
    mode: "live",
  };
}

/** Hockey: ESPN doesn't post line changes, so no on-ice six. Show who has played, and the goalie in net when only one has. */
export function nhlLineup(snap: LiveSnap): Lineup {
  const teams = snap.boxes.map((b): LineupTeam => {
    const goalies = b.players.filter((p) => p.played && (p.pos === "G" || "saves" in p.statMap || "SV" in p.statMap));
    const pulled = snap.state === "in" && snap.plays.slice(-6).some((p) => /goalie (pulled|removed)|empty net/i.test(p.text));
    const extra = goalies.length === 1 ? `In net: ${goalies[0].name}${pulled ? " (may be pulled for an extra skater)" : ""}` : goalies.length > 1 ? `Goalies used: ${goalies.map((g) => g.name).join(", ")}` : null;
    return { abbr: b.abbr, on: [], bench: b.players.filter((p) => p.played), extra };
  });
  return { teams, subs: [], note: "ESPN doesn't post NHL line changes, so there's no live on-ice list (normally 6: 5 skaters + a goalie, fewer on penalties or a pulled goalie).", mode: teams.some((t) => t.bench.length) ? "roster" : "none" };
}
