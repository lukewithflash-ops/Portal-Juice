import "server-only";
/**
 * Every game in progress right now, across every league the site lists. One pull of each scoreboard,
 * shared by every viewer for a few seconds. Real ESPN scores only.
 */
import { getJson } from "@/lib/espn";
import { LEAGUES, parseScoreboard, sportsDate } from "@/lib/slate";
import { catalogLeague, parseSportScoreboard, SPORT_LEAGUES, type SportLeague , type TennisPoint } from "@/lib/sports";
import { ESPN_CATALOG } from "@/lib/espnCatalog";
import { gameRoute } from "@/lib/gameRoute";

export type AllLiveSide = { name: string; short: string; score: string | null; logo: string | null; color: string | null; serving?: boolean };

export type AllLiveGame = {
  key: string;
  league: string;
  label: string;
  group: string;
  id: string;
  href: string;
  detail: string;
  /** Tournament or event name (tennis, golf, UFC). */
  event: string | null;
  away: AllLiveSide;
  home: AllLiveSide;
  /** Golf: the top of the leaderboard instead of two sides. */
  leaders?: { name: string; score: string; thru: string | null }[];
  /** Tennis set scores. */
  sets?: { away: string[]; home: string[] };
  /** Tennis in-game score ESPN sent (tiebreak points), if any. Never invented. */
  point?: TennisPoint | null;
  /** Tennis: ESPN event (tournament) id, for the core situation lookup. Not rendered. */
  eventId?: string;
  /** Tennis: ESPN competitor ids (athlete id, or "a-b" for doubles). Not rendered. */
  ids?: { away: string; home: string };
};

export type AllLive = { fetchedAt: string; games: AllLiveGame[]; leagues: { id: string; label: string; count: number }[] };

const BASE = "https://site.api.espn.com/apis/site/v2/sports/";
const GROUP: Record<string, string> = { nfl: "Football", ncaaf: "Football", nba: "Basketball", mlb: "Baseball", nhl: "Hockey" };
/** Every FBS / D-I game, not only ranked ones. */
const GROUPS: Record<string, string> = { ncaaf: "&groups=80", ncaam: "&groups=50", ncaaw: "&groups=50" };
const TTL_MS = 3_000;
/** How often every other ESPN league is scanned for games that are live or about to start. */
const SCAN_MS = 120_000;
/** A league that failed this pull keeps its last good list this long, so one bad feed never empties the page. */
const KEEP_MS = 90_000;
let memo: { at: number; value: Promise<AllLive> } | null = null;
let scan: { at: number; value: Promise<Set<string>> } | null = null;
const lastGood = new Map<string, { at: number; games: AllLiveGame[] }>();

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => (v && typeof v === "object" ? (v as Dict) : {});
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Paths the site already covers by name; the catalog scan skips them. */
const COVERED = new Set([...LEAGUES.map((l) => `${l.sport}/${l.slug}`), ...SPORT_LEAGUES.map((l) => l.path)]);
const CATALOG: SportLeague[] = Object.entries(ESPN_CATALOG)
  .flatMap(([sport, slugs]) => slugs.map((slug) => catalogLeague(`${sport}.${slug}`)))
  .filter((l): l is SportLeague => !!l && !COVERED.has(l.path));

/** Runs jobs with a cap on how many ESPN calls are open at once. */
async function pool<T>(jobs: (() => Promise<T>)[], size = 24): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, jobs.length) }, async () => {
      while (next < jobs.length) {
        const i = next++;
        out[i] = await jobs[i]();
      }
    }),
  );
  return out;
}

/** Every competition on a board with its own status (tennis nests matches in groupings, one status each). */
export function competitionsOf(data: unknown): Dict[] {
  const out: Dict[] = [];
  for (const ev of asList(asDict(data).events).map(asDict)) {
    out.push(...asList(ev.competitions).map(asDict));
    for (const g of asList(ev.groupings).map(asDict)) out.push(...asList(g.competitions).map(asDict));
  }
  return out;
}
const stateOfComp = (c: Dict, ev?: Dict) => String(asDict(asDict(c.status ?? ev?.status).type).state ?? "");

/** Leagues in the catalog with something live, or starting within three hours. */
async function hotLeagues(): Promise<Set<string>> {
  const soon = Date.now() + 3 * 3600_000;
  const hits = await pool(
    CATALOG.map((l) => async () => {
      try {
        const data = await getJson(`${BASE}${l.path}/scoreboard`, 1);
        const hot = competitionsOf(data).some((c) => {
          const st = stateOfComp(c);
          return st === "in" || (st === "pre" && Date.parse(String(c.date ?? "")) <= soon && Date.parse(String(c.date ?? "")) > Date.now() - 6 * 3600_000);
        });
        return hot ? l.id : null;
      } catch {
        return null;
      }
    }),
  );
  return new Set(hits.filter((x): x is string => !!x));
}

function scanHot(): Promise<Set<string>> {
  const now = Date.now();
  if (scan && now - scan.at < SCAN_MS) return scan.value;
  const prev = scan?.value;
  const value = hotLeagues().catch(() => prev ?? new Set<string>());
  scan = { at: now, value };
  return value;
}

/** A league name from the board itself when the catalog only knows the slug. */
function boardLabel(l: SportLeague, data: unknown): string {
  if (!l.id.includes(".") || /[A-Z]/.test(l.label.slice(1))) return l.label;
  const lg = asDict(asList(asDict(data).leagues)[0]);
  const abbr = typeof lg.abbreviation === "string" ? lg.abbreviation : "";
  const name = typeof lg.shortName === "string" ? lg.shortName : typeof lg.name === "string" ? lg.name : "";
  const pick = abbr && abbr.length <= 14 && !/^\d+$/.test(abbr) ? abbr : name || l.label;
  return pick.slice(0, 28);
}

const side = (e: { name: string; short: string; score: string | null; logo: string | null; color: string | null; serving?: boolean }): AllLiveSide => ({
  name: e.name,
  short: e.short,
  score: e.score,
  logo: e.logo,
  color: e.color ? `#${e.color}` : null,
  serving: e.serving || undefined,
});

/** In-progress entries from one non-core board. Pure. */
export function liveFromBoard(l: SportLeague, data: unknown): AllLiveGame[] {
  const label = boardLabel(l, data);
  const { matches, golf } = parseSportScoreboard(l, data, Date.now(), { all: true, doubles: true });
  const evOf = new Map<string, string>();
  if (l.kind === "tennis")
    for (const ev of asList(asDict(data).events).map(asDict))
      for (const c of [...asList(ev.competitions), ...asList(ev.groupings).flatMap((g) => asList(asDict(g).competitions))]) evOf.set(String(asDict(c).id), String(ev.id ?? ""));
  const seen = new Set<string>();
  const out: AllLiveGame[] = [];
  for (const m of matches) {
    if (m.state !== "in" || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push({
      key: `${l.id}/${m.id}`,
      league: l.id,
      label,
      group: l.group,
      id: m.id,
      href: gameRoute(l.id, m.id),
      detail: m.detail,
      event: l.kind === "team" || l.kind === "soccer" ? null : [m.event, m.round].filter(Boolean).join(" · ") || null,
      away: side(m.away),
      home: side(m.home),
      sets: l.kind === "tennis" ? { away: m.away.sets, home: m.home.sets } : undefined,
      point: l.kind === "tennis" ? m.point ?? null : undefined,
      eventId: l.kind === "tennis" ? evOf.get(m.id) || undefined : undefined,
      ids: l.kind === "tennis" ? { away: m.away.id, home: m.home.id } : undefined,
    });
  }
  for (const b of golf.filter((g) => g.state === "in")) {
    out.push({
      key: `${l.id}/${b.id}`,
      league: l.id,
      label,
      group: l.group,
      id: b.id,
      href: "/games",
      detail: b.detail,
      event: b.name,
      away: { name: b.name, short: b.name, score: null, logo: null, color: null },
      home: { name: "", short: "", score: null, logo: null, color: null },
      leaders: b.rows.slice(0, 3).map((r) => ({ name: r.name, score: r.score, thru: r.thru })),
    });
  }
  return out;
}

async function guarded(key: string, run: () => Promise<AllLiveGame[]>): Promise<AllLiveGame[]> {
  try {
    const games = await run();
    lastGood.set(key, { at: Date.now(), games });
    return games;
  } catch {
    const old = lastGood.get(key);
    return old && Date.now() - old.at < KEEP_MS ? old.games : [];
  }
}

async function pull(): Promise<AllLive> {
  const day = sportsDate();
  const core = LEAGUES.map((l) =>
    guarded(l.id, async () => {
      const data = await getJson(`${BASE}${l.sport}/${l.slug}/scoreboard?dates=${day}&limit=300${GROUPS[l.id] ?? ""}`, 2);
      return parseScoreboard(l, data)
        .games.filter((g) => g.state === "in")
        .map((g) => ({
          key: `${l.id}/${g.id}`,
          league: l.id,
          label: l.label,
          group: GROUP[l.id] ?? "Other",
          id: g.id,
          href: gameRoute(l.id, g.id),
          detail: g.detail,
          event: null,
          away: { name: g.away.name, short: g.away.abbr, score: g.away.score, logo: g.away.logo, color: g.away.color ? `#${g.away.color}` : null },
          home: { name: g.home.name, short: g.home.abbr, score: g.home.score, logo: g.home.logo, color: g.home.color ? `#${g.home.color}` : null },
        }));
    }),
  );
  const hot = await scanHot();
  const named = [...SPORT_LEAGUES, ...CATALOG.filter((l) => hot.has(l.id))];
  const extra = pool(
    named.map((l) => () =>
      guarded(l.id, async () => {
        // ESPN's default board and the "limit" board can cover different days: read both, keep every live match once.
        const q = GROUPS[l.id] ? `?limit=300${GROUPS[l.id]}` : "?limit=300";
        const [a, b] = await Promise.allSettled([getJson(`${BASE}${l.path}/scoreboard${q}`, 2), getJson(`${BASE}${l.path}/scoreboard${GROUPS[l.id] ? "?" + GROUPS[l.id].slice(1) : ""}`, 2)]);
        if (a.status === "rejected" && b.status === "rejected") throw a.reason;
        const seen = new Set<string>();
        return [a, b]
          .flatMap((r) => (r.status === "fulfilled" ? liveFromBoard(l, r.value) : []))
          .filter((g) => (seen.has(g.key) ? false : (seen.add(g.key), true)));
      }),
    ),
  );
  const all = [...(await Promise.all(core)).flat(), ...(await extra).flat()];
  const seen = new Set<string>();
  const games = all.filter((g) => (seen.has(g.key) ? false : (seen.add(g.key), true)));
  await serversFor(games).catch(() => {});
  const leagues: AllLive["leagues"] = [];
  for (const g of games) {
    const have = leagues.find((x) => x.id === g.league);
    if (have) have.count++;
    else leagues.push({ id: g.league, label: g.label, count: 1 });
  }
  return { fetchedAt: new Date().toISOString(), games, leagues };
}

/** Tennis matches the scoreboard left without a server: ask ESPN's core situation (it names the server athlete). */
async function serversFor(games: AllLiveGame[]): Promise<void> {
  const need = games.filter((g) => g.sets && g.eventId && !g.away.serving && !g.home.serving).slice(0, 12);
  await Promise.all(
    need.map(async (g) => {
      const lg = g.league;
      const sit = asDict(await getJson(`https://sports.core.api.espn.com/v2/sports/tennis/leagues/${lg}/events/${g.eventId}/competitions/${g.id}/situation`, 1).catch(() => null));
      // ESPN names the server athlete, or (doubles) the serving side; sometimes neither, then nothing shows.
      const id = String(asDict(sit.server).$ref ?? "").match(/athletes\/(\d+)/)?.[1];
      const sideId = String(asDict(sit.servingSide).$ref ?? "").match(/competitors\/([\d-]+)/)?.[1];
      for (const [side, ent] of [["away", g.away], ["home", g.home]] as const) {
        const eid = g.ids?.[side] ?? "";
        if ((sideId && eid === sideId) || (id && (eid === id || eid.split("-").includes(id)))) ent.serving = true;
      }
    }),
  );
}

export function getAllLive(): Promise<AllLive> {
  const now = Date.now();
  if (memo && now - memo.at < TTL_MS) return memo.value;
  const value = pull();
  memo = { at: now, value };
  value.catch(() => (memo = null));
  return value;
}
