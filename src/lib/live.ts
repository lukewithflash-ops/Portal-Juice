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
  /** Football only. "2nd & 7 at DAL 34" before the snap. */
  downText?: string | null;
  /** Football only. Yards gained on the play, as ESPN scored it. */
  yards?: number | null;
  penalty?: boolean;
  turnover?: boolean;
  driveId?: string | null;
};

export type LiveDrive = {
  id: string;
  teamId: string | null;
  abbr: string;
  logo: string | null;
  /** "TD", "FG", "PUNT", "INT"… Null while the drive is on. */
  result: string | null;
  resultLong: string | null;
  /** "9 plays, 70 yards, 4:09" */
  description: string;
  isScore: boolean;
  live: boolean;
  startText: string | null;
  playIds: string[];
};

/** Down, distance, and ball spot for the team with the ball. */
export type LiveSituation = {
  down: number | null;
  distance: number | null;
  /** Yards from the offense to the end zone it is attacking. */
  yardsToEndzone: number | null;
  text: string | null;
  short: string | null;
  spot: string | null;
  teamId: string | null;
  redZone: boolean;
  source: "scoreboard" | "play";
};

/** Score bug extras, only what ESPN posts. */
export type LiveBug = {
  balls: number | null;
  strikes: number | null;
  outs: number | null;
  onFirst: boolean;
  onSecond: boolean;
  onThird: boolean;
  half: "top" | "bottom" | null;
  homeTimeouts: number | null;
  awayTimeouts: number | null;
};

/** Reads a summary or scoreboard `situation` plus the status detail ("Top 5th"). */
export function readBug(sitRaw: unknown, detail: string | null): LiveBug | null {
  const sit = asDict(sitRaw);
  const on = (v: unknown) => v === true || (!!v && typeof v === "object");
  const half = /\b(top|mid)\b/i.test(detail ?? "") ? "top" : /\b(bot|bottom|end)\b/i.test(detail ?? "") ? "bottom" : null;
  const bug: LiveBug = {
    balls: num(sit.balls),
    strikes: num(sit.strikes),
    outs: num(sit.outs),
    onFirst: on(sit.onFirst),
    onSecond: on(sit.onSecond),
    onThird: on(sit.onThird),
    half,
    homeTimeouts: num(sit.homeTimeouts),
    awayTimeouts: num(sit.awayTimeouts),
  };
  const any = bug.balls !== null || bug.outs !== null || bug.homeTimeouts !== null || bug.onFirst || bug.onSecond || bug.onThird || half;
  return any ? bug : null;
}

export function bugFromScoreboard(data: unknown, eventId: string): LiveBug | null {
  const ev = asList(asDict(data).events).map(asDict).find((e) => str(e.id) === eventId);
  if (!ev) return null;
  const comp = asDict(asList(ev.competitions)[0]);
  return readBug(comp.situation, str(asDict(asDict(comp.status).type).shortDetail) ?? str(asDict(asDict(ev.status).type).shortDetail));
}

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
  /** Football only. Every drive in order, oldest first. */
  drives: LiveDrive[];
  situation: LiveSituation | null;
  bug?: LiveBug | null;
};

function colorOf(raw: unknown): string {
  const s = typeof raw === "string" ? raw.replace("#", "") : "";
  return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s}` : "#7c3aed";
}

function ordinal(n: number | null): string {
  if (n === null || n <= 0) return "";
  const tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${tail}`;
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
    // Football splits players across passing, rushing, receiving… Read everyone once.
    const listed = new Set<string>();
    const everyone: unknown[] = [];
    for (const g of groups) {
      for (const aRaw of asList(g.athletes)) {
        const aid = str(asDict(asDict(aRaw).athlete).id);
        if (!aid || listed.has(aid)) continue;
        listed.add(aid);
        everyone.push(aRaw);
      }
    }
    const firstRows = new Set(asList(group.athletes).map((x) => str(asDict(asDict(x).athlete).id)));
    for (const aRaw of everyone) {
      const a = asDict(aRaw);
      const athlete = asDict(a.athlete);
      const name = str(athlete.displayName) || str(athlete.shortName);
      const id = str(athlete.id);
      if (!name || !id) continue;
      const stats = firstRows.has(id)
        ? asList(a.stats).map((x) => (typeof x === "string" ? x : x == null ? "" : String(x)))
        : [];
      const statMap: Record<string, string> = {};
      for (const g of groups) {
        const gNames = asList(g.names).map((x) => str(x) || "");
        const gLabels = asList(g.labels).map((x) => str(x) || "");
        const row = asList(g.athletes).map(asDict).find((row) => str(asDict(row.athlete).id) === id);
        const cells = asList(row?.stats).map((x) => (typeof x === "string" ? x : x == null ? "" : String(x)));
        gNames.forEach((key, i) => {
          if (key && cells[i] != null && cells[i] !== "") statMap[key] = cells[i];
        });
        // ESPN's stable stat keys ("passingYards", "points"). A pair key like
        // "threePointFieldGoalsMade-threePointFieldGoalsAttempted" also maps its first half.
        asList(g.keys).forEach((raw, i) => {
          const key = str(raw);
          const cell = cells[i];
          if (!key || cell == null || cell === "") return;
          if (statMap[key] == null) statMap[key] = cell;
          const first = key.split(/[-/]/)[0];
          if (first && first !== key && statMap[first] == null) statMap[first] = cell;
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
  const drives: LiveDrive[] = [];
  // NFL/NCAAF put plays inside drives; NBA/NHL/MLB use top-level plays.
  let rawPlays = asList(d.plays);
  // Soccer posts key moments (goals, bookings, subs, halves) instead of plays.
  if (!rawPlays.length && asList(d.keyEvents).length) rawPlays = asList(d.keyEvents);
  const football = !rawPlays.length && asDict(d.drives).previous !== undefined;
  if (!rawPlays.length) {
    const driveData = asDict(d.drives);
    const list = asList(driveData.previous).map(asDict);
    const cur = asDict(driveData.current);
    const curId = str(cur.id);
    if (curId) {
      const i = list.findIndex((x) => str(x.id) === curId);
      if (i === -1) list.push({ ...cur, _live: true });
      else list[i] = { ...list[i], plays: [...asList(list[i].plays), ...asList(cur.plays)], _live: !list[i].result };
    }
    const seen = new Set<string>();
    const drivePlays: unknown[] = [];
    for (const dr of list) {
      const team = asDict(dr.team);
      const ids: string[] = [];
      const own = asList(dr.plays)
        .map(asDict)
        .filter((pl) => {
          const pid = str(pl.id);
          if (!pid || seen.has(pid)) return false;
          seen.add(pid);
          return true;
        })
        .sort((x, y) => (Number(x.sequenceNumber) || 0) - (Number(y.sequenceNumber) || 0));
      for (const pl of own) {
        ids.push(str(pl.id) as string);
        // Offense for the snap: ESPN's start.team, else the drive's team.
        const startTeam = str(asDict(asDict(pl.start).team).id);
        drivePlays.push({ ...pl, team: pl.team ?? (startTeam ? { id: startTeam } : team), _drive: str(dr.id) });
      }
      const logo = asList(team.logos).map(asDict).find((l) => /^https:\/\/a\.espncdn\.com\//.test(str(l.href) || ""));
      drives.push({
        id: str(dr.id) || String(drives.length),
        teamId: str(team.id),
        abbr: str(team.abbreviation) || "",
        logo: logo ? (str(logo.href) as string) : null,
        result: str(dr.shortDisplayResult) || str(dr.result),
        resultLong: str(dr.displayResult),
        description: str(dr.description) || "",
        isScore: dr.isScore === true,
        live: dr._live === true && state === "in",
        startText: str(asDict(dr.start).text),
        playIds: ids,
      });
    }
    rawPlays = drivePlays;
  }
  for (const raw of football ? rawPlays : rawPlays.slice(-40)) {
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
      period: str(asDict(p.period).displayValue) || ordinal(num(asDict(p.period).number)),
      scoring: p.scoringPlay === true,
      points: num(p.scoreValue) ?? (p.scoringPlay === true ? 1 : 0),
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
      ...(football
        ? {
            downText: (num(start.down) ?? 0) > 0 ? str(start.downDistanceText) : null,
            yards: num(p.statYardage),
            penalty: p.isPenalty === true || /penalty/i.test(str(asDict(p.type).text) || ""),
            turnover: p.isTurnover === true,
            driveId: str(p._drive),
          }
        : {}),
    });
  }
  // Drop drives whose plays were all filtered out (no text).
  const kept = new Set(plays.map((p) => p.id));
  for (const dr of drives) dr.playIds = dr.playIds.filter((pid) => kept.has(pid));

  let situation: LiveSituation | null = null;
  if (football && state === "in") {
    // A timeout or quarter break row carries the next snap in its start. Otherwise read the last play's end.
    // A score or kick clears the down until the next snap is posted.
    const lp = asDict(rawPlays[rawPlays.length - 1]);
    const pause = /timeout|end of|end period|end quarter|two-minute/i.test(`${str(asDict(lp.type).text) || ""} ${str(lp.text) || ""}`);
    const spotOf = pause ? asDict(lp.start) : asDict(lp.end);
    const kicked = !pause && (lp.scoringPlay === true || /kickoff|field goal|extra point|punt/i.test(str(asDict(lp.type).text) || ""));
    if (rawPlays.length && !kicked && (num(spotOf.down) ?? 0) > 0) {
      // On a timeout row ESPN's team is the one that called it; the ball belongs to the drive's team.
      const driveTeam = drives.find((dr) => dr.id === str(lp._drive))?.teamId ?? null;
      const teamId = pause ? driveTeam ?? str(asDict(spotOf.team).id) : str(asDict(spotOf.team).id) ?? driveTeam;
      const abbr = teamId === str(homeTeam.id) ? str(homeTeam.abbreviation) : teamId === str(awayTeam.id) ? str(awayTeam.abbreviation) : null;
      const spot = str(spotOf.possessionText);
      const toGoal = yardsFromSpot(spot, abbr) ?? num(spotOf.yardsToEndzone);
      situation = {
        down: num(spotOf.down),
        distance: num(spotOf.distance),
        yardsToEndzone: toGoal,
        text: str(spotOf.downDistanceText),
        short: str(spotOf.shortDownDistanceText),
        spot,
        teamId,
        redZone: toGoal !== null && toGoal <= 20,
        source: "play",
      };
    }
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
    drives,
    situation,
    bug: state === "in" ? readBug(d.situation, str(asDict(asDict(comp.status).type).shortDetail)) : null,
  };
}

/** Score and clock for one game, read from a scoreboard event or a summary header. */
export type LiveStatus = {
  state: LiveSnap["state"];
  clock: string | null;
  detail: string;
  period: number | null;
  awayScore: string | null;
  homeScore: string | null;
};

function clockSeconds(v: string | null): number | null {
  if (!v) return null;
  const m = /^(\d+):(\d{1,2})(?:\.\d+)?$/.exec(v.trim());
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const s = /^(\d+(?:\.\d+)?)$/.exec(v.trim());
  return s ? Number(s[1]) : null;
}

/** Baseball half-inning order inside one inning. */
function halfRank(detail: string): number {
  const d = detail.toLowerCase();
  if (/^(top)\b/.test(d)) return 0;
  if (/^(mid|middle)\b/.test(d)) return 1;
  if (/^(bot|bottom)\b/.test(d)) return 2;
  if (/^end\b/.test(d)) return 3;
  return -1;
}

/**
 * Sortable game progress. Higher is later in the game.
 * Clock sports count down, so less time left ranks higher. Baseball uses the half inning.
 */
export function progressOf(s: LiveStatus): number[] {
  const stateRank = s.state === "post" ? 2 : s.state === "in" ? 1 : 0;
  const period = s.period ?? 0;
  const half = halfRank(s.detail);
  const left = clockSeconds(s.clock);
  const within = half >= 0 ? half : left !== null ? -left : /half|end of/i.test(s.detail) ? 0 : -1e6;
  const pts = (Number(s.awayScore) || 0) + (Number(s.homeScore) || 0);
  return [stateRank, period, within, pts];
}

function compareProgress(a: LiveStatus, b: LiveStatus): number {
  const x = progressOf(a);
  const y = progressOf(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** Read status and score for one event out of an ESPN scoreboard payload. */
export function statusFromScoreboard(data: unknown, eventId: string): LiveStatus | null {
  const ev = asList(asDict(data).events).map(asDict).find((e) => str(e.id) === eventId);
  if (!ev) return null;
  const comp = asDict(asList(ev.competitions)[0]);
  const sides = asList(comp.competitors).map(asDict);
  const home = sides.find((s) => s.homeAway === "home");
  const away = sides.find((s) => s.homeAway === "away");
  if (!home || !away) return null;
  const st = asDict(comp.status);
  const type = asDict(st.type);
  const raw = str(type.state);
  const state: LiveSnap["state"] = raw === "in" || raw === "post" ? raw : "pre";
  return {
    state,
    clock: state === "in" ? str(st.displayClock) : null,
    detail: str(type.shortDetail) || str(type.detail) || "",
    period: num(st.period),
    awayScore: str(away.score),
    homeScore: str(home.score),
  };
}

/**
 * ESPN's scoreboard and game summary update on different timers, and either one can be
 * a few plays behind. Keep whichever source is further along in the game.
 */
export function freshestStatus(snap: LiveSnap, board: LiveStatus | null): LiveSnap {
  if (!board) return snap;
  const own: LiveStatus = {
    state: snap.state,
    clock: snap.clock,
    detail: snap.detail,
    period: snap.period,
    awayScore: snap.awayScore,
    homeScore: snap.homeScore,
  };
  if (compareProgress(board, own) < 0) return snap;
  return { ...snap, ...board };
}

/** True when `next` is earlier in the game than `prev` (an older copy came back). */
export function isBehind(next: LiveStatus, prev: LiveStatus | null): boolean {
  if (!prev) return false;
  return compareProgress(next, prev) < 0;
}

/** Yards to the end zone for the offense, from "DAL 34" and the offense's abbreviation. */
export function yardsFromSpot(spot: string | null, offenseAbbr: string | null): number | null {
  if (!spot) return null;
  const t = spot.trim();
  if (/^50$/.test(t)) return 50;
  const m = /^([A-Za-z&.'-]{2,8})\s+(\d{1,2})$/.exec(t);
  if (!m) return null;
  const yl = Number(m[2]);
  if (yl === 50) return 50;
  if (!offenseAbbr) return null;
  return m[1].toUpperCase() === offenseAbbr.toUpperCase() ? 100 - yl : yl;
}

/** Football down and distance from the scoreboard, when ESPN has a live snap posted. */
export function situationFromScoreboard(data: unknown, eventId: string, snap: Pick<LiveSnap, "awayId" | "homeId" | "awayAbbr" | "homeAbbr">): LiveSituation | null {
  const ev = asList(asDict(data).events).map(asDict).find((e) => str(e.id) === eventId);
  if (!ev) return null;
  const sit = asDict(asDict(asList(ev.competitions)[0]).situation);
  const down = num(sit.down);
  const teamId = str(sit.possession);
  if (down === null || down < 1 || !teamId) return null;
  const abbr = teamId === snap.homeId ? snap.homeAbbr : teamId === snap.awayId ? snap.awayAbbr : null;
  const spot = str(sit.possessionText);
  return {
    down,
    distance: num(sit.distance),
    yardsToEndzone: yardsFromSpot(spot, abbr),
    text: str(sit.downDistanceText),
    short: str(sit.shortDownDistanceText),
    spot,
    teamId,
    redZone: sit.isRedZone === true,
    source: "scoreboard",
  };
}
