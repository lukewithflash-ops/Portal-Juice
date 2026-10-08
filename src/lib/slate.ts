/** Pure slate types and parsers. No network. */

export const LEAGUE_IDS = ["nfl", "nba", "mlb", "nhl", "ncaaf"] as const;
export type LeagueId = (typeof LEAGUE_IDS)[number];

export type League = {
  id: LeagueId;
  label: string;
  sport: string;
  slug: string;
  /** Core-API leader categories, in the order we want players. */
  leaderCats: { category: string; statKey: string; label: string }[];
};

export const LEAGUES: League[] = [
  {
    id: "nfl",
    label: "NFL",
    sport: "football",
    slug: "nfl",
    leaderCats: [
      { category: "passingYards", statKey: "passingYards", label: "pass yds" },
      { category: "rushingYards", statKey: "rushingYards", label: "rush yds" },
      { category: "receivingYards", statKey: "receivingYards", label: "rec yds" },
    ],
  },
  {
    id: "nba",
    label: "NBA",
    sport: "basketball",
    slug: "nba",
    leaderCats: [{ category: "pointsPerGame", statKey: "points", label: "pts" }],
  },
  {
    id: "mlb",
    label: "MLB",
    sport: "baseball",
    slug: "mlb",
    leaderCats: [{ category: "hits", statKey: "hits", label: "hits" }],
  },
  {
    id: "nhl",
    label: "NHL",
    sport: "hockey",
    slug: "nhl",
    leaderCats: [{ category: "goals", statKey: "goals", label: "goals" }],
  },
  {
    id: "ncaaf",
    label: "NCAAF",
    sport: "football",
    slug: "college-football",
    leaderCats: [
      { category: "passingYards", statKey: "passingYards", label: "pass yds" },
      { category: "rushingYards", statKey: "rushingYards", label: "rush yds" },
    ],
  },
];

export const POPULAR_SIGNAL =
  "National TV first, then a game with a ranked team, then ESPN scoreboard order (NFL, NBA, MLB, NHL, NCAAF). Not a view count.";

export function leagueById(id: string): League | null {
  return LEAGUES.find((l) => l.id === id) ?? null;
}

export function sportsDate(now = new Date(), timeZone = "America/Los_Angeles"): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const grab = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${grab("year")}${grab("month")}${grab("day")}`;
}

export function dayLabel(yyyymmdd: string, timeZone = "America/Los_Angeles"): string {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const utc = new Date(Date.UTC(y, m - 1, d, 20, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(utc);
}

export type Side = {
  id: string;
  abbr: string;
  name: string;
  home: boolean;
  score: string | null;
  rank: number | null;
  logo: string | null;
  record: string | null;
};

export type Price = {
  provider: string;
  total: number | null;
  overJuice: string | null;
  underJuice: string | null;
  spreadDetail: string | null;
  homeSpread: string | null;
  awaySpread: string | null;
  homeSpreadJuice: string | null;
  awaySpreadJuice: string | null;
  homeMl: string | null;
  awayMl: string | null;
  /** Home spread as a number, for move tracking. Null when ESPN did not send one. */
  spreadHome: number | null;
  /** Open total / home spread when ESPN sent an open. Null if absent. */
  totalOpen: number | null;
  spreadHomeOpen: number | null;
};

export type GameState = "pre" | "in" | "post";

export type Game = {
  id: string;
  league: LeagueId;
  leagueLabel: string;
  start: string;
  state: GameState;
  detail: string;
  clock: string | null;
  home: Side;
  away: Side;
  broadcasts: string[];
  national: boolean;
  ranked: boolean;
  price: Price | null;
};

export type Slate = {
  day: string;
  dayLabel: string;
  fetchedAt: string;
  games: Game[];
  /** Leagues whose scoreboard failed. Empty when every league responded. */
  missing: string[];
};

export type Trend = {
  id: string;
  name: string;
  team: string;
  league: LeagueId;
  leagueLabel: string;
  matchup: string;
  gameId: string;
  headshot: string | null;
  statLabel: string;
  avg: number;
  games: number;
  /** Season-to-date average from the same gamelog, when more games exist than the window. */
  seasonAvg: number | null;
  seasonGames: number | null;
};

export type Story = {
  id: string;
  headline: string;
  description: string | null;
  published: string;
  url: string;
  league: string;
  source: "ESPN";
};

export type TeamPage = {
  league: LeagueId;
  leagueLabel: string;
  id: string;
  abbr: string;
  name: string;
  record: string | null;
  standing: string | null;
  logo: string | null;
  color: string | null;
  next: { id: string | null; label: string; start: string } | null;
  recent: { id: string; label: string; start: string; score: string }[];
  stories: Story[];
};

type Dict = Record<string, unknown>;

const asDict = (v: unknown): Dict => (v && typeof v === "object" ? (v as Dict) : {});
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function finiteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** American odds exactly as sent. Numbers are formatted; missing stays null. */
export function american(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const n = Math.round(v);
    if (n === 0) return "0";
    return n > 0 ? `+${n}` : String(n);
  }
  const s = str(v);
  if (!s) return null;
  if (/^[+-]?\d+$/.test(s)) {
    const n = Number(s);
    if (n > 0 && !s.startsWith("+")) return `+${n}`;
    return s;
  }
  return null;
}

function closeOf(node: unknown, key: "odds" | "line"): string | null {
  const d = asDict(node);
  const close = asDict(d.close);
  return str(close[key]) ?? str(d[key]);
}

function juiceFrom(node: unknown): string | null {
  return american(closeOf(node, "odds")) ?? american(asDict(node).odds);
}

export function parsePrice(raw: unknown): Price | null {
  const o = asDict(raw);
  if (!Object.keys(o).length) return null;
  const provider =
    str(asDict(o.provider).displayName) || str(asDict(o.provider).name) || str(o.provider) || "ESPN";

  let total = finiteNumber(o.overUnder);
  if (total === null) {
    const line = closeOf(asDict(o.total).over, "line") ?? "";
    const m = line.match(/(\d+(?:\.\d+)?)/);
    if (m) total = Number(m[1]);
  }

  const overJuice = juiceFrom(asDict(o.total).over) ?? american(o.overOdds);
  const underJuice = juiceFrom(asDict(o.total).under) ?? american(o.underOdds);

  const ps = asDict(o.pointSpread);
  const homeSpread = closeOf(ps.home, "line");
  const awaySpread = closeOf(ps.away, "line");
  const homeSpreadJuice = juiceFrom(ps.home);
  const awaySpreadJuice = juiceFrom(ps.away);
  const spreadHome = finiteNumber(homeSpread) ?? finiteNumber(o.spread);

  const ml = asDict(o.moneyline);
  const homeMl =
    american(asDict(asDict(ml.home).close).odds) ??
    american(asDict(o.homeTeamOdds).moneyLine);
  const awayMl =
    american(asDict(asDict(ml.away).close).odds) ??
    american(asDict(o.awayTeamOdds).moneyLine);

  const spreadDetail = str(o.details);
  const openNum = (node: unknown): number | null => {
    const line = str(asDict(asDict(node).open).line) ?? "";
    const m = line.match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : finiteNumber(asDict(asDict(node).open).line);
  };
  const totalOpen = openNum(asDict(o.total).over);
  const spreadHomeOpen = openNum(asDict(o.pointSpread).home);

  const price: Price = {
    provider,
    total,
    overJuice,
    underJuice,
    spreadDetail,
    homeSpread,
    awaySpread,
    homeSpreadJuice,
    awaySpreadJuice,
    homeMl,
    awayMl,
    spreadHome,
    totalOpen,
    spreadHomeOpen,
  };
  const any =
    price.total !== null ||
    price.spreadDetail ||
    price.homeSpread ||
    price.homeMl ||
    price.awayMl ||
    price.spreadHome !== null;
  return any ? price : null;
}

function parseSide(raw: unknown): Side | null {
  const c = asDict(raw);
  const team = asDict(c.team);
  const abbr = str(team.abbreviation);
  const name = str(team.displayName) || str(team.shortDisplayName) || abbr;
  if (!abbr || !name) return null;
  const rankRaw = finiteNumber(asDict(c.curatedRank).current);
  const rank = rankRaw !== null && rankRaw > 0 && rankRaw < 26 ? rankRaw : null;
  const records = asList(c.records);
  const overall = records.map(asDict).find((r) => r.type === "total" || r.name === "overall");
  const logo = str(team.logo);
  return {
    id: str(team.id) ?? abbr,
    abbr,
    name,
    home: c.homeAway === "home",
    score: str(c.score),
    rank,
    logo: logo && logo.startsWith("https://") ? logo : null,
    record: str(overall?.summary),
  };
}

function broadcastsOf(comp: Dict): { names: string[]; national: boolean } {
  const names: string[] = [];
  let national = false;
  for (const raw of asList(comp.broadcasts)) {
    const b = asDict(raw);
    const market = b.market;
    const marketText =
      typeof market === "string" ? market : str(asDict(market).type) || str(asDict(market).name) || "";
    if (marketText.toLowerCase() === "national") national = true;
    for (const n of asList(b.names)) {
      const s = str(n);
      if (s) names.push(s);
    }
    const media = str(asDict(b.media).shortName);
    if (media) names.push(media);
  }
  return { names: [...new Set(names)], national };
}

export function parseGame(
  league: League,
  event: Dict,
  order: number,
  oddsOverride?: unknown
): Game | null {
  const comp = asDict(asList(event.competitions)[0]);
  const status = asDict(asDict(comp.status).type);
  const stateRaw = str(status.state);
  const state: GameState = stateRaw === "in" || stateRaw === "post" ? stateRaw : "pre";
  const sides = asList(comp.competitors).map(parseSide).filter((s): s is Side => !!s);
  const home = sides.find((s) => s.home) ?? sides[0];
  const away = sides.find((s) => !s.home) ?? sides[1];
  if (!home || !away) return null;
  const oddsList = asList(comp.odds);
  const rawOdds = oddsOverride ?? oddsList[0];
  const { names, national } = broadcastsOf(comp);
  const id = str(event.id) ?? str(comp.id) ?? `${league.id}-${order}`;
  const start = str(event.date) ?? str(comp.date) ?? "";
  if (!start) return null;
  return {
    id,
    league: league.id,
    leagueLabel: league.label,
    start,
    state,
    detail: str(status.shortDetail) || str(status.detail) || "",
    clock: state === "in" ? str(asDict(comp.status).displayClock) : null,
    home,
    away,
    broadcasts: names,
    national,
    ranked: home.rank !== null || away.rank !== null,
    price: parsePrice(rawOdds),
  };
}

/** Stable popular order. Lower bucket wins; ESPN order is the tiebreak. */
export function rankGames<T extends { national: boolean; ranked: boolean }>(games: T[]): T[] {
  return games
    .map((g, i) => ({ g, i, bucket: (g.national ? 0 : 2) + (g.ranked ? 0 : 1) }))
    .sort((a, b) => a.bucket - b.bucket || a.i - b.i)
    .map((x) => x.g);
}

export function parseScoreboard(league: League, data: unknown): { games: Game[]; seasonYear: number | null; seasonType: number | null } {
  const d = asDict(data);
  const season = asDict(d.season);
  const year = finiteNumber(season.year);
  const typeNode = season.type;
  const seasonType =
    finiteNumber(typeNode) ?? finiteNumber(asDict(typeNode).type) ?? finiteNumber(asDict(typeNode).id);
  const games = asList(d.events)
    .map((e, i) => parseGame(league, asDict(e), i))
    .filter((g): g is Game => !!g);
  return { games, seasonYear: year, seasonType: seasonType };
}

type LogEvent = { eventId?: string; stats?: unknown[] };

/** Average of the last `n` gamelog values for statKey. Null if the stat is absent. */
export function lastNAverage(
  log: unknown,
  statKey: string,
  n = 5
): { avg: number; games: number; seasonAvg: number; seasonGames: number } | null {
  const d = asDict(log);
  const names = asList(d.names).map((x) => (typeof x === "string" ? x : ""));
  const idx = names.indexOf(statKey);
  if (idx < 0) return null;
  const meta = asDict(d.events);
  const seen = new Set<string>();
  const rows: { date: string; val: number }[] = [];
  for (const season of asList(d.seasonTypes)) {
    for (const cat of asList(asDict(season).categories)) {
      for (const raw of asList(asDict(cat).events)) {
        const ev = raw as LogEvent;
        const id = str(ev.eventId) ?? "";
        if (!id || seen.has(id)) continue;
        const cell = ev.stats?.[idx];
        if (typeof cell === "string" && cell.includes("-")) continue;
        const val = finiteNumber(cell);
        if (val === null) continue;
        seen.add(id);
        const when = str(asDict(meta[id]).gameDate) ?? "";
        rows.push({ date: when, val });
      }
    }
  }
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const slice = rows.slice(0, n);
  if (!slice.length) return null;
  const avg = slice.reduce((s, r) => s + r.val, 0) / slice.length;
  const seasonAvg = rows.reduce((s, r) => s + r.val, 0) / rows.length;
  return {
    avg: Math.round(avg * 10) / 10,
    games: slice.length,
    seasonAvg: Math.round(seasonAvg * 10) / 10,
    seasonGames: rows.length,
  };
}

export function athleteIdFromRef(ref: unknown): string | null {
  const s = str(ref);
  if (!s) return null;
  const m = s.match(/athletes\/(\d+)/);
  return m?.[1] ?? null;
}

export function topLeaderId(payload: unknown, category: string): string | null {
  const cats = asList(asDict(payload).categories).map(asDict);
  const cat = cats.find((c) => c.name === category);
  const leader = asDict(asList(cat?.leaders)[0]);
  return athleteIdFromRef(asDict(leader.athlete).$ref);
}

export function readAthlete(data: unknown): { name: string | null; headshot: string | null; position: string | null } {
  const d = asDict(data);
  const a = Object.keys(asDict(d.athlete)).length ? asDict(d.athlete) : d;
  const head = a.headshot;
  const href = typeof head === "string" ? head : str(asDict(head).href);
  return {
    name: str(a.displayName) || str(a.fullName),
    headshot: href,
    position: str(asDict(a.position).abbreviation),
  };
}

export function parseStories(data: unknown, leagueLabel: string): Story[] {
  const articles = asList(asDict(data).articles);
  const out: Story[] = [];
  for (const raw of articles) {
    const a = asDict(raw);
    const headline = str(a.headline);
    const id = str(a.id) ?? str(a.nowId);
    const links = asDict(asDict(a.links).web);
    let url = str(links.href);
    if (!headline || !id || !url) continue;
    if (url.startsWith("http://")) url = `https://${url.slice("http://".length)}`;
    if (!url.startsWith("https://")) continue;
    out.push({
      id: `${leagueLabel}-${id}`,
      headline,
      description: str(a.description),
      published: str(a.published) ?? str(a.lastModified) ?? "",
      url,
      league: leagueLabel,
      source: "ESPN",
    });
  }
  return out;
}

export function parseRecent(schedule: unknown): { id: string; label: string; start: string; score: string }[] {
  const rows: { id: string; label: string; start: string; score: string }[] = [];
  for (const raw of asList(asDict(schedule).events)) {
    const e = asDict(raw);
    const comp = asDict(asList(e.competitions)[0]);
    const state = str(asDict(asDict(comp.status).type).state);
    if (state !== "post") continue;
    const sides = asList(comp.competitors).map(asDict);
    const home = sides.find((s) => s.homeAway === "home");
    const away = sides.find((s) => s.homeAway === "away");
    const hs = str(home?.score);
    const as = str(away?.score);
    const ha = str(asDict(home?.team).abbreviation);
    const aa = str(asDict(away?.team).abbreviation);
    const start = str(e.date) ?? "";
    if (!start || !ha || !aa || hs === null || as === null) continue;
    rows.push({
      id: str(e.id) || str(comp.id) || "",
      label: str(e.shortName) || `${aa} @ ${ha}`,
      start,
      score: `${aa} ${as} @ ${ha} ${hs}`,
    });
  }
  rows.sort((a, b) => (a.start < b.start ? 1 : -1));
  return rows.slice(0, 5);
}

export function parseNextEvent(team: Dict): { id: string | null; label: string; start: string } | null {
  const ev = asDict(asList(team.nextEvent)[0]);
  const start = str(ev.date);
  const label = str(ev.shortName) || str(ev.name);
  if (!start || !label) return null;
  return { id: str(ev.id), label, start };
}

export function httpsHostOk(url: string | null | undefined, host: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    if (u.hostname !== host && !u.hostname.endsWith(`.${host}`)) return null;
    return u.toString();
  } catch {
    return null;
  }
}
