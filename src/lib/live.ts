/** Slim live snapshot parsed from an ESPN summary. No network. */

import { parseOddsMove } from "@/lib/detail";

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => (v && typeof v === "object" ? (v as Dict) : {});
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export type LivePlayer = {
  id: string;
  name: string;
  starter: boolean;
  played: boolean;
  stats: string[];
  /** Stable ESPN stat name or label → cell. Used to match a prop. */
  statMap: Record<string, string>;
};

export type LiveBox = {
  abbr: string;
  color: string;
  columns: string[];
  players: LivePlayer[];
};

export type LivePlay = {
  id: string;
  text: string;
  clock: string;
  period: string;
  scoring: boolean;
  points: number;
  awayScore: number | null;
  homeScore: number | null;
  teamId: string | null;
  x: number | null;
  y: number | null;
  down: number | null;
  distance: number | null;
  yardsToEndzone: number | null;
  spot: string | null;
  typeText: string;
};

export type LiveSnap = {
  state: "pre" | "in" | "post";
  clock: string | null;
  detail: string;
  awayAbbr: string;
  homeAbbr: string;
  awayScore: string | null;
  homeScore: string | null;
  awayColor: string;
  homeColor: string;
  awayId: string;
  homeId: string;
  provider: string | null;
  total: number | null;
  totalOpen: number | null;
  spreadDetail: string | null;
  spreadHome: number | null;
  spreadOpen: number | null;
  awayMl: string | null;
  homeMl: string | null;
  homeWin: number | null;
  /** Home win chance, 0–100, in play order. Only points ESPN sent. */
  win: number[];
  period: number | null;
  boxes: LiveBox[];
  plays: LivePlay[];
};

function colorOf(raw: unknown): string {
  const s = typeof raw === "string" ? raw.replace("#", "") : "";
  return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s}` : "#7c3aed";
}

function onCourt(v: unknown): number | null {
  const n = num(v);
  if (n === null || n < -120 || n > 120) return null;
  return n;
}

export function parseLive(data: unknown): LiveSnap | null {
  const d = asDict(data);
  const header = asDict(d.header);
  const comp = asDict(asList(header.competitions)[0]);
  const sides = asList(comp.competitors).map(asDict);
  const home = sides.find((s) => s.homeAway === "home");
  const away = sides.find((s) => s.homeAway === "away");
  if (!home || !away) return null;
  const homeTeam = asDict(home.team);
  const awayTeam = asDict(away.team);
  const status = asDict(asDict(comp.status).type);
  const stateRaw = str(status.state);
  const state: LiveSnap["state"] = stateRaw === "in" || stateRaw === "post" ? stateRaw : "pre";
  const move = parseOddsMove(asList(d.pickcenter)[0] ?? asList(d.odds)[0]);

  const boxes: LiveBox[] = [];
  for (const raw of asList(asDict(d.boxscore).players)) {
    const block = asDict(raw);
    const team = asDict(block.team);
    const groups = asList(block.statistics).map(asDict);
    const group = groups[0] ?? {};
    const columns = asList(group.labels).map((x) => str(x) || "").filter(Boolean);
    const names = asList(group.names).map((x) => str(x) || "");
    const headers = columns.length ? columns : names;
    const players: LivePlayer[] = [];
    for (const aRaw of asList(group.athletes)) {
      const a = asDict(aRaw);
      const athlete = asDict(a.athlete);
      const name = str(athlete.displayName) || str(athlete.shortName);
      const id = str(athlete.id);
      if (!name || !id) continue;
      const stats = asList(a.stats).map((x) => (typeof x === "string" ? x : x == null ? "" : String(x)));
      const statMap: Record<string, string> = {};
      for (const g of groups) {
        const gNames = asList(g.names).map((x) => str(x) || "");
        const gLabels = asList(g.labels).map((x) => str(x) || "");
        const row = asList(g.athletes).map(asDict).find((row) => str(asDict(row.athlete).id) === id);
        const cells = asList(row?.stats).map((x) => (typeof x === "string" ? x : x == null ? "" : String(x)));
        gNames.forEach((key, i) => {
          if (key && cells[i] != null && cells[i] !== "") statMap[key] = cells[i];
        });
        gLabels.forEach((key, i) => {
          if (key && cells[i] != null && cells[i] !== "" && statMap[key] == null) statMap[key] = cells[i];
        });
      }
      players.push({
        id,
        name,
        starter: a.starter === true,
        played: a.didNotPlay !== true,
        stats,
        statMap,
      });
    }
    if (!players.length) continue;
    boxes.push({
      abbr: str(team.abbreviation) || "",
      color: colorOf(team.color),
      columns: headers,
      players,
    });
  }

  const plays: LivePlay[] = [];
  // NFL/NCAAF put plays inside drives; NBA/NHL/MLB use top-level plays.
  let rawPlays = asList(d.plays);
  if (!rawPlays.length) {
    const drives = asDict(d.drives);
    const drivePlays: unknown[] = [];
    for (const dr of asList(drives.previous)) drivePlays.push(...asList(asDict(dr).plays).map((pl) => ({ ...asDict(pl), team: asDict(pl).team ?? asDict(dr).team })));
    const cur = asDict(drives.current);
    const curPlays = asList(cur.plays);
    const lastPrev = asList(drives.previous).slice(-1)[0];
    if (curPlays.length && str(cur.id) !== str(asDict(lastPrev).id)) drivePlays.push(...curPlays.map((pl) => ({ ...asDict(pl), team: asDict(pl).team ?? cur.team })));
    const seen = new Set<string>();
    rawPlays = drivePlays.filter((pl) => {
      const pid = str(asDict(pl).id);
      if (!pid || seen.has(pid)) return false;
      seen.add(pid);
      return true;
    });
  }
  for (const raw of rawPlays.slice(-40)) {
    const p = asDict(raw);
    const id = str(p.id);
    const text = str(p.text) || str(p.shortDescription);
    if (!id || !text) continue;
    const start = asDict(p.start);
    const coord = asDict(p.coordinate);
    plays.push({
      id,
      text,
      clock: str(asDict(p.clock).displayValue) || "",
      period: str(asDict(p.period).displayValue) || "",
      scoring: p.scoringPlay === true,
      points: num(p.scoreValue) ?? 0,
      awayScore: num(p.awayScore),
      homeScore: num(p.homeScore),
      teamId: str(asDict(p.team).id),
      x: onCourt(coord.x),
      y: onCourt(coord.y),
      down: num(start.down),
      distance: num(start.distance),
      yardsToEndzone: num(start.yardsToEndzone),
      spot: str(start.shortDownDistanceText) || str(start.possessionText),
      typeText: str(asDict(p.type).text) || "",
    });
  }

  const winByPlay = new Map<string, number>();
  let homeWin: number | null = null;
  for (const raw of asList(d.winprobability)) {
    const row = asDict(raw);
    const n = num(row.homeWinPercentage);
    if (n === null) continue;
    homeWin = n;
    const pid = str(row.playId);
    if (pid) winByPlay.set(pid, Math.round(n * 1000) / 10);
  }
  const win = plays.map((p) => winByPlay.get(p.id)).filter((n): n is number => n != null);

  return {
    state,
    clock: state === "in" ? str(asDict(comp.status).displayClock) : null,
    detail: str(status.shortDetail) || "",
    awayAbbr: str(awayTeam.abbreviation) || "AWY",
    homeAbbr: str(homeTeam.abbreviation) || "HME",
    awayScore: str(away.score),
    homeScore: str(home.score),
    awayColor: colorOf(awayTeam.color),
    homeColor: colorOf(homeTeam.color),
    awayId: str(awayTeam.id) || "",
    homeId: str(homeTeam.id) || "",
    provider: move?.provider ?? null,
    total: move?.total ?? null,
    totalOpen: move?.totalOpen ?? null,
    spreadDetail: move?.spreadDetail ?? null,
    spreadHome: move?.spreadHome ?? null,
    spreadOpen: move?.spreadHomeOpen ?? null,
    awayMl: move?.awayMl ?? null,
    homeMl: move?.homeMl ?? null,
    homeWin: homeWin === null ? null : Math.round(homeWin * 1000) / 10,
    win,
    period: num(asDict(comp.status).period),
    boxes,
    plays,
  };
}
