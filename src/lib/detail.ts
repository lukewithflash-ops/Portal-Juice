/** Pure parsers for a game summary, player props, and MVP futures. No network. */

import { implied, validOdds } from "@/lib/odds";
import { american, athleteIdFromRef, finiteNumber, parseStories, type Story } from "@/lib/slate";

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => (v && typeof v === "object" ? (v as Dict) : {});
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export type FormRow = {
  id: string;
  team: string;
  label: string;
  result: string;
  score: string;
};

export type LeaderRow = {
  category: string;
  name: string;
  team: string;
  line: string;
  headshot: string | null;
};

export type InjuryRow = {
  team: string;
  name: string;
  status: string;
  headshot: string | null;
};

export type StatPair = { label: string; away: string; home: string };
export type PeriodRow = { label: string; away: string; home: string };

export type OddsMove = {
  provider: string;
  total: number | null;
  totalOpen: number | null;
  overJuice: string | null;
  underJuice: string | null;
  spreadDetail: string | null;
  spreadHome: number | null;
  spreadHomeOpen: number | null;
  homeSpread: string | null;
  awaySpread: string | null;
  homeSpreadJuice: string | null;
  awaySpreadJuice: string | null;
  homeMl: string | null;
  awayMl: string | null;
  homeMlOpen: string | null;
  awayMlOpen: string | null;
};

export type PropDraft = {
  athleteId: string;
  market: string;
  line: string;
  openLine: string | null;
};

export type GameDetail = {
  venue: string | null;
  weather: string | null;
  officials: string | null;
  form: FormRow[];
  leaders: LeaderRow[];
  injuries: InjuryRow[];
  teamStats: StatPair[];
  periods: PeriodRow[];
  ats: { team: string; summary: string }[];
  series: string | null;
  /** ESPN matchup projection, 0–100, only when they send both sides. */
  projection: { home: number; away: number } | null;
  stories: Story[];
  move: OddsMove | null;
};

export const IMPLIED_BASIS =
  "Implied chance includes the juice. Positive American price: 100 / (price + 100). Negative: |price| / (|price| + 100).";

export function americanNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!/^[+-]?\d+$/.test(t)) return null;
  const n = Number(t);
  return validOdds(n) ? n : null;
}

/** Fraction 0–1. Same math as implied(). */
export function impliedChance(odds: number): number {
  return implied(odds);
}

export function rankByImplied<T extends { oddsNum: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => implied(b.oddsNum) - implied(a.oddsNum) || a.oddsNum - b.oddsNum);
}

function lineNum(raw: unknown): number | null {
  const s = str(raw);
  if (!s) return finiteNumber(raw);
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function closeOdds(node: unknown): string | null {
  const d = asDict(node);
  return american(asDict(asDict(d.close).odds) ?? d.odds) ?? american(asDict(d.close).odds);
}

export function parseOddsMove(raw: unknown): OddsMove | null {
  const o = asDict(raw);
  if (!Object.keys(o).length) return null;
  const provider =
    str(asDict(o.provider).displayName) || str(asDict(o.provider).name) || "ESPN";
  const total = finiteNumber(o.overUnder);
  const overOpen = asDict(asDict(asDict(o.total).over).open);
  const totalOpen = lineNum(overOpen.line) ?? finiteNumber(overOpen.line);
  const ps = asDict(o.pointSpread);
  const homeClose = asDict(asDict(ps.home).close);
  const homeOpen = asDict(asDict(ps.home).open);
  const awayClose = asDict(asDict(ps.away).close);
  const ml = asDict(o.moneyline);
  const move: OddsMove = {
    provider,
    total,
    totalOpen: totalOpen !== null && totalOpen !== total ? totalOpen : totalOpen,
    overJuice: american(o.overOdds) ?? closeOdds(asDict(o.total).over),
    underJuice: american(o.underOdds) ?? closeOdds(asDict(o.total).under),
    spreadDetail: str(o.details),
    spreadHome: lineNum(homeClose.line) ?? finiteNumber(o.spread),
    spreadHomeOpen: lineNum(homeOpen.line),
    homeSpread: str(homeClose.line),
    awaySpread: str(awayClose.line),
    homeSpreadJuice: american(homeClose.odds),
    awaySpreadJuice: american(awayClose.odds),
    homeMl: american(asDict(asDict(ml.home).close).odds),
    awayMl: american(asDict(asDict(ml.away).close).odds),
    homeMlOpen: american(asDict(asDict(ml.home).open).odds),
    awayMlOpen: american(asDict(asDict(ml.away).open).odds),
  };
  const any =
    move.total !== null || move.spreadDetail || move.homeMl || move.spreadHome !== null;
  return any ? move : null;
}

export function parseWeather(gameInfo: unknown): string | null {
  const w = asDict(asDict(gameInfo).weather);
  const parts: string[] = [];
  const named = str(w.displayValue) || str(w.condition);
  if (named) parts.push(named);
  const temp = finiteNumber(w.temperature);
  if (temp !== null) parts.push(`${temp}°`);
  const high = finiteNumber(w.highTemperature);
  const low = finiteNumber(w.lowTemperature);
  if (high !== null && low !== null && high !== low) parts.push(`H ${high}° / L ${low}°`);
  const precip = finiteNumber(w.precipitation);
  if (precip !== null) parts.push(`Precip ${precip}`);
  const gust = finiteNumber(w.gust);
  if (gust !== null && gust > 0) parts.push(`Gust ${gust}`);
  return parts.length ? parts.join(" · ") : null;
}

export function parseVenue(gameInfo: unknown): string | null {
  const v = asDict(asDict(gameInfo).venue);
  const name = str(v.fullName) || str(v.shortName);
  const addr = asDict(v.address);
  const city = [str(addr.city), str(addr.state)].filter(Boolean).join(", ");
  if (name && city) return `${name} · ${city}`;
  return name || city || null;
}

function headshot(athlete: Dict): string | null {
  const h = athlete.headshot;
  const href = typeof h === "string" ? h : str(asDict(h).href);
  if (!href) return null;
  try {
    const u = new URL(href);
    if (u.protocol === "https:" && (u.hostname === "a.espncdn.com" || u.hostname.endsWith(".a.espncdn.com"))) {
      return u.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export function parseSummaryDetail(data: unknown, leagueLabel: string): GameDetail {
  const d = asDict(data);
  const info = asDict(d.gameInfo);
  const officials = asList(info.officials)
    .map((o) => str(asDict(o).displayName) || str(asDict(o).fullName))
    .filter((n): n is string => !!n);

  const form: FormRow[] = [];
  for (const raw of asList(d.lastFiveGames)) {
    const block = asDict(raw);
    const team = str(asDict(block.team).abbreviation) || "";
    for (const evRaw of asList(block.events)) {
      const ev = asDict(evRaw);
      const id = str(ev.id);
      const opp = str(asDict(ev.opponent).abbreviation);
      const at = str(ev.atVs) || "";
      const result = str(ev.gameResult);
      const score = str(ev.score);
      if (!id || !opp || !result || !score) continue;
      form.push({ id, team, label: `${at} ${opp}`.trim(), result, score });
    }
  }

  const leaders: LeaderRow[] = [];
  for (const raw of asList(d.leaders)) {
    const block = asDict(raw);
    const team = str(asDict(block.team).abbreviation) || "";
    for (const catRaw of asList(block.leaders)) {
      const cat = asDict(catRaw);
      const category = str(cat.displayName) || str(cat.name) || "Stat";
      const top = asDict(asList(cat.leaders)[0]);
      const athlete = asDict(top.athlete);
      const name = str(athlete.displayName) || str(athlete.fullName);
      const line = str(top.displayValue) || str(top.mainStat);
      if (!name || !line) continue;
      leaders.push({ category, name, team, line, headshot: headshot(athlete) });
    }
  }

  const injuries: InjuryRow[] = [];
  for (const raw of asList(d.injuries)) {
    const block = asDict(raw);
    const team = str(asDict(block.team).abbreviation) || "";
    for (const injRaw of asList(block.injuries)) {
      const inj = asDict(injRaw);
      const athlete = asDict(inj.athlete);
      const name = str(athlete.displayName) || str(athlete.fullName);
      const status = str(inj.status);
      if (!name || !status) continue;
      injuries.push({ team, name, status, headshot: headshot(athlete) });
    }
  }

  const header = asDict(d.header);
  const comp = asDict(asList(header.competitions)[0]);
  const sides = asList(comp.competitors).map(asDict);
  const home = sides.find((s) => s.homeAway === "home");
  const away = sides.find((s) => s.homeAway === "away");
  const periods: PeriodRow[] = [];
  const aLines = asList(away?.linescores);
  const hLines = asList(home?.linescores);
  const n = Math.max(aLines.length, hLines.length);
  for (let i = 0; i < n; i++) {
    const a = asDict(aLines[i]);
    const h = asDict(hLines[i]);
    const av = str(a.displayValue);
    const hv = str(h.displayValue);
    if (!av && !hv) continue;
    periods.push({ label: str(a.period) || str(h.period) || String(i + 1), away: av || "—", home: hv || "—" });
  }

  const statMap = new Map<string, { label: string; away?: string; home?: string }>();
  for (const raw of asList(asDict(d.boxscore).teams)) {
    const block = asDict(raw);
    const side = block.homeAway === "home" || asDict(block.team).homeAway === "home" ? "home" : "away";
    const ha = str(block.homeAway) === "home" ? "home" : str(block.homeAway) === "away" ? "away" : side;
    for (const stRaw of asList(block.statistics)) {
      const st = asDict(stRaw);
      const label = str(st.displayName) || str(st.label) || str(st.name);
      const value = str(st.displayValue);
      if (!label || value === null) continue;
      const row = statMap.get(label) ?? { label };
      row[ha] = value;
      statMap.set(label, row);
    }
  }
  const teamStats: StatPair[] = [...statMap.values()]
    .filter((r) => r.away || r.home)
    .map((r) => ({ label: r.label, away: r.away || "—", home: r.home || "—" }));

  const ats: { team: string; summary: string }[] = [];
  for (const raw of asList(d.againstTheSpread)) {
    const block = asDict(raw);
    const team = str(asDict(block.team).abbreviation) || "";
    const records = asList(block.records).map(asDict);
    const total = records.find((r) => r.type === "total" || r.name === "overall") ?? records[0];
    const summary = str(total?.summary);
    if (team && summary) ats.push({ team, summary });
  }

  const seriesBlock = asDict(asList(d.seasonseries)[0]);
  const series = str(seriesBlock.summary) || str(seriesBlock.title);

  const pred = asDict(d.predictor);
  const homeProj = finiteNumber(asDict(pred.homeTeam).gameProjection);
  const awayProj = finiteNumber(asDict(pred.awayTeam).gameProjection);
  const projection =
    homeProj !== null && awayProj !== null ? { home: homeProj, away: awayProj } : null;

  const pick = asList(d.pickcenter)[0] ?? asList(d.odds)[0];

  return {
    venue: parseVenue(info),
    weather: parseWeather(info),
    officials: officials.length ? officials.join(", ") : null,
    form,
    leaders,
    injuries,
    teamStats,
    periods,
    ats,
    series,
    projection,
    stories: parseStories(d.news, leagueLabel).slice(0, 6),
    move: parseOddsMove(pick),
  };
}

/** Keep player markets. Drop rows with no athlete. Dedupe athlete + market. */
export function parsePropItems(data: unknown): { drafts: PropDraft[]; total: number } {
  const d = asDict(data);
  const total = finiteNumber(d.count) ?? asList(d.items).length;
  const seen = new Set<string>();
  const drafts: PropDraft[] = [];
  for (const raw of asList(d.items)) {
    const it = asDict(raw);
    const market = str(asDict(it.type).name);
    const athleteId = athleteIdFromRef(asDict(it.athlete).$ref);
    if (!market || !athleteId) continue;
    if (/^team\b/i.test(market)) continue;
    const cur = asDict(asDict(it.current).target);
    const line = str(cur.displayValue) ?? (finiteNumber(cur.value) !== null ? String(finiteNumber(cur.value)) : null);
    if (!line) continue;
    const openRaw = asDict(asDict(it.open).target);
    const openLine = str(openRaw.displayValue);
    const key = `${athleteId}:${market}`;
    if (seen.has(key)) continue;
    seen.add(key);
    drafts.push({ athleteId, market, line, openLine: openLine && openLine !== line ? openLine : null });
  }
  return { drafts, total };
}

export type FutureBook = { athleteId: string; odds: string; oddsNum: number };

export function parseMvpMarket(data: unknown): { market: string; provider: string; books: FutureBook[] } | null {
  const items = asList(asDict(data).items).map(asDict);
  const market = items.find((it) => /mvp/i.test(`${str(it.name) || ""} ${str(it.displayName) || ""}`));
  if (!market) return null;
  const offer = asDict(asList(market.futures)[0]);
  const provider = str(asDict(offer.provider).name);
  if (!provider) return null;
  const books: FutureBook[] = [];
  const seen = new Set<string>();
  for (const raw of asList(offer.books)) {
    const b = asDict(raw);
    const athleteId = athleteIdFromRef(asDict(b.athlete).$ref);
    const odds = str(b.value);
    const oddsNum = americanNumber(odds);
    if (!athleteId || !odds || oddsNum === null || seen.has(athleteId)) continue;
    seen.add(athleteId);
    books.push({ athleteId, odds, oddsNum });
  }
  if (!books.length) return null;
  return {
    market: str(market.displayName) || str(market.name) || "MVP",
    provider,
    books: rankByImplied(books),
  };
}

const STAT_ORDER = [
  "passingYards",
  "passingTouchdowns",
  "interceptions",
  "rushingYards",
  "receivingYards",
  "receptions",
  "avgPoints",
  "pointsPerGame",
  "points",
  "avgRebounds",
  "rebounds",
  "avgAssists",
  "assists",
] as const;

const STAT_SHORT: Record<string, string> = {
  passingYards: "pass yds",
  passingTouchdowns: "pass TD",
  interceptions: "INT",
  rushingYards: "rush yds",
  receivingYards: "rec yds",
  receptions: "rec",
  avgPoints: "ppg",
  pointsPerGame: "ppg",
  points: "pts",
  avgRebounds: "rpg",
  rebounds: "reb",
  avgAssists: "apg",
  assists: "ast",
};

/** Up to three season figures ESPN actually sent. */
export function seasonStatLine(data: unknown): string {
  const splits = asDict(asDict(data).splits);
  const map = new Map<string, string>();
  for (const catRaw of asList(splits.categories)) {
    for (const stRaw of asList(asDict(catRaw).stats)) {
      const st = asDict(stRaw);
      const name = str(st.name);
      const value = str(st.displayValue);
      if (name && value && !map.has(name)) map.set(name, value);
    }
  }
  const bits: string[] = [];
  const used = new Set<string>();
  for (const key of STAT_ORDER) {
    if (!map.has(key) || used.has(STAT_SHORT[key]!)) continue;
    used.add(STAT_SHORT[key]!);
    bits.push(`${map.get(key)} ${STAT_SHORT[key]}`);
    if (bits.length >= 3) break;
  }
  return bits.join(" · ");
}

export function providerFromOddsList(data: unknown): { id: string; name: string } | null {
  const item = asDict(asList(asDict(data).items)[0]);
  const prov = asDict(item.provider);
  const id = str(prov.id);
  const name = str(prov.name) || str(prov.displayName);
  if (!id || !name) return null;
  return { id, name };
}
