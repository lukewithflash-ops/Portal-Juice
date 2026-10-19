import "server-only";
import { getJson } from "@/lib/espn";
import {
  driverForm,
  focusSession,
  headToHead,
  parseRaceSeason,
  parseRunRow,
  raceReads,
  racingLeague,
  trackHistory,
  type DriverForm,
  type Finisher,
  type RaceEvent,
  type RaceRead,
  type RaceSession,
  type RunRow,
  type TrackRun,
} from "@/lib/racing";

const SITE = "https://site.api.espn.com/apis/site/v2/sports/racing/";
const CORE = "https://sports.core.api.espn.com/v2/sports/racing/leagues/";

/** Small per-instance memo with in-flight sharing. */
const memo = new Map<string, { at: number; ttl: number; p: Promise<unknown> }>();
function cached(url: string, ttlMs: number): Promise<unknown> {
  const hit = memo.get(url);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.p;
  const p = getJson(url);
  memo.set(url, { at: Date.now(), ttl: ttlMs, p });
  p.catch(() => memo.delete(url));
  if (memo.size > 600) for (const [k, v] of memo) if (Date.now() - v.at > v.ttl) memo.delete(k);
  return p;
}

/** Every event of one season, with session results (one ESPN call). Current season refreshes often; past seasons rarely. */
export async function getSeason(league: string, year: number, live = false): Promise<RaceEvent[]> {
  const l = racingLeague(league);
  if (!l) return [];
  const thisYear = new Date().getUTCFullYear();
  const ttl = year < thisYear ? 12 * 3600e3 : live ? 5_000 : 120_000;
  const data = await cached(`${SITE}${l.slug}/scoreboard?dates=${year}`, ttl);
  return parseRaceSeason(league, data);
}

export type Standing = { id: string; name: string; rank: number | null; points: number | null };
export async function getStandings(league: string): Promise<Standing[]> {
  const l = racingLeague(league);
  if (!l) return [];
  const data = (await cached(`https://site.web.api.espn.com/apis/v2/sports/racing/${l.slug}/standings`, 600_000).catch(() => null)) as { children?: { standings?: { entries?: unknown[] } }[] } | null;
  const entries = (data?.children?.[0]?.standings?.entries ?? []) as { athlete?: { id?: string; displayName?: string }; stats?: { name?: string; value?: number }[] }[];
  return entries
    .map((e) => ({
      id: String(e.athlete?.id ?? ""),
      name: e.athlete?.displayName ?? "",
      rank: e.stats?.find((s) => s.name === "rank")?.value ?? null,
      points: e.stats?.find((s) => s.name === "championshipPts")?.value ?? null,
    }))
    .filter((s) => s.id && s.name);
}

export type RaceOdds = { provider: string; text: string }[];
/** DraftKings racing lines, only if ESPN carries them for this session. ESPN's racing odds lists were empty when this was built. */
async function getOdds(slug: string, eventId: string, sessionId: string, live: boolean): Promise<RaceOdds> {
  const d = (await cached(`${CORE}${slug}/events/${eventId}/competitions/${sessionId}/odds`, live ? 15_000 : 300_000).catch(() => null)) as { items?: { provider?: { name?: string }; details?: string }[] } | null;
  return (d?.items ?? [])
    .filter((i) => /draftkings/i.test(i.provider?.name ?? "") && typeof i.details === "string" && i.details.trim())
    .slice(0, 1)
    .map((i) => ({ provider: "DraftKings", text: (i.details as string).trim() }));
}

export type RaceStatus = { state: RaceSession["state"]; detail: string; lap: number | null; laps: number | null };

/** Live (or final) running order for one session from ESPN core: position, grid, laps, gaps, pit stops, laps led, fastest lap. */
async function getRunning(slug: string, eventId: string, session: RaceSession, names: Map<string, Finisher>): Promise<{ rows: RunRow[]; status: RaceStatus }> {
  const live = session.state === "in";
  const ttl = live ? 3_000 : session.state === "post" ? 600_000 : 60_000;
  const base = `${CORE}${slug}/events/${eventId}/competitions/${session.id}`;
  const comp = (await cached(base, ttl).catch(() => null)) as { competitors?: { id?: string; statistics?: { $ref?: string } }[] } | null;
  const comps = comp?.competitors ?? [];
  const [statusDoc, totals, stats] = await Promise.all([
    cached(`${base}/status`, ttl).catch(() => null) as Promise<{ period?: number; type?: { state?: string; shortDetail?: string; detail?: string } } | null>,
    cached(`${base}/statistics`, live ? 60_000 : 600_000).catch(() => null) as Promise<{ categories?: { stats?: { name?: string; value?: number }[] }[]; splits?: { categories?: { stats?: { name?: string; value?: number }[] }[] } } | null>,
    Promise.all(comps.map((c) => (c.statistics?.$ref ? cached(c.statistics.$ref.replace(/^http:/, "https:"), ttl).catch(() => null) : Promise.resolve(null)))),
  ]);
  const rows = comps
    .map((c, i) => parseRunRow(c, stats[i], names))
    .filter((r): r is RunRow => !!r)
    .sort((a, b) => a.pos - b.pos);
  const lapsTotal = (totals?.categories ?? totals?.splits?.categories)?.flatMap((c) => c.stats ?? []).find((s) => s.name === "laps")?.value ?? null;
  const st = statusDoc?.type?.state;
  return {
    rows,
    status: {
      state: st === "in" ? "in" : st === "post" ? "post" : session.state,
      detail: statusDoc?.type?.shortDetail || statusDoc?.type?.detail || session.detail,
      lap: typeof statusDoc?.period === "number" && statusDoc.period > 0 ? statusDoc.period : null,
      laps: lapsTotal && lapsTotal > 0 ? lapsTotal : null,
    },
  };
}

export type DriverInfo = { id: string; name: string; team: string | null; start: number | null; form: DriverForm; track: TrackRun[]; mate: { name: string; races: number; ahead: number } | null };

export type RacePage = {
  league: string;
  event: RaceEvent;
  session: RaceSession | null;
  rows: RunRow[];
  status: RaceStatus | null;
  odds: RaceOdds;
  drivers: DriverInfo[];
  reads: RaceRead[];
  standings: Standing[];
  fetchedAt: string;
};

/** One race weekend with everything ESPN has: sessions, running order, and form/track/teammate reads for the field. */
export async function getRacePage(league: string, eventId: string, sessionPick?: string | null): Promise<RacePage | null> {
  const l = racingLeague(league);
  if (!l || !/^\d+$/.test(eventId)) return null;
  const year = new Date().getUTCFullYear();
  let season = await getSeason(league, year, true);
  let event = season.find((e) => e.id === eventId);
  if (!event) {
    season = await getSeason(league, year - 1);
    event = season.find((e) => e.id === eventId);
  }
  if (!event) return null;
  const evYear = Number(event.date.slice(0, 4)) || year;
  const live = event.state === "in";
  if (live) season = await getSeason(league, evYear, true);
  const session = (sessionPick && event.sessions.find((s) => s.id === sessionPick)) || focusSession(event);
  const names = new Map<string, Finisher>();
  for (const ev of season) for (const s of ev.sessions) for (const f of s.finishers) if (!names.has(f.id)) names.set(f.id, f);
  const [running, odds, standings, past] = await Promise.all([
    session && session.finishers.length ? getRunning(l.slug, event.id, session, names).catch(() => null) : Promise.resolve(null),
    session ? getOdds(l.slug, event.id, (event.sessions.find((s) => s.type === "Race") ?? session).id, live) : Promise.resolve([]),
    getStandings(league).catch(() => []),
    Promise.all([1, 2, 3].map((k) => getSeason(league, evYear - k).catch(() => [] as RaceEvent[]))),
  ]);
  const history = [...past.flat(), ...season].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  // Field: the running order when ESPN has one, else the latest session list, else the standings.
  const rows = running?.rows ?? [];
  const fieldSrc =
    rows.length
      ? rows.map((r) => ({ id: r.id, name: r.name, team: r.team, start: r.start }))
      : (session?.finishers.length ? session.finishers : []).map((f) => ({ id: f.id, name: f.name, team: null, start: null }));
  const field = fieldSrc.length ? fieldSrc : standings.slice(0, 40).map((s) => ({ id: s.id, name: s.name, team: null, start: null }));
  const before = event.state === "post" ? event.date : null;
  const drivers: DriverInfo[] = field.map((d) => {
    const mateRow = d.team ? field.find((x) => x.id !== d.id && x.team === d.team) : null;
    const h = mateRow ? headToHead(season, d.id, mateRow.id, before) : null;
    return {
      id: d.id,
      name: d.name,
      team: d.team,
      start: d.start,
      form: driverForm(season, d.id, before),
      track: trackHistory(history, event!.track, d.id, event!.date),
      mate: mateRow && h ? { name: mateRow.name, races: h.races, ahead: h.aAhead } : null,
    };
  });
  const form = Object.fromEntries(drivers.map((d) => [d.id, d.form]));
  const track = Object.fromEntries(drivers.map((d) => [d.id, d.track]));
  const h2h = Object.fromEntries(drivers.filter((d) => d.mate).map((d) => [d.id, { mate: d.mate!.name, races: d.mate!.races, ahead: d.mate!.ahead }]));
  const reads = raceReads({ field, form, track, h2h });
  return { league, event, session, rows, status: running?.status ?? null, odds, drivers, reads, standings: standings.slice(0, 10), fetchedAt: new Date().toISOString() };
}

/** Season schedule + last result for the league page and Ask. */
export async function getRacingHome(league: string) {
  const year = new Date().getUTCFullYear();
  const [season, standings] = await Promise.all([getSeason(league, year), getStandings(league).catch(() => [])]);
  return { season, standings };
}
