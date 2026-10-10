/** Who is on the field/court/ice now vs bench, and the subs feed. Pure, real ESPN data only. */
import type { LivePlayer, LiveSnap, LineupSub } from "@/lib/live";

export type LineupTeam = { abbr: string; on: LivePlayer[]; bench: LivePlayer[] };
export type Lineup = { teams: LineupTeam[]; subs: LineupSub[]; note: string | null; mode: "live" | "starters" | "roster" | "none"; offense?: string | null; defense?: string | null };

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

export function lineupOf(league: string, snap: LiveSnap | null, soccer: boolean): Lineup {
  if (!snap) return { teams: [], subs: [], note: null, mode: "none" };
  if (soccer) {
    const teams = snap.boxes.map((b) => ({ abbr: b.abbr, on: b.players.filter((p) => p.onField), bench: b.players.filter((p) => !p.onField) }));
    return { teams, subs: snap.subs ?? [], note: snap.state === "pre" ? "Expected starters from ESPN." : null, mode: teams.some((t) => t.on.length) ? (snap.state === "pre" ? "starters" : "live") : "none" };
  }
  if (HOOPS.has(league)) {
    const on = new Map<string, Set<string>>();
    for (const b of snap.boxes) on.set(b.abbr, new Set(b.players.filter((p) => p.starter).map((p) => p.id)));
    const subs: LineupSub[] = [];
    for (const p of snap.plays) {
      const s = parseHoopsSub(p.text);
      if (!s) continue;
      for (const b of snap.boxes) {
        const pin = b.players.find((x) => same(x.name, s.inName));
        const pout = b.players.find((x) => same(x.name, s.outName));
        if (!pin && !pout) continue;
        const set = on.get(b.abbr)!;
        if (pout) set.delete(pout.id);
        if (pin) set.add(pin.id);
        subs.push({ clock: [p.period ? `Q${p.period}`.replace(/^Q(\d{2,})/, "OT") : "", p.clock].filter(Boolean).join(" "), teamAbbr: b.abbr, inName: pin?.name ?? s.inName, outName: pout?.name ?? s.outName, text: p.text });
        break;
      }
    }
    const teams = snap.boxes.map((b) => {
      const set = on.get(b.abbr)!;
      return { abbr: b.abbr, on: b.players.filter((p) => set.has(p.id)), bench: b.players.filter((p) => !set.has(p.id)) };
    });
    return {
      teams,
      subs,
      note: snap.state === "in" ? "From starters plus ESPN's sub log. Between-period changes ESPN doesn't log can lag." : snap.state === "pre" ? null : "Final five on the floor.",
      mode: teams.some((t) => t.on.length) ? "live" : "none",
    };
  }
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
