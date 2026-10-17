/**
 * A tennis match as a live snapshot, so the hub, My Live and the Log meter a tennis pick like any other.
 * Score = sets won. Each player gets a one-row box with games won, sets won, total games and sets played. Pure.
 */
import type { LiveSnap } from "@/lib/live";
import { pointText, type Match } from "@/lib/sports";

const games = (xs: string[]) => xs.map((x) => parseInt(x, 10)).map((n) => (Number.isFinite(n) ? n : 0));

/** A set counts once it is decided: 6+ with a 2-game lead, or 7-6. */
function setDone(a: number, b: number): boolean {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi >= 6 && hi - lo >= 2) || (hi === 7 && lo === 6);
}

/** One line for a live tennis match: "6-3 5-3 · Tiebreak 5-4 · Jones serving". Points only when ESPN sent them. Pure. */
export function tennisLine(t: NonNullable<LiveSnap["tennis"]>, awayShort: string, homeShort: string): string {
  const n = Math.max(t.away.length, t.home.length);
  const sets = Array.from({ length: n }, (_, i) => `${(t.away[i] ?? "0").replace(/\(\d+\)$/, "")}-${(t.home[i] ?? "0").replace(/\(\d+\)$/, "")}`).join(" ");
  const pt = pointText(t.point, awayShort, homeShort);
  const srv = t.serving === "away" ? `${awayShort} serving` : t.serving === "home" ? `${homeShort} serving` : null;
  return [sets, pt, srv].filter(Boolean).join(" · ");
}

export function tennisSnap(m: Match): LiveSnap {
  const a = games(m.away.sets);
  const h = games(m.home.sets);
  const n = Math.max(a.length, h.length);
  let setsA = 0;
  let setsH = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = h[i] ?? 0;
    if (m.state !== "post" && !setDone(x, y)) continue;
    if (x > y) setsA++;
    else if (y > x) setsH++;
  }
  const gA = a.reduce((s, v) => s + v, 0);
  const gH = h.reduce((s, v) => s + v, 0);
  const total = gA + gH;
  const row = (id: string, name: string, won: number, sets: number) => ({
    id,
    name,
    starter: true,
    played: m.state !== "pre",
    stats: [String(won), String(sets)],
    statMap: { "t:gamesWon": String(won), "t:setsWon": String(sets), "t:totalGames": String(total), "t:totalSets": String(n) },
  });
  const serving = m.away.serving ? "away" : m.home.serving ? "home" : null;
  return {
    state: m.state,
    clock: null,
    detail: m.detail,
    awayAbbr: m.away.short,
    homeAbbr: m.home.short,
    awayName: m.away.name,
    homeName: m.home.name,
    awayScore: m.state === "pre" ? null : String(setsA),
    homeScore: m.state === "pre" ? null : String(setsH),
    awayColor: "#facc15",
    homeColor: "#f472b6",
    awayId: m.away.id,
    homeId: m.home.id,
    provider: m.price?.provider ?? null,
    total: m.price?.total ?? null,
    totalOpen: null,
    spreadDetail: null,
    spreadHome: null,
    spreadOpen: null,
    awayMl: m.price?.awayMl ?? null,
    homeMl: m.price?.homeMl ?? null,
    homeWin: null,
    win: [],
    period: n || null,
    boxes: [
      { abbr: m.away.short, color: "#facc15", columns: ["Games", "Sets"], players: [row(m.away.id, m.away.name, gA, setsA)] },
      { abbr: m.home.short, color: "#f472b6", columns: ["Games", "Sets"], players: [row(m.home.id, m.home.name, gH, setsH)] },
    ],
    plays: [],
    drives: [],
    situation: null,
    start: m.start,
    tennis: { away: m.away.sets, home: m.home.sets, serving, games: total, event: [m.event, m.round].filter(Boolean).join(" · ") || null, point: m.point ?? null },
  };
}
