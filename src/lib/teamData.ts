import "server-only";
import { chatEnabled, redis } from "@/lib/chat";
import { getJson, getSlate } from "@/lib/espn";
import {
  boards,
  parseDkOdds,
  parseDkSplits,
  parseFinals,
  summarize,
  TD_LEAGUES,
  tdLeague,
  type Board,
  type DkLine,
  type DkSplitEvent,
  dkWhen,
  gradeLean,
  moneyBoard,
  snapOf,
  type MlEvent,
  type TdGame,
  type TdLeagueCfg,
  type TdSeason,
  type TeamSummary,
} from "@/lib/teamDataCore";

/**
 * VIP Data store (Upstash):
 *  pj:td:g:<lg>:<season>      hash eventId -> TdGame (finals, DraftKings close when ESPN has it)
 *  pj:td:done:<lg>:<season>   set of finished day/week units (never refetched)
 *  pj:td:meta:<lg>            hash abbr -> {name, logo}
 *  pj:td:out:<lg>:<season>    league summary (boards, team list, counts, refreshed at)
 *  pj:td:team:<lg>:<season>:<abbr>  team summary
 */
const K = {
  g: (l: string, s: string) => `pj:td:g:${l}:${s}`,
  done: (l: string, s: string) => `pj:td:done:${l}:${s}`,
  meta: (l: string) => `pj:td:meta:${l}`,
  out: (l: string, s: string) => `pj:td:out:${l}:${s}`,
  team: (l: string, s: string, t: string) => `pj:td:team:${l}:${s}:${t}`,
  lock: "pj:td:lock",
  live: (l: string, id: string) => `pj:td:live:${l}:${id}`,
  splits: (l: string) => `pj:td:dks:${l}`,
};

export type TeamMeta = { name: string; logo: string | null };
export type LeagueOut = {
  league: string;
  season: string;
  seasonLabel: string;
  at: string;
  games: number;
  withLines: number;
  first: string | null;
  last: string | null;
  boards: Board[];
  teams: { abbr: string; name: string; logo: string | null; su: string; ats: string; ou: string; n: number }[];
};

const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }).replaceAll("-", "");
const addDays = (s: string, n: number) => {
  const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8) + n));
  return d.toISOString().slice(0, 10).replaceAll("-", "");
};
const base = (c: TdLeagueCfg) => `https://site.api.espn.com/apis/site/v2/sports/${c.sport}/${c.slug}`;

export function activeSeasons(c: TdLeagueCfg, today = ymd(new Date())): TdSeason[] {
  return c.seasons.filter((s) => s.start <= today);
}

type Unit = { key: string; url: string; lastDay: string | null };
function units(c: TdLeagueCfg, s: TdSeason, today: string): Unit[] {
  const g = c.groups ? `&groups=${c.groups}` : "";
  if (s.weeks) {
    const out: Unit[] = [];
    const yr = s.key;
    for (let w = 1; w <= s.weeks.weeks; w++) out.push({ key: `w2-${w}`, url: `${base(c)}/scoreboard?dates=${yr}&seasontype=2&week=${w}&limit=300${g}`, lastDay: null });
    for (let w = 1; w <= (c.id === "nfl" ? 5 : 1); w++) out.push({ key: `w3-${w}`, url: `${base(c)}/scoreboard?dates=${yr}&seasontype=3&week=${w}&limit=300${g}`, lastDay: null });
    return out;
  }
  const out: Unit[] = [];
  const end = s.end < today ? s.end : today;
  for (let d = s.start; d <= end; d = addDays(d, 1)) out.push({ key: d, url: `${base(c)}/scoreboard?dates=${d}&limit=300${g}`, lastDay: d });
  return out;
}

async function pool<T>(items: T[], n: number, f: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await f(items[i++]); }));
}

async function odds(c: TdLeagueCfg, id: string): Promise<DkLine | null> {
  try {
    return parseDkOdds(await getJson(`https://sports.core.api.espn.com/v2/sports/${c.sport}/leagues/${c.slug}/events/${id}/competitions/${id}/odds`));
  } catch {
    return null;
  }
}

function metaFrom(data: unknown): Record<string, TeamMeta> {
  const out: Record<string, TeamMeta> = {};
  for (const e of ((data as { events?: { competitions?: { competitors?: { team?: { abbreviation?: string; displayName?: string; logo?: string } }[] }[] }[] })?.events ?? []))
    for (const x of e.competitions?.[0]?.competitors ?? []) if (x.team?.abbreviation) out[x.team.abbreviation] = { name: x.team.displayName ?? x.team.abbreviation, logo: x.team.logo ?? null };
  return out;
}

/** One ingest pass. Walks unfinished units, stores finals + DraftKings closes, then recomputes. */
export async function runTeamData(opts: { budgetMs?: number; leagues?: string[] } = {}): Promise<{ ran: boolean; units: number; games: number; touched: string[]; why?: string }> {
  if (!chatEnabled()) return { ran: false, units: 0, games: 0, touched: [], why: "no store" };
  const got = await redis(["SET", K.lock, "1", "NX", "EX", 280]);
  if (got !== "OK") return { ran: false, units: 0, games: 0, touched: [], why: "busy" };
  const t0 = Date.now();
  const budget = opts.budgetMs ?? 200_000;
  const today = ymd(new Date());
  let nUnits = 0;
  let nGames = 0;
  const touched = new Set<string>();
  try {
    const work: { c: TdLeagueCfg; s: TdSeason; u: Unit }[] = [];
    for (const c of TD_LEAGUES) {
      if (opts.leagues && !opts.leagues.includes(c.id)) continue;
      for (const s of activeSeasons(c, today)) {
        const done = new Set(((await redis(["SMEMBERS", K.done(c.id, s.key)])) as string[]) ?? []);
        const todo = units(c, s, today).filter((u) => !done.has(u.key));
        // newest first so the current season fills before the deep backfill
        todo.reverse().slice(0, 40).forEach((u) => work.push({ c, s, u }));
        const prev = (await redis(["GET", K.out(c.id, s.key)])) as string | null;
        const stale = !prev || Date.now() - Date.parse((JSON.parse(prev) as LeagueOut).at) > 12 * 3600_000;
        if (!done.size || todo.length || stale) touched.add(`${c.id}:${s.key}`);
      }
    }
    // round-robin across league-seasons
    const groups = new Map<string, typeof work>();
    for (const w of work) groups.set(`${w.c.id}:${w.s.key}`, [...(groups.get(`${w.c.id}:${w.s.key}`) ?? []), w]);
    const rr: typeof work = [];
    for (let i = 0; rr.length < work.length; i++) for (const g of groups.values()) if (g[i]) rr.push(g[i]);
    for (const { c, s, u } of rr) {
      if (Date.now() - t0 > budget) break;
      let data: unknown;
      try {
        data = await getJson(u.url);
      } catch {
        continue;
      }
      nUnits++;
      const meta = metaFrom(data);
      if (Object.keys(meta).length) await redis(["HSET", K.meta(c.id), ...Object.entries(meta).flatMap(([k, v]) => [k, JSON.stringify(v)])]);
      const finals = parseFinals(data);
      const have = finals.length ? (((await redis(["HMGET", K.g(c.id, s.key), ...finals.map((f) => f.id)])) as (string | null)[]) ?? []) : [];
      const fresh = finals.filter((f, i) => f.final && !have[i]);
      const rows: string[] = [];
      await pool(fresh, 8, async (f) => {
        const o = await odds(c, f.id);
        const { final: _f, ...g } = f;
        void _f;
        const row: TdGame = { ...g, ...(o ? { sp: o.sp, tot: o.tot, mlh: o.mlh, mla: o.mla, osp: o.osp, otot: o.otot } : {}) };
        rows.push(f.id, JSON.stringify(row));
      });
      if (rows.length) {
        await redis(["HSET", K.g(c.id, s.key), ...rows]);
        nGames += rows.length / 2;
        touched.add(`${c.id}:${s.key}`);
      }
      const latest = finals.reduce((m, f) => (f.d > m ? f.d : m), "");
      const settled = finals.every((f) => f.final || Date.parse(f.d) < Date.now() - 3 * 86400000);
      const past = u.lastDay ? u.lastDay < addDays(today, -1) : !!latest && Date.parse(latest) < Date.now() - 2 * 86400000;
      if (settled && past) await redis(["SADD", K.done(c.id, s.key), u.key]);
    }
    for (const key of touched) {
      const [l, s] = key.split(":");
      await recompute(l, s).catch(() => {});
    }
  } finally {
    await redis(["DEL", K.lock]).catch(() => {});
  }
  return { ran: true, units: nUnits, games: nGames, touched: [...touched] };
}

const DIV_SPORT: Record<string, string> = { nfl: "football/nfl", nba: "basketball/nba", nhl: "hockey/nhl", mlb: "baseball/mlb" };
async function divisions(lg: string): Promise<{ div: Record<string, string>; conf: Record<string, string> }> {
  if (!DIV_SPORT[lg]) return { div: {}, conf: {} };
  try {
    const d = (await getJson(`https://site.api.espn.com/apis/v2/sports/${DIV_SPORT[lg]}/standings?level=3`)) as { children?: { name: string; children?: { name: string; standings?: { entries?: { team: { abbreviation: string } }[] } }[] }[] };
    const div: Record<string, string> = {};
    const conf: Record<string, string> = {};
    for (const c of d.children ?? []) for (const dv of c.children ?? []) for (const e of dv.standings?.entries ?? []) {
      div[e.team.abbreviation] = dv.name;
      conf[e.team.abbreviation] = c.name;
    }
    return { div, conf };
  } catch {
    return { div: {}, conf: {} };
  }
}

export async function seasonGames(lg: string, season: string): Promise<TdGame[]> {
  const h = ((await redis(["HGETALL", K.g(lg, season)])) as string[]) ?? [];
  const out: TdGame[] = [];
  for (let i = 1; i < h.length; i += 2) {
    try {
      out.push(JSON.parse(h[i]));
    } catch {}
  }
  return out;
}

async function metaMap(lg: string): Promise<Record<string, TeamMeta>> {
  const h = ((await redis(["HGETALL", K.meta(lg)])) as string[]) ?? [];
  const out: Record<string, TeamMeta> = {};
  for (let i = 0; i < h.length; i += 2) {
    try {
      out[h[i]] = JSON.parse(h[i + 1]);
    } catch {}
  }
  return out;
}

export async function recompute(lg: string, season: string): Promise<LeagueOut | null> {
  const c = tdLeague(lg);
  const s = c?.seasons.find((x) => x.key === season);
  if (!c || !s) return null;
  const raw = await seasonGames(lg, season);
  const { div, conf } = await divisions(lg);
  const divOf = Object.keys(div).length ? (a: string) => div[a] ?? null : undefined;
  // Pro leagues: conference game from ESPN standings (the scoreboard flag is a college field).
  const games = DIV_SPORT[lg] ? raw.map((g) => ({ ...g, conf: conf[g.h] && conf[g.a] ? conf[g.h] === conf[g.a] : undefined })) : raw;
  const meta = await metaMap(lg);
  const teams = [...new Set(games.flatMap((g) => [g.h, g.a]))];
  // NCAAF: only FBS teams that played 3+ tracked games get a page
  const sums: TeamSummary[] = teams.map((t) => summarize(c, games, t, divOf)).filter((x) => (c.id === "ncaaf" ? x.all.n >= 3 : !Object.keys(div).length || !!div[x.team]));
  // (pro leagues: only teams in ESPN standings, which drops All-Star and exhibition sides)
  const ds = games.map((g) => g.d).sort();
  const out: LeagueOut = {
    league: lg,
    season,
    seasonLabel: s.label,
    at: new Date().toISOString(),
    games: games.length,
    withLines: games.filter((g) => g.sp != null).length,
    first: ds[0] ?? null,
    last: ds[ds.length - 1] ?? null,
    boards: boards(c, sums, c.id === "mlb" || c.id === "nhl" || c.id === "nba" ? 8 : 4),
    teams: sums
      .map((x) => ({ abbr: x.team, name: meta[x.team]?.name ?? x.team, logo: meta[x.team]?.logo ?? null, su: `${x.all.w}-${x.all.l}${x.all.t ? `-${x.all.t}` : ""}`, ats: `${x.all.ats[0]}-${x.all.ats[1]}${x.all.ats[2] ? `-${x.all.ats[2]}` : ""}`, ou: `${x.all.ou[0]}-${x.all.ou[1]}${x.all.ou[2] ? `-${x.all.ou[2]}` : ""}`, n: x.all.n }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
  await redis(["SET", K.out(lg, season), JSON.stringify(out)]);
  for (const x of sums) await redis(["SET", K.team(lg, season, x.team), JSON.stringify({ ...x, name: meta[x.team]?.name ?? x.team, logo: meta[x.team]?.logo ?? null })]);
  return out;
}

export async function leagueOut(lg: string, season: string): Promise<LeagueOut | null> {
  if (!chatEnabled()) return null;
  const raw = (await redis(["GET", K.out(lg, season)])) as string | null;
  return raw ? (JSON.parse(raw) as LeagueOut) : null;
}

export type TeamOut = TeamSummary & { name: string; logo: string | null };
export async function teamOut(lg: string, season: string, abbr: string): Promise<TeamOut | null> {
  if (!chatEnabled()) return null;
  const raw = (await redis(["GET", K.team(lg, season, abbr.toUpperCase())])) as string | null;
  return raw ? (JSON.parse(raw) as TeamOut) : null;
}

/** Default season: newest active one that has games stored. */
export async function defaultSeason(lg: string): Promise<string | null> {
  const c = tdLeague(lg);
  if (!c) return null;
  for (const s of activeSeasons(c)) {
    const o = await leagueOut(lg, s.key);
    if (o && o.games >= 5) return s.key;
  }
  return activeSeasons(c)[0]?.key ?? null;
}

/* ---------- Today: matchups, line movement, DraftKings public splits ---------- */

const DK_EG: Record<string, string> = { nfl: "88808", nba: "42648", nhl: "42133", mlb: "84240", ncaaf: "87637" };
export const DK_SPLITS_URL = "https://dknetwork.draftkings.com/draftkings-sportsbook-betting-splits/";
export function dkSplitsOn(): boolean {
  return (process.env.DK_SPLITS ?? "on").toLowerCase() !== "off";
}

export async function dkSplits(lg: string, fresh = false): Promise<{ at: string; events: DkSplitEvent[] } | null> {
  if (!dkSplitsOn() || !DK_EG[lg]) return null;
  const cached = !fresh && chatEnabled() ? ((await redis(["GET", K.splits(lg)]).catch(() => null)) as string | null) : null;
  if (cached) return JSON.parse(cached);
  try {
    const res = await fetch(`${DK_SPLITS_URL}?tb_eg=${DK_EG[lg]}&tb_edate=n7days&tb_emt=0`, { cache: "no-store", headers: { "user-agent": "Mozilla/5.0 (PortalJuice)" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const out = { at: new Date().toISOString(), events: parseDkSplits(await res.text()) };
    if (chatEnabled()) await redis(["SET", K.splits(lg), JSON.stringify(out), "EX", 300]).catch(() => {});
    return out;
  } catch {
    return null;
  }
}

async function liveLine(c: TdLeagueCfg, id: string): Promise<{ at: string; line: DkLine | null }> {
  const cached = chatEnabled() ? ((await redis(["GET", K.live(c.id, id)]).catch(() => null)) as string | null) : null;
  if (cached) return JSON.parse(cached);
  const out = { at: new Date().toISOString(), line: await odds(c, id) };
  if (chatEnabled()) await redis(["SET", K.live(c.id, id), JSON.stringify(out), "EX", 300]).catch(() => {});
  return out;
}

const nick = (s: string) => s.trim().split(/\s+/).pop()!.toLowerCase();

export type Matchup = {
  id: string;
  start: string;
  state: string;
  away: { abbr: string; name: string; logo: string | null; sum: TeamOut | null; restDays: number | null };
  home: { abbr: string; name: string; logo: string | null; sum: TeamOut | null; restDays: number | null };
  line: DkLine | null;
  lineAt: string;
  splits: DkSplitEvent | null;
};

export async function todayMatchups(lg: string, season: string): Promise<{ games: Matchup[]; splitsAt: string | null }> {
  const c = tdLeague(lg);
  if (!c) return { games: [], splitsAt: null };
  const slate = await getSlate().catch(() => null);
  const gs = (slate?.games ?? []).filter((g) => g.league === lg).slice(0, 16);
  const sp = await dkSplits(lg);
  const now = Date.now();
  const games = await Promise.all(
    gs.map(async (g): Promise<Matchup> => {
      const [hs, as, ln] = await Promise.all([teamOut(lg, season, g.home.abbr), teamOut(lg, season, g.away.abbr), liveLine(c, g.id)]);
      const rest = (t: TeamOut | null) => {
        const last = t?.recent?.[0]?.d;
        if (!last) return null;
        const day = (iso: string) => Date.parse(new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }) + "T00:00:00Z") / 86400000;
        return Math.round(day(g.start) - day(last));
      };
      const ev =
        sp?.events.find((e) => (e.homeAbbr === g.home.abbr && e.awayAbbr === g.away.abbr)) ??
        sp?.events.find((e) => nick(e.home) === nick(g.home.name) && nick(e.away) === nick(g.away.name)) ??
        null;
      void now;
      return {
        id: g.id,
        start: g.start,
        state: g.state,
        away: { abbr: g.away.abbr, name: g.away.name, logo: as?.logo ?? g.away.logo, sum: as, restDays: rest(as) },
        home: { abbr: g.home.abbr, name: g.home.name, logo: hs?.logo ?? g.home.logo, sum: hs, restDays: rest(hs) },
        line: ln.line,
        lineAt: ln.at,
        splits: ev,
      };
    })
  );
  return { games, splitsAt: sp?.at ?? null };
}

/* ---------- Money lean snapshots ---------- */

const ML = {
  ev: (l: string, id: string) => `pj:ml:ev:${l}:${id}`,
  idx: (l: string) => `pj:ml:idx:${l}`,
  gate: (l: string) => `pj:ml:gate:${l}`,
  sb: (l: string, d: string) => `pj:ml:sb:${l}:${d}`,
};
const TTL = 10 * 86400;

async function getEv(lg: string, id: string): Promise<MlEvent | null> {
  const raw = (await redis(["GET", ML.ev(lg, id)])) as string | null;
  return raw ? (JSON.parse(raw) as MlEvent) : null;
}
const putEv = (e: MlEvent) => redis(["SET", ML.ev(e.lg, e.id), JSON.stringify(e), "EX", TTL]);

/** Every ~20 min per league: store DraftKings Network splits + lines for each upcoming game (pre-kickoff only). Then grade finished ones. */
export async function snapMoney(): Promise<Record<string, { snapped: number; graded: number } | string>> {
  const out: Record<string, { snapped: number; graded: number } | string> = {};
  if (!chatEnabled()) return { all: "no store" };
  if (!dkSplitsOn()) return { all: "DK_SPLITS=off" };
  for (const lg of Object.keys(DK_EG)) {
    let snapped = 0;
    if ((await redis(["SET", ML.gate(lg), "1", "NX", "EX", 14 * 60])) === "OK") {
      const sp = await dkSplits(lg, true);
      if (!sp) {
        out[lg] = "splits page unavailable";
        await redis(["DEL", ML.gate(lg)]);
        continue;
      }
      for (const e of sp.events) {
        const start = dkWhen(e.when);
        if (!e.id || !start || Date.parse(start) <= Date.parse(sp.at) || !e.markets.length) continue;
        const prev = await getEv(lg, e.id);
        const ev: MlEvent = prev ?? { id: e.id, lg, title: e.title, away: e.away, home: e.home, awayAbbr: e.awayAbbr, homeAbbr: e.homeAbbr, start, snaps: [] };
        ev.start = start;
        ev.snaps.push(snapOf(e, sp.at));
        if (ev.snaps.length > 600) ev.snaps = ev.snaps.slice(-600);
        await putEv(ev);
        await redis(["ZADD", ML.idx(lg), Date.parse(start), e.id]);
        snapped++;
      }
      await redis(["ZREMRANGEBYSCORE", ML.idx(lg), 0, Date.now() - TTL * 1000]);
    }
    out[lg] = { snapped, graded: await gradeMoney(lg).catch(() => 0) };
  }
  return out;
}

const nickOf = (s: string) => s.trim().split(/\s+/).pop()!.toLowerCase();

/** Attach the ESPN final to games that kicked off 3+ hours ago and grade the closing lean. */
async function gradeMoney(lg: string): Promise<number> {
  const c = tdLeague(lg);
  if (!c) return 0;
  const ids = ((await redis(["ZRANGEBYSCORE", ML.idx(lg), Date.now() - TTL * 1000, Date.now() - 3 * 3600_000])) as string[]) ?? [];
  let n = 0;
  for (const id of ids) {
    const ev = await getEv(lg, id);
    if (!ev || ev.final) continue;
    const day = new Date(ev.start).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }).replaceAll("-", "");
    let raw = (await redis(["GET", ML.sb(lg, day)])) as string | null;
    if (!raw) {
      try {
        raw = JSON.stringify(parseFinals(await getJson(`${base(c)}/scoreboard?dates=${day}&limit=300${c.groups ? `&groups=${c.groups}` : ""}`)));
        await redis(["SET", ML.sb(lg, day), raw, "EX", 1800]);
      } catch {
        continue;
      }
    }
    const finals = JSON.parse(raw) as ReturnType<typeof parseFinals>;
    const meta = await metaMap(lg);
    const nm = (a: string) => nickOf(meta[a]?.name ?? a);
    const f = finals.find((x) => (x.h === ev.homeAbbr && x.a === ev.awayAbbr) || (nm(x.h) === nickOf(ev.home) && nm(x.a) === nickOf(ev.away)));
    if (!f || !f.final) continue;
    ev.final = { hs: f.hs, as: f.as, espnId: f.id };
    ev.graded = gradeLean(ev, f);
    await putEv(ev);
    n++;
  }
  return n;
}

export type MoneyView = {
  at: string | null;
  upcoming: ReturnType<typeof moneyBoard>;
  graded: MlEvent[];
  tally: Record<string, { won: number; lost: number; push: number }>;
};

export async function moneyView(lg: string): Promise<MoneyView | null> {
  if (!chatEnabled() || !dkSplitsOn()) return null;
  const ids = ((await redis(["ZRANGEBYSCORE", ML.idx(lg), Date.now() - TTL * 1000, "+inf"])) as string[]) ?? [];
  const evs = (await Promise.all(ids.map((id) => getEv(lg, id)))).filter((e): e is MlEvent => !!e && e.snaps.length > 0);
  const now = Date.now();
  const upcoming = moneyBoard(evs.filter((e) => Date.parse(e.start) > now - 4 * 3600_000 && !e.final));
  const graded = evs.filter((e) => e.final && e.graded?.length).sort((a, b) => b.start.localeCompare(a.start));
  const tally: MoneyView["tally"] = {};
  for (const e of graded) for (const g of e.graded ?? []) {
    const t = (tally[g.market] ??= { won: 0, lost: 0, push: 0 });
    t[g.result]++;
  }
  const at = evs.reduce<string | null>((m, e) => { const t = e.snaps[e.snaps.length - 1]?.t; return t && (!m || t > m) ? t : m; }, null);
  return { at, upcoming, graded: graded.slice(0, 30), tally };
}
