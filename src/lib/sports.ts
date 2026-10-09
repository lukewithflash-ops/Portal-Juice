/** More sports from ESPN: soccer, tennis, golf, MMA, more basketball. Pure parsers, no network. */
import { american, finiteNumber, parsePrice, spreadText, type GameState } from "@/lib/slate";
import { winPct, type WinPct } from "@/lib/winPct";

export type SportKind = "team" | "soccer" | "tennis" | "fight" | "golf";
export type SportLeague = { id: string; label: string; name: string; group: string; path: string; kind: SportKind };

export const SPORT_LEAGUES: SportLeague[] = [
  { id: "wnba", label: "WNBA", name: "WNBA", group: "Basketball", path: "basketball/wnba", kind: "team" },
  { id: "ncaam", label: "NCAAM", name: "NCAA Men's Basketball", group: "Basketball", path: "basketball/mens-college-basketball", kind: "team" },
  { id: "ncaaw", label: "NCAAW", name: "NCAA Women's Basketball", group: "Basketball", path: "basketball/womens-college-basketball", kind: "team" },
  { id: "epl", label: "EPL", name: "Premier League", group: "Soccer", path: "soccer/eng.1", kind: "soccer" },
  { id: "ucl", label: "UCL", name: "Champions League", group: "Soccer", path: "soccer/uefa.champions", kind: "soccer" },
  { id: "laliga", label: "La Liga", name: "La Liga", group: "Soccer", path: "soccer/esp.1", kind: "soccer" },
  { id: "seriea", label: "Serie A", name: "Serie A", group: "Soccer", path: "soccer/ita.1", kind: "soccer" },
  { id: "bundesliga", label: "Bundesliga", name: "Bundesliga", group: "Soccer", path: "soccer/ger.1", kind: "soccer" },
  { id: "mls", label: "MLS", name: "MLS", group: "Soccer", path: "soccer/usa.1", kind: "soccer" },
  { id: "atp", label: "ATP", name: "ATP Tennis", group: "Tennis", path: "tennis/atp", kind: "tennis" },
  { id: "wta", label: "WTA", name: "WTA Tennis", group: "Tennis", path: "tennis/wta", kind: "tennis" },
  { id: "pga", label: "PGA", name: "PGA Tour", group: "Golf", path: "golf/pga", kind: "golf" },
  { id: "ufc", label: "UFC", name: "UFC", group: "MMA", path: "mma/ufc", kind: "fight" },
];

export function sportLeague(id: string): SportLeague | null {
  return SPORT_LEAGUES.find((l) => l.id === id) ?? null;
}

export type Entrant = {
  id: string;
  name: string;
  short: string;
  logo: string | null;
  color: string | null;
  alt: string | null;
  score: string | null;
  winner: boolean;
  record: string | null;
  /** Tennis set scores, e.g. ["6", "7(1)", "6"]. */
  sets: string[];
};

export type MatchPrice = { provider: string; homeMl: string | null; awayMl: string | null; drawMl: string | null; total: number | null; spread: string | null };

export type Match = {
  id: string;
  league: string;
  event: string;
  round: string | null;
  start: string;
  state: GameState;
  detail: string;
  clock: string | null;
  away: Entrant;
  home: Entrant;
  price: MatchPrice | null;
  win: WinPct | null;
};

export type GolfRow = { pos: string; name: string; flag: string | null; score: string; today: string | null; thru: string | null };
export type GolfBoard = { id: string; name: string; state: GameState; detail: string; rows: GolfRow[] };

export type SportSlate = { league: SportLeague; matches: Match[]; golf: GolfBoard[]; fetchedAt: string };

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => (v && typeof v === "object" ? (v as Dict) : {});
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const https = (v: unknown) => {
  const s = str(v);
  return s && s.startsWith("https://") ? s : null;
};

function stateOf(status: unknown): { state: GameState; detail: string; clock: string | null } {
  const t = asDict(asDict(status).type);
  const raw = str(t.state);
  const state: GameState = raw === "in" || raw === "post" ? raw : "pre";
  return { state, detail: str(t.shortDetail) || str(t.detail) || "", clock: state === "in" ? str(asDict(status).displayClock) : null };
}

function setText(l: Dict): string {
  const v = finiteNumber(l.value);
  if (v === null) return "";
  const tb = finiteNumber(l.tiebreak);
  return tb !== null ? `${v}(${tb})` : String(v);
}

export function parseEntrant(raw: unknown): Entrant | null {
  const c = asDict(raw);
  const team = asDict(c.team);
  const ath = asDict(c.athlete);
  const isTeam = Object.keys(team).length > 0;
  const name = isTeam ? str(team.displayName) || str(team.name) : str(ath.displayName) || str(ath.fullName);
  if (!name) return null;
  const short = isTeam ? str(team.abbreviation) || str(team.shortDisplayName) || name : str(ath.shortName) || name;
  const records = asList(c.records).map(asDict);
  const rec = records.find((r) => r.type === "total" || r.name === "overall") ?? records[0];
  const color = str(team.color);
  const alt = str(team.alternateColor);
  return {
    id: str(c.id) ?? name,
    name,
    short,
    logo: isTeam ? https(team.logo) : https(asDict(ath.flag).href),
    color: color && /^[0-9a-f]{6}$/i.test(color) ? color : null,
    alt: alt && /^[0-9a-f]{6}$/i.test(alt) ? alt : null,
    score: str(c.score),
    winner: c.winner === true,
    record: str(rec?.summary),
    sets: isTeam ? [] : asList(c.linescores).map((l) => setText(asDict(l))).filter(Boolean),
  };
}

export function parseMatchPrice(raw: unknown): MatchPrice | null {
  const o = asDict(raw);
  if (!Object.keys(o).length) return null;
  const p = parsePrice(o);
  const homeMl = p?.homeMl ?? american(asDict(o.homeTeamOdds).moneyLine);
  const awayMl = p?.awayMl ?? american(asDict(o.awayTeamOdds).moneyLine);
  const drawMl = american(asDict(o.drawOdds).moneyLine);
  const total = p?.total ?? finiteNumber(o.overUnder);
  const spread = spreadText(o);
  if (!homeMl && !awayMl && total === null && !spread) return null;
  const provider = (str(asDict(o.provider).displayName) || str(asDict(o.provider).name) || "ESPN").replace(/^Draft\s*Kings$/i, "DraftKings");
  return { provider, homeMl, awayMl, drawMl, total, spread };
}

export function parseMatch(league: SportLeague, eventName: string, compRaw: unknown, fallbackDate: string): Match | null {
  const comp = asDict(compRaw);
  const cs = asList(comp.competitors);
  const ents = cs.map(parseEntrant);
  if (ents.length < 2 || ents.some((e) => !e)) return null;
  const pairs = cs.map(asDict);
  let hi = pairs.findIndex((p) => p.homeAway === "home");
  let ai = pairs.findIndex((p) => p.homeAway === "away");
  if (hi < 0 || ai < 0 || hi === ai) {
    // Head-to-head events: order 1 is listed first.
    const byOrder = pairs.map((p, i) => ({ i, o: finiteNumber(p.order) ?? i })).sort((a, b) => a.o - b.o);
    ai = byOrder[0].i;
    hi = byOrder[1].i;
  }
  const { state, detail, clock } = stateOf(comp.status);
  const price = parseMatchPrice(asList(comp.odds)[0]);
  const home = ents[hi] as Entrant;
  const away = ents[ai] as Entrant;
  if (price?.spread) price.spread = price.spread.replace(/^Home\b/, home.short).replace(/^Away\b/, away.short);
  const round = str(asDict(comp.round).displayName) || str(asDict(comp.type).abbreviation) || str(asDict(comp.type).text) || null;
  return {
    id: str(comp.id) ?? "",
    league: league.id,
    event: eventName,
    round,
    start: str(comp.date) ?? fallbackDate,
    state,
    detail,
    clock,
    away,
    home,
    price,
    win: winPct({ state, homeMl: price?.homeMl, awayMl: price?.awayMl, drawMl: price?.drawMl ?? null }),
  };
}

function golfBoard(ev: Dict): GolfBoard | null {
  const comp = asDict(asList(ev.competitions)[0]);
  const { state, detail } = stateOf(comp.status ?? ev.status);
  const rows0 = asList(comp.competitors)
    .map(asDict)
    .map((c) => {
      const ath = asDict(c.athlete);
      const rounds = asList(c.linescores).map(asDict).filter((l) => asList(l.linescores).length > 0 || str(l.displayValue));
      const cur = rounds[rounds.length - 1];
      const holes = cur ? asList(cur.linescores).length : 0;
      return {
        order: finiteNumber(c.order) ?? 999,
        name: str(ath.displayName) || str(ath.fullName) || "",
        flag: https(asDict(ath.flag).href),
        score: str(c.score) ?? "",
        today: cur ? str(cur.displayValue) : null,
        thru: cur ? (holes >= 18 ? "F" : holes > 0 ? String(holes) : null) : null,
      };
    })
    .filter((r) => r.name && r.score)
    .sort((a, b) => a.order - b.order);
  const rows: GolfRow[] = rows0.map((r) => {
    const tied = rows0.filter((x) => x.score === r.score).length > 1;
    const first = rows0.findIndex((x) => x.score === r.score);
    return { pos: `${tied ? "T" : ""}${first + 1}`, name: r.name, flag: r.flag, score: r.score, today: r.today, thru: r.thru };
  });
  if (!rows.length) return null;
  return { id: str(ev.id) ?? "", name: str(ev.name) ?? "Tournament", state, detail, rows };
}

const RANK: Record<GameState, number> = { in: 0, pre: 1, post: 2 };

/** Turns one ESPN scoreboard into matches (or a leaderboard for golf). */
export function parseSportScoreboard(league: SportLeague, data: unknown, now = Date.now()): { matches: Match[]; golf: GolfBoard[] } {
  const events = asList(asDict(data).events).map(asDict);
  if (league.kind === "golf") return { matches: [], golf: events.map(golfBoard).filter((b): b is GolfBoard => !!b) };
  const matches: Match[] = [];
  for (const ev of events) {
    const name = str(ev.name) ?? "";
    const date = str(ev.date) ?? "";
    const groups = asList(ev.groupings).map(asDict);
    if (groups.length) {
      for (const g of groups) {
        const slug = str(asDict(g.grouping).slug) ?? "";
        if (!/singles/.test(slug)) continue;
        if (league.id === "atp" && /women/.test(slug)) continue;
        if (league.id === "wta" && !/women/.test(slug)) continue;
        for (const c of asList(g.competitions)) {
          const m = parseMatch(league, name, c, date);
          if (m) matches.push(m);
        }
      }
    } else {
      for (const c of asList(ev.competitions)) {
        const m = parseMatch(league, name, c, date);
        if (m) matches.push(m);
      }
    }
  }
  const day = 36 * 3600 * 1000;
  const keep = league.kind === "tennis"
    ? matches.filter((m) => m.state === "in" || Math.abs(Date.parse(m.start) - now) < day)
    : matches;
  keep.sort((a, b) => RANK[a.state] - RANK[b.state] || (a.state === "post" ? Date.parse(b.start) - Date.parse(a.start) : Date.parse(a.start) - Date.parse(b.start)));
  return { matches: keep.slice(0, 40), golf: [] };
}

export type MatchEvent = { id: string; clock: string | null; text: string; kind: string; team: string | null };

/** Soccer key events and commentary, basketball plays. Newest first. */
export function parseMatchFeed(summary: unknown): MatchEvent[] {
  const d = asDict(summary);
  const key = asList(d.keyEvents).map(asDict);
  const plays = asList(d.plays).map(asDict);
  const src = key.length ? key : plays;
  const out: MatchEvent[] = [];
  for (const p of src) {
    const text = str(p.text) || str(p.shortText) || str(asDict(p.type).text);
    if (!text) continue;
    out.push({
      id: str(p.id) ?? String(out.length),
      clock: str(asDict(p.clock).displayValue),
      text,
      kind: (str(asDict(p.type).type) || str(asDict(p.type).text) || "").toLowerCase(),
      team: str(asDict(p.team).displayName) || str(asDict(p.team).abbreviation),
    });
  }
  return out.reverse().slice(0, 60);
}

export type StatRow = { label: string; away: string; home: string };

/** Team stat comparison from a summary boxscore, when present. */
export function parseMatchStats(summary: unknown, awayName: string, homeName: string): StatRow[] {
  const teams = asList(asDict(asDict(summary).boxscore).teams).map(asDict);
  if (teams.length < 2) return [];
  const byName = (n: string) => teams.find((t) => str(asDict(t.team).displayName) === n);
  const a = byName(awayName) ?? teams[0];
  const h = byName(homeName) ?? teams[1];
  const stats = (t: Dict) => new Map(asList(t.statistics).map(asDict).map((s) => [str(s.label) || str(s.name) || "", str(s.displayValue) ?? ""]));
  const sa = stats(a);
  const sh = stats(h);
  const rows: StatRow[] = [];
  for (const [label, av] of sa) {
    if (!label || !av || !sh.get(label)) continue;
    rows.push({ label, away: av, home: sh.get(label) as string });
  }
  return rows.slice(0, 14);
}

/** ESPN predictor in a summary, as {home, away} percents. */
export function summaryProjection(summary: unknown): { home: number; away: number } | null {
  const pred = asDict(asDict(summary).predictor);
  const h = finiteNumber(asDict(pred.homeTeam).gameProjection);
  const a = finiteNumber(asDict(pred.awayTeam).gameProjection);
  return h !== null && a !== null ? { home: h, away: a } : null;
}


/** Events worth listing under "All" today: live, or starting/finished within the PT day. Golf: any board that is live or today. */
export function todayOnly<T extends { state: GameState; start: string }>(rows: T[], now = Date.now()): T[] {
  const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
  const today = day(now);
  return rows.filter((r) => r.state === "in" || day(Date.parse(r.start)) === today);
}
