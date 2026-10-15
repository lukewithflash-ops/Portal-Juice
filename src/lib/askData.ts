/**
 * Real ESPN data for Ask Portal AI: head-to-head, team profiles, team stat ranks (own and allowed),
 * standings, injuries, depth charts, player logs and splits, matchup preview, leaders.
 * Everything here is read from ESPN's public APIs (odds are the books ESPN posts, DraftKings first).
 * Nothing is estimated or filled in: a missing number comes back as null or a "missing" note.
 */
import { unstable_cache } from "next/cache";
import { parseGameLog } from "@/lib/researchParse";
import { LEAGUES } from "@/lib/slate";
import { SPORT_LEAGUES } from "@/lib/sports";

type Dict = Record<string, unknown>;
const D = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
const L = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const S = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const N = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/,/g, "").replace(/^\+/, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/* ---------------- fetch + cache ---------------- */

const raw = new Map<string, { t: number; v: Promise<unknown> }>();
/** ESPN JSON with an in-memory TTL (per instance). 404/400 come back as null. */
export async function fetchJson(url: string, ttlSec: number): Promise<unknown | null> {
  const hit = raw.get(url);
  if (hit && Date.now() - hit.t < ttlSec * 1000) return hit.v;
  const v = (async () => {
    for (let i = 0; i < 2; i++) {
      try {
        const res = await fetch(url, { cache: "no-store", headers: { accept: "application/json", "user-agent": "PortalJuice/1.0" }, signal: AbortSignal.timeout(12000) });
        if (res.status === 400 || res.status === 404) return null;
        if (!res.ok) throw new Error(String(res.status));
        return await res.json();
      } catch (e) {
        if (i) throw e;
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    return null;
  })();
  raw.set(url, { t: Date.now(), v });
  v.catch(() => raw.delete(url));
  if (raw.size > 80) raw.delete(raw.keys().next().value as string);
  return v;
}

const parsed = new Map<string, { t: number; v: Promise<unknown> }>();
/** Small parsed results: memory first, then Next's data cache across instances. */
export function memo<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  const hit = parsed.get(key);
  if (hit && Date.now() - hit.t < ttlSec * 1000) return hit.v as Promise<T>;
  let run: Promise<T>;
  try {
    run = process.env.NEXT_RUNTIME ? unstable_cache(fn, ["pj-ask-v1", key], { revalidate: ttlSec })() : fn();
  } catch {
    run = fn();
  }
  parsed.set(key, { t: Date.now(), v: run });
  run.catch(() => parsed.delete(key));
  if (parsed.size > 500) parsed.delete(parsed.keys().next().value as string);
  return run;
}

/* ---------------- leagues ---------------- */

export type Lg = { id: string; label: string; sport: string; slug: string; kind: "team" | "soccer" };
export const TEAM_LEAGUES: Lg[] = [
  ...LEAGUES.map((l) => ({ id: l.id, label: l.label, sport: l.sport, slug: l.slug, kind: "team" as const })),
  ...SPORT_LEAGUES.filter((l) => l.kind === "team" || l.kind === "soccer").map((l) => {
    const [sport, slug] = l.path.split("/");
    return { id: l.id, label: l.label, sport, slug, kind: l.kind as "team" | "soccer" };
  }),
];
export const lgById = (id: string | null | undefined): Lg | null => TEAM_LEAGUES.find((l) => l.id === (id ?? "").toLowerCase().trim()) ?? null;
const site = (l: Lg) => `https://site.api.espn.com/apis/site/v2/sports/${l.sport}/${l.slug}`;
const web = (l: Lg) => `https://site.web.api.espn.com/apis/common/v3/sports/${l.sport}/${l.slug}`;
const core = (l: Lg) => `https://sports.core.api.espn.com/v2/sports/${l.sport}/leagues/${l.slug}`;
const football = (l: Lg) => l.sport === "football";

/* ---------------- teams ---------------- */

export type TeamRef = { league: string; id: string; abbr: string; name: string; short: string; location: string };

export function teamList(l: Lg): Promise<TeamRef[]> {
  return memo(`teams:${l.id}`, 86400, async () => {
    const d = D(await fetchJson(`${site(l)}/teams?limit=1000`, 86400));
    return L(D(L(D(L(d.sports)[0]).leagues)[0]).teams).map((x) => {
      const t = D(D(x).team);
      return { league: l.id, id: S(t.id) ?? "", abbr: S(t.abbreviation) ?? "", name: S(t.displayName) ?? "", short: S(t.shortDisplayName) ?? S(t.name) ?? "", location: S(t.location) ?? "" };
    }).filter((t) => t.id);
  }).then((r) => { if (!r.length) { parsed.delete(`teams:${l.id}`); throw new Error("no teams"); } return r; });
}

function teamScore(t: TeamRef, q: string): number {
  const qq = norm(q);
  if (!qq) return 0;
  const name = norm(t.name), short = norm(t.short), loc = norm(t.location), ab = norm(t.abbr);
  if (qq === ab) return 100;
  if (qq === name) return 100;
  if (qq === short || qq === `${loc} ${short}`) return 95;
  if (qq.endsWith(` ${short}`) && short.length > 2) return 90;
  if (qq === loc) return 70;
  if (name.includes(qq) && qq.length >= 4) return 60;
  if (qq.split(" ").some((w) => w.length >= 4 && (w === short || w === loc))) return 50;
  return 0;
}

const DEFAULT_ORDER = ["nfl", "nba", "mlb", "nhl", "wnba", "ncaaf", "ncaam", "ncaaw", "epl", "mls", "laliga", "seriea", "bundesliga", "ucl"];

/** Best ESPN team match for a name, city, nickname or abbreviation. League first if given. */
export async function resolveTeam(q: string, league?: string | null): Promise<{ team: TeamRef; others: TeamRef[] } | null> {
  const ids = lgById(league) ? [lgById(league)!.id] : DEFAULT_ORDER;
  const lists = await Promise.all(ids.map((id) => teamList(lgById(id)!).catch(() => [] as TeamRef[])));
  const hits: { t: TeamRef; s: number; o: number }[] = [];
  lists.forEach((list, o) => list.forEach((t) => {
    const s = teamScore(t, q);
    if (s) hits.push({ t, s, o });
  }));
  hits.sort((a, b) => b.s - a.s || a.o - b.o);
  if (!hits.length) return null;
  return { team: hits[0].t, others: hits.slice(1, 5).filter((h) => h.s >= hits[0].s - 30).map((h) => h.t) };
}

/** Two teams in the same league (the league where both match best). */
export async function resolvePair(a: string, b: string, league?: string | null): Promise<[TeamRef, TeamRef] | null> {
  const ids = lgById(league) ? [lgById(league)!.id] : DEFAULT_ORDER;
  let best: { s: number; pair: [TeamRef, TeamRef] } | null = null;
  for (const id of ids) {
    const list = await teamList(lgById(id)!).catch(() => [] as TeamRef[]);
    const pick = (q: string) => list.map((t) => ({ t, s: teamScore(t, q) })).sort((x, y) => y.s - x.s)[0];
    const pa = pick(a), pb = pick(b);
    if (!pa?.s || !pb?.s || pa.t.id === pb.t.id) continue;
    const s = pa.s + pb.s;
    if (!best || s > best.s) best = { s, pair: [pa.t, pb.t] };
    if (s >= 180) break;
  }
  return best?.pair ?? null;
}

/* ---------------- schedules + lines ---------------- */

export type SchedGame = { neutral?: boolean; id: string; date: string; season: number; type: number; done: boolean; home: { id: string; abbr: string; score: number | null; winner: boolean }; away: { id: string; abbr: string; score: number | null; winner: boolean }; label: string };

function parseSchedule(d: Dict): SchedGame[] {
  return L(d.events).map((e0) => {
    const e = D(e0);
    const c = D(L(e.competitions)[0]);
    const side = (ha: string) => {
      const x = D(L(c.competitors).find((y) => D(y).homeAway === ha));
      const sc = D(x.score);
      return { id: S(x.id) ?? S(D(x.team).id) ?? "", abbr: S(D(x.team).abbreviation) ?? "", score: N(sc.value) ?? N(sc.displayValue) ?? N(x.score), winner: x.winner === true };
    };
    const st = D(D(c.status).type);
    return { neutral: c.neutralSite === true, id: S(e.id) ?? "", date: S(e.date) ?? "", season: N(D(e.season).year) ?? 0, type: N(D(e.seasonType).type) ?? N(D(e.seasonType).id) ?? 2, done: st.completed === true || st.state === "post", home: side("home"), away: side("away"), label: S(D(D(c.type)).text) ?? "" };
  }).filter((g) => g.id);
}

export async function schedule(l: Lg, teamId: string, season?: number, type?: number): Promise<{ year: number | null; games: SchedGame[] }> {
  const q = [season ? `season=${season}` : "", type ? `seasontype=${type}` : ""].filter(Boolean).join("&");
  const past = season && season < new Date().getFullYear() - 0;
  const d = D(await fetchJson(`${site(l)}/teams/${teamId}/schedule${q ? "?" + q : ""}`, past ? 7 * 86400 : 900).catch(() => null));
  return { year: N(D(d.season).year) ?? N(D(d.requestedSeason).year), games: parseSchedule(d) };
}

export type GameLine = { provider: string; homeSpread: number | null; total: number | null; homeMl: number | null; awayMl: number | null; spreadOpen: number | null; totalOpen: number | null };

/** The pregame line ESPN has on file for a game: DraftKings first, otherwise the first pregame book ESPN lists. */
export function gameLine(l: Lg, eventId: string, done: boolean): Promise<GameLine | null> {
  return memo(`line:${l.id}:${eventId}:${done ? 1 : 0}`, done ? 30 * 86400 : 600, async () => {
    const d = D(await fetchJson(`${core(l)}/events/${eventId}/competitions/${eventId}/odds`, done ? 30 * 86400 : 600).catch(() => null));
    const items = L(d.items).map(D);
    const it = items.find((i) => /draft\s*kings/i.test(S(D(i.provider).name) ?? "")) ?? items.find((i) => !/live/i.test(S(D(i.provider).name) ?? "") && (N(i.spread) != null || N(i.overUnder) != null));
    if (!it) return null;
    const ho = D(it.homeTeamOdds), ao = D(it.awayTeamOdds);
    const closeSpread = N(D(D(D(ho.close).pointSpread)).american);
    const openSpread = N(D(D(D(ho.open).pointSpread)).american);
    const closeTotal = N(D(D(D(it.close).total)).american);
    const openTotal = N(D(D(D(it.open).total)).american);
    return {
      provider: (S(D(it.provider).name) ?? "ESPN").replace(/^Draft\s*Kings$/i, "DraftKings"),
      homeSpread: closeSpread ?? N(it.spread),
      total: closeTotal ?? N(it.overUnder),
      homeMl: N(ho.moneyLine),
      awayMl: N(ao.moneyLine),
      spreadOpen: openSpread,
      totalOpen: openTotal,
    };
  });
}

function seasonTypes(l: Lg): (number | undefined)[] {
  return l.kind === "soccer" ? [undefined] : [2, 3];
}

/* ---------------- head to head ---------------- */

export async function headToHead(a: TeamRef, b: TeamRef, n: number) {
  const l = lgById(a.league)!;
  const cur = (await schedule(l, a.id)).year ?? new Date().getFullYear();
  const found = new Map<string, SchedGame>();
  let scanned = 0;
  for (let y = cur; y >= cur - 20 && found.size < n; y -= 3) {
    const years = [y, y - 1, y - 2].filter((x) => x >= cur - 20);
    const res = await Promise.all(years.flatMap((yy) => seasonTypes(l).map((t) => schedule(l, a.id, yy, t).catch(() => ({ year: null, games: [] as SchedGame[] })))));
    scanned += years.length;
    for (const r of res) for (const g of r.games) if (g.done && (g.home.id === b.id || g.away.id === b.id) && g.home.score != null && g.away.score != null) found.set(g.id, g);
  }
  const meetings = [...found.values()].sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, n);
  const rows = await Promise.all(
    meetings.map(async (g) => {
      const line = await gameLine(l, g.id, true).catch(() => null);
      const aHome = g.home.id === a.id;
      const aPts = (aHome ? g.home.score : g.away.score) as number;
      const bPts = (aHome ? g.away.score : g.home.score) as number;
      const aSpread = line?.homeSpread != null ? (aHome ? line.homeSpread : -line.homeSpread) : null;
      const cover = aSpread == null ? null : aPts + aSpread - bPts;
      const tot = aPts + bPts;
      return {
        date: g.date.slice(0, 10),
        season: g.season,
        type: g.type === 3 ? "postseason" : g.type === 1 ? "preseason" : "regular season",
        where: g.neutral ? "neutral site" : aHome ? `${a.abbr} home` : `${b.abbr} home`,
        score: `${a.abbr} ${aPts} - ${bPts} ${b.abbr}`,
        winner: aPts > bPts ? a.abbr : bPts > aPts ? b.abbr : "tie",
        line: line && (line.homeSpread != null || line.total != null) ? { book: line.provider, spread: aSpread != null ? `${a.abbr} ${aSpread > 0 ? "+" : ""}${aSpread}` : null, total: line.total } : null,
        ats: cover == null ? null : cover > 0 ? `${a.abbr} covered` : cover < 0 ? `${b.abbr} covered` : "push",
        totalResult: line?.total != null ? (tot > line.total ? `over (${tot} vs ${line.total})` : tot < line.total ? `under (${tot} vs ${line.total})` : `push (${tot})`) : null,
      };
    })
  );
  const aw = rows.filter((r) => r.winner === a.abbr).length, bw = rows.filter((r) => r.winner === b.abbr).length;
  const withLine = rows.filter((r) => r.ats);
  const aCov = withLine.filter((r) => r.ats === `${a.abbr} covered`).length, bCov = withLine.filter((r) => r.ats === `${b.abbr} covered`).length;
  const ou = rows.filter((r) => r.totalResult);
  return {
    teams: `${a.name} vs ${b.name}`,
    league: l.label,
    found: rows.length,
    asked: n,
    seasonsScanned: scanned,
    record: `${a.abbr} ${aw}-${bw}${rows.length - aw - bw ? `-${rows.length - aw - bw}` : ""} ${b.abbr}`,
    ats: withLine.length ? `${a.abbr} ${aCov}-${bCov}${withLine.length - aCov - bCov ? `-${withLine.length - aCov - bCov}` : ""} ATS in these ${withLine.length} meetings (lines on file)` : "No lines on file for these meetings",
    overUnder: ou.length ? `${ou.filter((r) => r.totalResult!.startsWith("over")).length} over, ${ou.filter((r) => r.totalResult!.startsWith("under")).length} under in these ${ou.length} meetings` : null,
    books: [...new Set(rows.map((r) => r.line?.book).filter(Boolean))],
    avgPoints: rows.length ? { [a.abbr]: r1(rows.reduce((s, r) => s + Number(r.score.split(" ")[1]), 0) / rows.length), [b.abbr]: r1(rows.reduce((s, r) => s + Number(r.score.split(" - ")[1].split(" ")[0]), 0) / rows.length) } : null,
    meetings: rows,
    note: rows.length < n ? `Only ${rows.length} meetings found in ESPN schedules back to ${cur - 20}.` : undefined,
  };
}

/* ---------------- team profile ---------------- */

async function linesFor(l: Lg, team: TeamRef, games: SchedGame[]) {
  const rows = await Promise.all(
    games.map(async (g) => {
      const line = await gameLine(l, g.id, true).catch(() => null);
      if (!line) return null;
      const home = g.home.id === team.id;
      const us = (home ? g.home.score : g.away.score) ?? 0, them = (home ? g.away.score : g.home.score) ?? 0;
      const sp = line.homeSpread == null ? null : home ? line.homeSpread : -line.homeSpread;
      return { ats: sp == null ? null : Math.sign(us + sp - them), ou: line.total == null ? null : Math.sign(us + them - line.total), book: line.provider };
    })
  );
  const ok = rows.filter((r): r is NonNullable<typeof r> => !!r);
  const a = ok.filter((r) => r.ats != null), o = ok.filter((r) => r.ou != null);
  const rec = (xs: number[], w: string, lo: string) => `${xs.filter((x) => x > 0).length}-${xs.filter((x) => x < 0).length}${xs.some((x) => x === 0) ? `-${xs.filter((x) => x === 0).length}` : ""} ${w}/${lo}`;
  return {
    games: games.length,
    withLine: ok.length,
    ats: a.length ? rec(a.map((r) => r.ats!), "cover", "no cover") : null,
    overUnder: o.length ? rec(o.map((r) => r.ou!), "over", "under") : null,
    books: [...new Set(ok.map((r) => r.book))],
  };
}

export async function teamProfile(team: TeamRef) {
  const l = lgById(team.league)!;
  const [info, sched] = await Promise.all([fetchJson(`${site(l)}/teams/${team.id}`, 1800).catch(() => null), schedule(l, team.id).catch(() => ({ year: null, games: [] as SchedGame[] }))]);
  const t = D(D(info).team);
  const records = L(D(t.record).items).map((x0) => {
    const x = D(x0);
    const st: Record<string, number | null> = {};
    for (const s of L(x.stats).map(D)) {
      const k = S(s.name);
      if (k && /^(avgPointsFor|avgPointsAgainst|differential|pointDifferential|streak|winPercent|playoffSeed|gamesBehind|divisionWinPercent)$/.test(k)) st[k] = N(s.value);
    }
    return { type: S(x.description) ?? S(x.type), record: S(x.summary), ...st };
  });
  let games = sched.games;
  let season = sched.year;
  if (!games.some((g) => g.done) && sched.year) {
    const prev = await schedule(l, team.id, sched.year - 1, l.kind === "soccer" ? undefined : 2).catch(() => null);
    if (prev) { games = prev.games; season = sched.year - 1; }
  }
  const done = games.filter((g) => g.done && g.home.score != null);
  const recent = done.slice(-10).reverse().map((g) => {
    const home = g.home.id === team.id;
    const us = home ? g.home : g.away, them = home ? g.away : g.home;
    return { date: g.date.slice(0, 10), opp: `${home ? "vs" : "@"} ${them.abbr}`, result: `${(us.score ?? 0) > (them.score ?? 0) ? "W" : (us.score ?? 0) < (them.score ?? 0) ? "L" : "T"} ${us.score}-${them.score}` };
  });
  const lineSample = football(l) ? done : done.slice(-15);
  const lines = await linesFor(l, team, lineSample).catch(() => null);
  const next = D(L(t.nextEvent)[0]);
  return {
    team: team.name,
    league: l.label,
    season,
    standing: S(t.standingSummary),
    records,
    recentForm: recent,
    last5: recent.slice(0, 5).map((r) => r.result[0]).join(""),
    atsAndTotals: lines ? { sample: football(l) ? `this season (${lines.games} games)` : `last ${lines.games} games`, ...lines } : null,
    nextGame: S(next.id) ? { id: S(next.id), name: S(next.shortName), date: S(next.date) } : null,
  };
}

/* ---------------- team stats (all teams, own + opponent) ---------------- */

export type StatCell = { side: "team" | "opponent"; cat: string; name: string; label: string; value: number; display: string };
type TeamStats = { id: string; abbr: string; name: string; stats: StatCell[] };

async function byTeamOnce(l: Lg, season: number | null, type: number | null): Promise<{ season: string; rows: TeamStats[] }> {
  const q = [season ? `season=${season}` : "", type ? `seasontype=${type}` : "", "limit=400"].filter(Boolean).join("&");
  const d = D(await fetchJson(`${web(l)}/statistics/byteam?${q}`, 3 * 3600));
  const cats = L(d.categories).map(D);
  const rows: TeamStats[] = L(d.teams).map((t0) => {
    const t = D(t0);
    const team = D(t.team);
    const stats: StatCell[] = [];
    for (const c of L(t.categories).map(D)) {
      const side = /^opponent/i.test(S(c.displayName) ?? "") ? "opponent" : "team";
      const name = S(c.name) ?? "";
      const meta = cats.find((x) => S(x.name) === name && L(x.names).length) ?? {};
      const names = L(meta.names).map((x) => S(x) ?? "");
      const labels = L(meta.displayNames).map((x) => S(x) ?? "");
      const vals = L(c.values), disp = L(c.totals);
      names.forEach((nm, i) => {
        const v = N(vals[i]);
        if (v == null || stats.some((s) => s.side === side && s.name === nm)) return;
        stats.push({ side, cat: name, name: nm, label: labels[i] ?? nm, value: v, display: S(disp[i]) ?? String(v) });
      });
    }
    return { id: S(team.id) ?? "", abbr: S(team.abbreviation) ?? "", name: S(team.displayName) ?? "", stats };
  }).filter((r) => r.id);
  return { season: S(D(d.requestedSeason).displayName) ?? String(season ?? ""), rows };
}

const gp = (r: TeamStats) => r.stats.find((s) => s.side === "team" && /^(gamesPlayed|games)$/.test(s.name))?.value ?? null;

/** Every team's stats for the latest season with games played (regular season). */
export function allTeamStats(l: Lg): Promise<{ season: string; rows: TeamStats[] }> {
  return memo(`byteam:${l.id}`, 3 * 3600, async () => {
    const d = D(await fetchJson(`${web(l)}/statistics/byteam?limit=1`, 3 * 3600).catch(() => null));
    const cur = N(D(d.currentSeason).year) ?? new Date().getFullYear();
    for (const [y, t] of [[cur, 2], [cur, null], [cur - 1, 2]] as [number, number | null][]) {
      const r = await byTeamOnce(l, y, t).catch(() => null);
      if (r && r.rows.length && r.rows.some((x) => (gp(x) ?? 1) > 0)) return r;
    }
    throw new Error("no team stats");
  });
}

const STOP = new Set(["per", "game", "the", "a", "of", "by", "team", "teams", "allowed", "allow", "opponent", "opponents", "defense", "defensive", "most", "least", "fewest", "avg", "average", "total", "pg", "and", "in"]);
function statMatch(cells: StatCell[], words: string, side: "team" | "opponent" | null): StatCell[] {
  const q = norm(words);
  const toks = q.split(" ").filter((w) => w && !STOP.has(w));
  const perGame = /per game|pg\b|avg|average|a game/.test(q);
  const pct = /pct|percent|%/.test(words.toLowerCase());
  const scored = cells.filter((c) => !side || c.side === side).map((c) => {
    const lab = norm(`${c.label} ${c.name.replace(/([A-Z])/g, " $1")}`);
    let s = 0;
    for (const t of toks) if (lab.split(" ").some((w) => w === t || (t.length > 3 && (w.startsWith(t) || t.startsWith(w)) && w.length > 2))) s += 2;
    if (perGame === /per game|avg/.test(lab)) s += 1;
    if (pct === /percent|pct/.test(lab)) s += 1;
    if (/^net/.test(c.name) && /passing/.test(q)) s += 0.5;
    if (toks.includes("against") && !lab.includes("against") && c.side === "opponent") s += 2;
    return { c, s };
  }).filter((x) => x.s >= Math.max(2, toks.length * 2 - 1));
  scored.sort((a, b) => b.s - a.s);
  return scored.map((x) => x.c);
}

export async function teamStatRank(l: Lg, stat: string, side: "team" | "opponent", order: "most" | "least", team: TeamRef | null, top: number) {
  const { season, rows } = await allTeamStats(l);
  if (!rows.length) return { missing: `ESPN has no team stats for ${l.label} right now.` };
  const pool = rows[0].stats;
  const matches = statMatch(pool, stat, side);
  if (!matches.length) {
    return { missing: `No ${side === "opponent" ? "allowed/opponent " : ""}stat matching "${stat}" in ESPN's ${l.label} team stats.`, available: [...new Set(pool.filter((c) => c.side === side).map((c) => c.label))].slice(0, 80) };
  }
  const m = matches[0];
  const vals = rows.map((r) => ({ r, c: r.stats.find((s) => s.side === m.side && s.name === m.name) })).filter((x) => x.c);
  vals.sort((a, b) => (order === "most" ? b.c!.value - a.c!.value : a.c!.value - b.c!.value));
  const rankOf = (id: string) => {
    const v = vals.find((x) => x.r.id === id)?.c?.value;
    return v == null ? null : 1 + vals.filter((x) => (order === "most" ? x.c!.value > v : x.c!.value < v)).length;
  };
  const mine = team ? vals.find((x) => x.r.id === team.id) : null;
  return {
    stat: `${m.side === "opponent" ? "Opponent " : ""}${m.label}`,
    meaning: m.side === "opponent" ? "what opponents did against this team (allowed)" : "the team's own number",
    season,
    teams: vals.length,
    order: order === "most" ? "rank 1 = highest" : "rank 1 = lowest",
    team: mine ? { team: mine.r.name, value: mine.c!.display, rank: rankOf(mine.r.id) } : team ? { team: team.name, missing: "no value from ESPN" } : undefined,
    leaderboard: vals.slice(0, Math.min(Math.max(top, 3), 32)).map((x, i) => ({ rank: i + 1, team: x.r.abbr, value: x.c!.display })),
    otherMatches: matches.slice(1, 5).map((c) => `${c.side === "opponent" ? "Opponent " : ""}${c.label}`),
  };
}

type DefKey = { side: "team" | "opponent"; name: string; label: string; better: "low" | "high"; perGameFrom?: string };
const DEF: Record<string, DefKey[]> = {
  football: [
    { side: "opponent", name: "totalPointsPerGame", label: "Points allowed per game", better: "low" },
    { side: "opponent", name: "yardsPerGame", label: "Total yards allowed per game", better: "low" },
    { side: "opponent", name: "netPassingYardsPerGame", label: "Passing yards allowed per game (net)", better: "low" },
    { side: "opponent", name: "passingYardsPerGame", label: "Passing yards allowed per game (gross)", better: "low" },
    { side: "opponent", name: "rushingYardsPerGame", label: "Rushing yards allowed per game", better: "low" },
    { side: "opponent", name: "yardsPerRushAttempt", label: "Yards per carry allowed", better: "low" },
    { side: "opponent", name: "yardsPerPassAttempt", label: "Yards per pass attempt allowed", better: "low" },
    { side: "opponent", name: "sacks", label: "Sacks (by this defense)", better: "high" },
    { side: "team", name: "totalTakeaways", label: "Takeaways", better: "high" },
    { side: "team", name: "interceptions", label: "Interceptions (by this defense)", better: "high" },
    { side: "opponent", name: "thirdDownConvPct", label: "Opponent 3rd-down conversion %", better: "low" },
    { side: "opponent", name: "passingTouchdowns", label: "Passing TDs allowed", better: "low" },
    { side: "opponent", name: "rushingTouchdowns", label: "Rushing TDs allowed", better: "low" },
  ],
  basketball: [
    { side: "opponent", name: "avgPoints", label: "Opponent points per game", better: "low" },
    { side: "opponent", name: "fieldGoalPct", label: "Opponent FG%", better: "low" },
    { side: "opponent", name: "threePointFieldGoalPct", label: "Opponent 3P%", better: "low" },
    { side: "opponent", name: "avgThreePointFieldGoalsMade", label: "Opponent 3s made per game", better: "low" },
    { side: "opponent", name: "avgRebounds", label: "Opponent rebounds per game", better: "low" },
    { side: "opponent", name: "avgTurnovers", label: "Turnovers forced per game", better: "high" },
    { side: "team", name: "avgSteals", label: "Steals per game", better: "high" },
    { side: "team", name: "avgBlocks", label: "Blocks per game", better: "high" },
  ],
  hockey: [
    { side: "team", name: "avgGoalsAgainst", label: "Goals against per game", better: "low" },
    { side: "team", name: "shotsAgainst", label: "Shots against per game", better: "low", perGameFrom: "games" },
    { side: "team", name: "savePct", label: "Save %", better: "high" },
    { side: "team", name: "penaltyKillPct", label: "Penalty kill %", better: "high" },
    { side: "team", name: "shutouts", label: "Shutouts", better: "high" },
  ],
  baseball: [
    { side: "team", name: "ERA", label: "Team ERA", better: "low" },
    { side: "team", name: "opponentAvg", label: "Opponent batting average", better: "low" },
    { side: "team", name: "WHIP", label: "WHIP", better: "low" },
    { side: "team", name: "earnedRuns", label: "Earned runs allowed", better: "low" },
    { side: "team", name: "homeRuns", label: "Home runs allowed", better: "low" },
    { side: "team", name: "strikeouts", label: "Pitching strikeouts", better: "high" },
    { side: "team", name: "qualityStarts", label: "Quality starts", better: "high" },
  ],
};

/** NFL/NCAAF red-zone and 3rd-down defense from the per-team stats page (not in the all-teams table). */
function redZone(l: Lg, teamId: string) {
  return memo(`rz:${l.id}:${teamId}`, 6 * 3600, async () => {
    const d = D(await fetchJson(`${site(l)}/teams/${teamId}/statistics`, 6 * 3600));
    const opp = L(D(d.results).opponent).map(D);
    const misc = L(opp.find((c) => c.name === "miscellaneous")?.stats).map(D);
    const get = (n: string) => N(misc.find((s) => s.name === n)?.value);
    return { rzScoring: get("redzoneScoringPct"), rzTd: get("redzoneTouchdownPct") };
  });
}

export async function teamDefense(team: TeamRef) {
  const l = lgById(team.league)!;
  const keys = DEF[l.sport];
  if (!keys) return { missing: `No defensive table for ${l.label} on ESPN.` };
  const { season, rows } = await allTeamStats(l);
  const me = rows.find((r) => r.id === team.id);
  if (!me) return { missing: `ESPN's ${l.label} team stats don't list ${team.name}.` };
  const val = (r: TeamStats, k: DefKey) => {
    const c = r.stats.find((s) => s.side === k.side && s.name === k.name);
    if (!c) return null;
    if (k.perGameFrom) {
      const g = r.stats.find((s) => s.side === "team" && s.name === k.perGameFrom)?.value;
      return g ? { value: c.value / g, display: String(r1(c.value / g)) } : null;
    }
    return { value: c.value, display: c.display };
  };
  const out = keys.map((k) => {
    const v = val(me, k);
    if (!v) return null;
    const all = rows.map((r) => val(r, k)?.value).filter((x): x is number => x != null);
    const rank = 1 + all.filter((x) => (k.better === "low" ? x < v.value : x > v.value)).length;
    return { stat: k.label, value: v.display, rank: `${rank} of ${all.length}`, rankMeaning: k.better === "low" ? "1 = fewest" : "1 = most" };
  }).filter(Boolean);
  let redzone: unknown = null;
  if (football(l)) {
    const mine = await redZone(l, team.id).catch(() => null);
    if (mine?.rzScoring != null || mine?.rzTd != null) {
      let rank: string | null = null;
      if (l.id === "nfl") {
        const all = await Promise.all(rows.map((r) => redZone(l, r.id).catch(() => null)));
        const xs = all.map((x) => x?.rzTd).filter((x): x is number => x != null);
        if (mine.rzTd != null && xs.length > 10) rank = `${1 + xs.filter((x) => x < mine.rzTd!).length} of ${xs.length} (1 = lowest TD %)`;
      }
      redzone = { opponentRedZoneScoringPct: mine.rzScoring, opponentRedZoneTdPct: mine.rzTd, tdPctRank: rank };
    }
  }
  return { team: team.name, league: l.label, season, defense: out, redZone: redzone, source: "ESPN team stats (opponent splits = allowed)" };
}

/* ---------------- standings ---------------- */

export function standings(l: Lg) {
  return memo(`stand:${l.id}`, 1800, async () => {
    const d = D(await fetchJson(`https://site.api.espn.com/apis/v2/sports/${l.sport}/${l.slug}/standings`, 1800));
    const groups: { group: string; teams: Record<string, string | number | null>[] }[] = [];
    const walk = (x: Dict, name: string) => {
      const entries = L(D(x.standings).entries).map(D);
      if (entries.length) {
        groups.push({
          group: name,
          teams: entries.map((e) => {
            const row: Record<string, string | number | null> = { team: S(D(e.team).abbreviation) ?? S(D(e.team).displayName) };
            for (const s of L(e.stats).map(D)) {
              const k = S(s.name) ?? S(s.type);
              if (!k) continue;
              if (/^(wins|losses|ties|otLosses|winPercent|gamesBehind|streak|pointsFor|pointsAgainst|differential|pointDifferential|playoffSeed|points|avgPointsFor|avgPointsAgainst)$/.test(k)) row[k] = S(s.displayValue) ?? N(s.value);
              if (S(s.type) === "home" || S(s.type) === "road" || S(s.type) === "total" || S(s.name) === "overall" || S(s.type) === "lasttengames") row[S(s.type) ?? k] = S(s.summary) ?? S(s.displayValue);
            }
            return row;
          }),
        });
      }
      for (const c of L(x.children).map(D)) walk(c, S(c.name) ?? S(c.abbreviation) ?? name);
    };
    walk(d, S(d.name) ?? l.label);
    if (!groups.length) throw new Error("no standings");
    return { season: S(D(L(d.children)[0] ? D(D(L(d.children)[0]).standings) : {}).seasonDisplayName) ?? null, groups };
  });
}

/* ---------------- injuries + depth ---------------- */

export function leagueInjuries(l: Lg) {
  return memo(`inj:${l.id}`, 1800, async () => {
    const d = D(await fetchJson(`${site(l)}/injuries`, 1800));
    if (!L(d.injuries).length) throw new Error("no injuries");
    return L(d.injuries).map(D).map((t) => ({
      teamId: S(t.id) ?? "",
      team: S(t.displayName) ?? "",
      players: L(t.injuries).map(D).map((i) => ({
        name: S(D(i.athlete).displayName),
        pos: S(D(D(i.athlete).position).abbreviation),
        status: S(i.status),
        injury: S(D(i.details).type),
        returnDate: S(D(i.details).returnDate),
        note: (S(i.shortComment) ?? "").slice(0, 160) || null,
        updated: S(i.date)?.slice(0, 10) ?? null,
      })),
    }));
  });
}

export async function depthChart(team: TeamRef) {
  const l = lgById(team.league)!;
  const d = D(await fetchJson(`${site(l)}/teams/${team.id}/depthcharts`, 6 * 3600).catch(() => null));
  const charts = L(d.depthchart).map(D);
  if (charts.length) {
    return {
      team: team.name,
      units: charts.map((c) => ({
        unit: S(c.name),
        positions: Object.entries(D(c.positions)).map(([k, v]) => ({ pos: S(D(D(v).position).abbreviation) ?? k.toUpperCase(), players: L(D(v).athletes).slice(0, 3).map((a) => S(D(a).displayName)).filter(Boolean) })),
      })),
    };
  }
  const r = D(await fetchJson(`${site(l)}/teams/${team.id}/roster`, 6 * 3600).catch(() => null));
  const flat: Dict[] = [];
  for (const g of L(r.athletes).map(D)) {
    if (Array.isArray(g.items)) flat.push(...L(g.items).map(D));
    else flat.push(g);
  }
  if (!flat.length) return { missing: `ESPN has no depth chart or roster for ${team.name}.` };
  return { team: team.name, note: "ESPN has no depth chart for this league; roster by position instead.", roster: flat.slice(0, 40).map((p) => `${S(p.displayName)} (${S(D(p.position).abbreviation) ?? "?"}${S(D(p.injuries && L(p.injuries)[0]).status) ? ", " + S(D(L(p.injuries)[0]).status) : ""})`) };
}

/* ---------------- matchup preview ---------------- */

export async function matchupPreview(l: Lg, eventId: string) {
  const d = D(await fetchJson(`${site(l)}/summary?event=${eventId}`, 300));
  if (!Object.keys(d).length) return { missing: "ESPN has no summary for that game id." };
  const comp = D(L(D(d.header).competitions)[0]);
  const cs = L(comp.competitors).map(D);
  const home = cs.find((c) => c.homeAway === "home") ?? {}, away = cs.find((c) => c.homeAway === "away") ?? {};
  const ab = (c: Dict) => S(D(c.team).abbreviation) ?? "";
  const pred = D(d.predictor);
  const gi = D(d.gameInfo);
  const w = D(gi.weather);
  const pc = L(d.pickcenter).map(D);
  const dk = pc.find((p) => /draft/i.test(S(D(p.provider).name) ?? "")) ?? null;
  const line = await gameLine(l, eventId, false).catch(() => null);
  const inj = L(d.injuries).map(D).map((t) => ({ team: S(D(t.team).abbreviation), out: L(t.injuries).map(D).map((i) => `${S(D(i.athlete).displayName)} (${S(D(D(i.athlete).position).abbreviation) ?? "?"}) ${S(i.status) ?? ""}`.trim()).slice(0, 10) }));
  const leaders = L(d.leaders).map(D).map((t) => ({
    team: S(D(t.team).abbreviation),
    leaders: L(t.leaders).map(D).slice(0, 4).map((c) => `${S(c.displayName)}: ${S(D(D(L(c.leaders)[0]).athlete).displayName) ?? "?"} ${S(D(L(c.leaders)[0]).displayValue) ?? ""}`.trim()),
  }));
  const five = L(d.lastFiveGames).map(D).map((t) => ({ team: S(D(t.team).abbreviation), games: L(t.events).map(D).map((e) => `${S(e.gameResult) ?? "?"} ${S(e.score) ?? ""} ${S(e.atVs) ?? ""} ${S(D(e.opponent).abbreviation) ?? ""}`.replace(/\s+/g, " ").trim()) }));
  const series = L(d.seasonseries).map(D).map((s) => ({ summary: S(s.summary), games: L(s.events).map(D).map((e) => `${S(e.date)?.slice(0, 10)} ${L(e.competitors).map(D).map((c) => `${S(D(c.team).abbreviation)} ${S(c.score)}`).join(" - ")}`) }));
  const st = D(D(comp.status).type);
  return {
    game: `${ab(away)} @ ${ab(home)}`,
    start: S(comp.date),
    state: S(st.state),
    status: S(st.shortDetail),
    records: { [ab(away)]: S(D(L(away.record)[0]).summary), [ab(home)]: S(D(L(home.record)[0]).summary) },
    espnMatchupPredictor: S(D(pred.homeTeam).gameProjection) ? { [ab(home)]: `${S(D(pred.homeTeam).gameProjection)}%`, [ab(away)]: `${S(D(pred.awayTeam).gameProjection)}%` } : null,
    draftKings: dk
      ? {
          spread: S(dk.details),
          total: N(dk.overUnder),
          moneyline: { [ab(home)]: N(D(dk.homeTeamOdds).moneyLine), [ab(away)]: N(D(dk.awayTeamOdds).moneyLine) },
          homeSpreadOpen: line?.spreadOpen ?? null,
          homeSpreadNow: line?.homeSpread ?? null,
          totalOpen: line?.totalOpen ?? null,
          totalNow: line?.total ?? null,
        }
      : line ? { book: line.provider, homeSpread: line.homeSpread, total: line.total, homeSpreadOpen: line.spreadOpen, totalOpen: line.totalOpen } : null,
    venue: S(D(gi.venue).fullName) ? { name: S(D(gi.venue).fullName), city: [S(D(D(gi.venue).address).city), S(D(D(gi.venue).address).state)].filter(Boolean).join(", "), grass: D(gi.venue).grass ?? null, indoor: D(gi.venue).indoor ?? null } : null,
    weather: Object.keys(w).length ? { tempF: N(w.temperature), precipChancePct: N(w.precipitation), gustMph: N(w.gust), condition: S(w.displayValue) } : null,
    injuries: inj,
    seasonLeaders: leaders,
    lastFive: five,
    seasonSeries: series.length ? series : null,
    broadcast: L(d.broadcasts).map(D).map((b) => S(b.media && D(b.media).shortName) ?? S(L(b.names)[0])).filter(Boolean),
  };
}

/* ---------------- league leaders ---------------- */

export function leagueLeaders(l: Lg) {
  return memo(`leaders:${l.id}`, 3 * 3600, async () => {
    let d = D(await fetchJson(`https://site.api.espn.com/apis/site/v3/sports/${l.sport}/${l.slug}/leaders?limit=10`, 3 * 3600).catch(() => null));
    let cats = L(D(d.leaders).categories).map(D);
    const cur = N(D(d.currentSeason).year);
    if (!cats.length || cats.every((c) => !L(c.leaders).length)) {
      if (cur) {
        d = D(await fetchJson(`https://site.api.espn.com/apis/site/v3/sports/${l.sport}/${l.slug}/leaders?limit=10&season=${cur - 1}&seasontype=2`, 6 * 3600).catch(() => null));
        cats = L(D(d.leaders).categories).map(D);
      }
    }
    if (!cats.length) throw new Error("no leaders");
    return {
      season: S(D(d.requestedSeason).displayName),
      categories: cats.map((c) => ({
        stat: S(c.displayName) ?? S(c.name),
        key: S(c.name),
        top: L(c.leaders).slice(0, 10).map(D).map((x, i) => `${i + 1}. ${S(D(x.athlete).displayName)} (${S(D(x.team).abbreviation) ?? "?"}) ${S(x.displayValue)}`),
      })),
    };
  });
}

/* ---------------- players ---------------- */

export type PlayerRef = { id: string; league: string; name: string };

export function athleteInfo(l: Lg, id: string) {
  return memo(`ath:${l.id}:${id}`, 6 * 3600, async () => {
    const a = D(D(await fetchJson(`${web(l)}/athletes/${id}`, 6 * 3600).catch(() => null)).athlete);
    return { name: S(a.displayName), team: S(D(a.team).abbreviation), teamId: S(D(a.team).id), position: S(D(a.position).abbreviation), status: S(D(a.status).name), injury: S(D(L(a.injuries)[0]).status) };
  });
}

async function seasonLog(l: Lg, id: string, season: number | null, key: string) {
  const d = await fetchJson(`${web(l)}/athletes/${id}/gamelog${season ? `?season=${season}` : ""}`, season && season < new Date().getFullYear() ? 7 * 86400 : 900).catch(() => null);
  if (!d) return { season, games: [] as ReturnType<typeof parseGameLog> };
  return { season: N(D(L(D(d).seasonTypes)[0]).displaySeason) ?? season, games: parseGameLog(d, key) };
}

/** Game log for one stat. vsTeam scans back up to 6 seasons for games against that team. */
export async function playerLog(l: Lg, p: PlayerRef, key: string, label: string, opts: { last?: number; vsAbbr?: string | null; line?: number | null; seasons?: number }) {
  const info = await athleteInfo(l, p.id).catch(() => null);
  const cur = await seasonLog(l, p.id, null, key);
  let games = cur.games;
  const thisYear = new Date().getFullYear() + (l.sport === "basketball" || l.sport === "hockey" ? 1 : 0);
  const want = Math.max(1, Math.min(opts.seasons ?? (opts.vsAbbr ? 6 : 1), 8));
  if (want > 1 || (!games.length)) {
    const years = Array.from({ length: want }, (_, i) => thisYear - 1 - i);
    const older = await Promise.all(years.map((y) => seasonLog(l, p.id, y, key)));
    const seen = new Set(games.map((g) => g.date + g.opp));
    for (const o of older) for (const g of o.games) if (!seen.has(g.date + g.opp)) { seen.add(g.date + g.opp); games.push(g); }
    games = games.sort((a, b) => (a.date < b.date ? 1 : -1));
  }
  let pool = games;
  if (opts.vsAbbr) pool = games.filter((g) => g.opp.toUpperCase() === opts.vsAbbr!.toUpperCase());
  const lastN = Math.max(1, Math.min(opts.last ?? (opts.vsAbbr ? 20 : 10), 40));
  const shown = pool.slice(0, lastN);
  const avg = (xs: number[]) => (xs.length ? r1(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  const vals = shown.map((g) => g.value);
  const thisSeason = cur.games.map((g) => g.value);
  const line = opts.line ?? null;
  const hit = (xs: number[]) => (line == null || !xs.length ? null : { over: xs.filter((x) => x > line).length, under: xs.filter((x) => x < line).length, push: xs.filter((x) => x === line).length, games: xs.length, overPct: Math.round((100 * xs.filter((x) => x > line).length) / xs.length) });
  return {
    player: info?.name ?? p.name,
    team: info?.team ?? null,
    position: info?.position ?? null,
    injuryStatus: info?.injury ?? null,
    league: l.label,
    stat: label,
    filter: opts.vsAbbr ? `games vs ${opts.vsAbbr.toUpperCase()}` : `last ${lastN}`,
    games: shown.map((g) => ({ date: g.date.slice(0, 10), opp: `${g.home ? "vs" : "@"} ${g.opp}`, value: g.value, ...(line != null ? { vsLine: g.value > line ? "over" : g.value < line ? "under" : "push" } : {}) })),
    avgShown: avg(vals),
    last5Avg: avg(pool.slice(0, 5).map((g) => g.value)),
    seasonAvg: avg(thisSeason),
    seasonGames: thisSeason.length,
    high: vals.length ? Math.max(...vals) : null,
    low: vals.length ? Math.min(...vals) : null,
    hitRate: line != null ? { line, shown: hit(vals), last5: hit(pool.slice(0, 5).map((g) => g.value)), season: hit(thisSeason) } : undefined,
    missing: !shown.length ? (opts.vsAbbr ? `No games vs ${opts.vsAbbr} in ESPN logs over the last ${want} seasons.` : "ESPN has no games logged for this stat.") : undefined,
  };
}

type FullRow = { date: string; opp: string; home: boolean; result: string | null; stats: Record<string, string> };

async function fullSeason(l: Lg, id: string, season: number | null): Promise<{ labels: string[]; rows: FullRow[] }> {
  const d = D(await fetchJson(`${web(l)}/athletes/${id}/gamelog${season ? `?season=${season}` : ""}`, season && season < new Date().getFullYear() ? 7 * 86400 : 900).catch(() => null));
  const labels = L(d.labels).map((x) => S(x) ?? "");
  const meta = D(d.events);
  const rows: FullRow[] = [];
  const seen = new Set<string>();
  for (const st of L(d.seasonTypes).map(D)) {
    if (/preseason|spring/i.test(S(st.displayName) ?? "")) continue;
    for (const c of L(st.categories).map(D)) {
      for (const e of L(c.events).map(D)) {
        const eid = S(e.eventId);
        if (!eid || seen.has(eid)) continue;
        seen.add(eid);
        const m = D(meta[eid]);
        const vals = L(e.stats).map((x) => S(x) ?? "");
        const stats: Record<string, string> = {};
        labels.forEach((lab, i) => { if (lab && vals[i] != null && !(lab in stats)) stats[lab] = vals[i]; });
        rows.push({ date: (S(m.gameDate) ?? "").slice(0, 10), opp: S(D(m.opponent).abbreviation) ?? "", home: S(m.atVs) === "vs", result: S(m.gameResult) ? `${S(m.gameResult)} ${S(m.score) ?? ""}`.trim() : null, stats });
      }
    }
  }
  return { labels, rows };
}

/** Full box-score lines per game (every column ESPN logs), optional opponent filter across seasons, with per-column averages. */
export async function playerGames(l: Lg, p: PlayerRef, opts: { last?: number; vsAbbr?: string | null; seasons?: number }) {
  const info = await athleteInfo(l, p.id).catch(() => null);
  const thisYear = new Date().getFullYear() + (l.sport === "basketball" || l.sport === "hockey" ? 1 : 0);
  const want = Math.max(1, Math.min(opts.seasons ?? (opts.vsAbbr ? 6 : 1), 8));
  const cur = await fullSeason(l, p.id, null);
  const labels = cur.labels;
  let rows = cur.rows;
  if (want > 1 || !rows.length) {
    const older = await Promise.all(Array.from({ length: want }, (_, i) => fullSeason(l, p.id, thisYear - 1 - i)));
    const seen = new Set(rows.map((r) => r.date + r.opp));
    for (const o of older) for (const r of o.rows) if (!seen.has(r.date + r.opp)) { seen.add(r.date + r.opp); rows.push(r); }
  }
  rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  const pool = opts.vsAbbr ? rows.filter((r) => r.opp.toUpperCase() === opts.vsAbbr!.toUpperCase()) : rows;
  const shown = pool.slice(0, Math.max(1, Math.min(opts.last ?? (opts.vsAbbr ? 15 : 10), 30)));
  const avgs: Record<string, number> = {};
  for (const lab of labels) {
    const xs = shown.map((r) => N(r.stats[lab])).filter((x): x is number => x != null);
    if (xs.length === shown.length && xs.length && !/%|PCT|AVG|ERA|WHIP/i.test(lab)) avgs[lab] = r1(xs.reduce((a, b) => a + b, 0) / xs.length);
  }
  return {
    player: info?.name ?? p.name,
    team: info?.team ?? null,
    position: info?.position ?? null,
    league: l.label,
    filter: opts.vsAbbr ? `games vs ${opts.vsAbbr.toUpperCase()} (last ${want} seasons)` : `last ${shown.length} games`,
    found: pool.length,
    averagesShown: avgs,
    games: shown.map((r) => ({ date: r.date, opp: `${r.home ? "vs" : "@"} ${r.opp}`, result: r.result, line: labels.filter((x) => r.stats[x] != null && r.stats[x] !== "").map((x) => `${x} ${r.stats[x]}`).join(", ") })),
    missing: shown.length ? undefined : opts.vsAbbr ? `No games vs ${opts.vsAbbr} in ESPN logs over the last ${want} seasons.` : "ESPN has no game log for this player.",
  };
}

export async function playerSplits(l: Lg, p: PlayerRef) {
  const d = D(await fetchJson(`${web(l)}/athletes/${p.id}/splits`, 3 * 3600).catch(() => null));
  const labels = L(d.labels).map((x) => S(x) ?? "");
  const cats = L(d.splitCategories).map(D);
  if (!cats.length) return { missing: "ESPN has no splits for this player." };
  const info = await athleteInfo(l, p.id).catch(() => null);
  let budget = 40;
  return {
    player: info?.name ?? p.name,
    team: info?.team,
    season: S(d.displayName),
    columns: labels,
    columnNames: L(d.displayNames).map((x) => S(x)),
    splits: cats.flatMap((c) => L(c.splits).map(D).map((s) => ({ group: S(c.displayName) ?? S(c.name), split: S(s.displayName), stats: L(s.stats).map((x) => S(x)) }))).filter(() => budget-- > 0),
  };
}

export const _test = { teamScore, statMatch, parseSchedule };
export { r3 };
