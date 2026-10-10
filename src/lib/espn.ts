import "server-only";
import { soccerBoxes } from "@/lib/soccerBox";
import { sportLeague } from "@/lib/sports";
import { unstable_cache } from "next/cache";
import { allowedHeadshot } from "@/lib/headshots";
import { implied } from "@/lib/odds";
import { bugFromScoreboard, freshestStatus, parseLive, situationFromScoreboard, statusFromScoreboard, type LiveSnap } from "@/lib/live";
import {
  parseMvpMarket,
  parsePropItems,
  parseSummaryDetail,
  providerFromOddsList,
  seasonStatLine,
  type GameDetail,
  type PropDraft,
} from "@/lib/detail";
import {
  LEAGUES,
  dayLabel,
  lastNAverage,
  leagueById,
  parseGame,
  parseNextEvent,
  parseRecent,
  parseScoreboard,
  parseStories,
  rankGames,
  readAthlete,
  sportsDate,
  topLeaderId,
  type Game,
  type League,
  type LeagueId,
  type Slate,
  type Story,
  type TeamPage,
  type ScoreRow,
  type Trend,
} from "@/lib/slate";

const REVALIDATE = 60;

export async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json", "user-agent": "PortalJuice/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function loadSlate(day: string): Promise<Slate> {
  const missing: string[] = [];
  const settled = await Promise.all(
    LEAGUES.map(async (league) => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.slug}/scoreboard?dates=${day}&limit=100`;
      try {
        const data = await getJson(url);
        return { league, ...parseScoreboard(league, data) };
      } catch {
        missing.push(league.label);
        return { league, games: [] as Game[], seasonYear: null, seasonType: null };
      }
    })
  );
  const games = settled.flatMap((s) => s.games);
  return {
    day,
    dayLabel: dayLabel(day),
    fetchedAt: new Date().toISOString(),
    games,
    missing,
  };
}

/** Slate for any ESPN day (YYYYMMDD). Same 15s window. */
export function getSlateFor(day: string): Promise<Slate> {
  if (!/^\d{8}$/.test(day)) return Promise.resolve({ day, dayLabel: day, fetchedAt: new Date().toISOString(), games: [], missing: [] });
  return unstable_cache(() => loadSlate(day), ["pj-slate2", day], { revalidate: 15 })();
}

export function getSlate(): Promise<Slate> {
  const day = sportsDate();
  // Short window: scores on first paint should be close to live. Prices ride along.
  return unstable_cache(() => loadSlate(day), ["pj-slate2", day], { revalidate: 15 })();
}

const TREND_CAP = 12;

async function loadTrends(day: string): Promise<{ trends: Trend[]; fetchedAt: string }> {
  const slate = await loadSlate(day);
  const preferred = rankGames(slate.games.filter((g) => g.league === "nfl" || g.league === "nba"));
  const rest = rankGames(slate.games.filter((g) => g.league !== "nfl" && g.league !== "nba"));
  const ordered = [...preferred, ...rest];

  type Slot = {
    game: Game;
    teamId: string;
    abbr: string;
    category: string;
    statKey: string;
    label: string;
    league: League;
  };
  const slots: Slot[] = [];
  for (const game of ordered) {
    const league = leagueById(game.league);
    if (!league) continue;
    for (const side of [game.away, game.home]) {
      for (const cat of league.leaderCats) {
        if (slots.length >= TREND_CAP) break;
        slots.push({
          game,
          teamId: side.id,
          abbr: side.abbr,
          category: cat.category,
          statKey: cat.statKey,
          label: cat.label,
          league,
        });
      }
    }
  }

  const seasonYear =
    Number(day.slice(0, 4)) || new Date().getFullYear();
  // One leaders payload per team. Season type 2 is the regular season; if it
  // 404s we try 3 (postseason) once.
  const teamKey = (s: Slot) => `${s.league.id}:${s.teamId}`;
  const unique = [...new Map(slots.map((s) => [teamKey(s), s])).values()];

  async function leadersFor(slot: Slot): Promise<unknown | null> {
    const base = `https://sports.core.api.espn.com/v2/sports/${slot.league.sport}/leagues/${slot.league.slug}/seasons/${seasonYear}/types`;
    for (const type of [2, 3]) {
      try {
        return await getJson(`${base}/${type}/teams/${slot.teamId}/leaders`);
      } catch {
        /* try the next season type */
      }
    }
    return null;
  }

  const leaderMap = new Map<string, unknown | null>();
  await Promise.all(
    unique.map(async (slot) => {
      leaderMap.set(teamKey(slot), await leadersFor(slot));
    })
  );

  const trends: Trend[] = [];
  await Promise.all(
    slots.map(async (slot) => {
      const payload = leaderMap.get(teamKey(slot));
      const athleteId = payload ? topLeaderId(payload, slot.category) : null;
      if (!athleteId) return;
      const sport = slot.league.sport;
      const slug = slot.league.slug;
      const [logRes, athRes] = await Promise.allSettled([
        getJson(
          `https://site.web.api.espn.com/apis/common/v3/sports/${sport}/${slug}/athletes/${athleteId}/gamelog`
        ),
        getJson(
          `https://site.web.api.espn.com/apis/common/v3/sports/${sport}/${slug}/athletes/${athleteId}`
        ),
      ]);
      if (logRes.status !== "fulfilled") return;
      const avg = lastNAverage(logRes.value, slot.statKey, 5);
      if (!avg) return;
      const athlete = athRes.status === "fulfilled" ? readAthlete(athRes.value) : { name: null, headshot: null, position: null };
      if (!athlete.name) return;
      const head =
        allowedHeadshot(athlete.headshot) ??
        allowedHeadshot(`https://a.espncdn.com/i/headshots/${slot.league.id === "ncaaf" ? "college-football" : slot.league.slug}/players/full/${athleteId}.png`);
      trends.push({
        id: `${slot.league.id}-${athleteId}-${slot.statKey}`,
        name: athlete.name,
        team: slot.abbr,
        league: slot.league.id,
        leagueLabel: slot.league.label,
        matchup: `${slot.game.away.abbr} @ ${slot.game.home.abbr}`,
        gameId: slot.game.id,
        headshot: head,
        statLabel: slot.label,
        avg: avg.avg,
        games: avg.games,
        seasonAvg: avg.seasonGames > avg.games ? avg.seasonAvg : null,
        seasonGames: avg.seasonGames,
      });
    })
  );

  trends.sort((a, b) => {
    const ai = slots.findIndex((s) => a.id.startsWith(`${s.league.id}-`) && a.statLabel === s.label && a.team === s.abbr);
    const bi = slots.findIndex((s) => b.id.startsWith(`${s.league.id}-`) && b.statLabel === s.label && b.team === s.abbr);
    return ai - bi;
  });

  return { trends, fetchedAt: new Date().toISOString() };
}

export function getTrends(): Promise<{ trends: Trend[]; fetchedAt: string }> {
  const day = sportsDate();
  return unstable_cache(() => loadTrends(day), ["pj-trends", day], { revalidate: REVALIDATE })();
}

async function loadStories(): Promise<{ stories: Story[]; fetchedAt: string }> {
  const batches = await Promise.all(
    LEAGUES.map(async (league) => {
      try {
        const data = await getJson(
          `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.slug}/news?limit=8`
        );
        return parseStories(data, league.label);
      } catch {
        return [] as Story[];
      }
    })
  );
  const stories = batches
    .flat()
    .sort((a, b) => (a.published < b.published ? 1 : -1));
  const seen = new Set<string>();
  const deduped = stories.filter((s) => {
    const key = s.headline.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { stories: deduped, fetchedAt: new Date().toISOString() };
}

export function getStories(): Promise<{ stories: Story[]; fetchedAt: string }> {
  const day = sportsDate();
  return unstable_cache(() => loadStories(), ["pj-stories", day], { revalidate: REVALIDATE })();
}

export async function getGame(leagueId: string, id: string): Promise<Game | null> {
  const league = leagueById(leagueId);
  if (!league || !/^\d+$/.test(id)) return null;
  const load = unstable_cache(
    async () => {
      try {
        const data = await getJson(
          `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.slug}/summary?event=${id}`
        );
        const d = data as { header?: Record<string, unknown>; pickcenter?: unknown[] };
        const header = (d.header ?? {}) as Record<string, unknown>;
        const comp = (Array.isArray(header.competitions) ? header.competitions[0] : {}) as Record<
          string,
          unknown
        >;
        const odds = Array.isArray(comp.odds) && comp.odds.length ? comp.odds[0] : d.pickcenter?.[0];
        const event = {
          id,
          date: (comp.date as string) || (header.date as string) || "",
          competitions: [comp],
        };
        return parseGame(league, event, 0, odds) ?? null;
      } catch {
        return null;
      }
    },
    ["pj-game2", league.id, id],
    { revalidate: REVALIDATE }
  );
  return load();
}

function teamLogo(team: Record<string, unknown>): string | null {
  const logos = Array.isArray(team.logos) ? team.logos : [];
  for (const raw of logos) {
    const href = typeof raw === "object" && raw && "href" in raw ? String((raw as { href: string }).href) : "";
    if (href.startsWith("https://a.espncdn.com/")) return href;
  }
  return null;
}

export async function getTeam(leagueId: string, abbrRaw: string): Promise<TeamPage | null> {
  const league = leagueById(leagueId);
  const abbr = abbrRaw.toLowerCase();
  if (!league || !/^[a-z0-9]{2,8}$/.test(abbr)) return null;
  const load = unstable_cache(
    async (): Promise<TeamPage | null> => {
      let teamJson: unknown;
      try {
        teamJson = await getJson(
          `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.slug}/teams/${abbr}`
        );
      } catch {
        return null;
      }
      const team = ((teamJson as { team?: Record<string, unknown> }).team ?? {}) as Record<string, unknown>;
      const name = typeof team.displayName === "string" ? team.displayName : null;
      const id = typeof team.id === "string" ? team.id : "";
      const abbreviation = typeof team.abbreviation === "string" ? team.abbreviation : abbr.toUpperCase();
      if (!name) return null;
      const recordItems = ((team.record as { items?: { type?: string; summary?: string }[] })?.items ?? []);
      const total = recordItems.find((r) => r.type === "total");
      const colorRaw = typeof team.color === "string" ? team.color : "";
      const color = /^[0-9a-fA-F]{6}$/.test(colorRaw) ? `#${colorRaw}` : null;

      const [schedRes, newsRes] = await Promise.allSettled([
        getJson(
          `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.slug}/teams/${abbr}/schedule`
        ),
        getJson(
          `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.slug}/news?limit=6&team=${abbr}`
        ),
      ]);

      return {
        league: league.id as LeagueId,
        leagueLabel: league.label,
        id,
        abbr: abbreviation,
        name,
        record: total?.summary ?? null,
        standing: typeof team.standingSummary === "string" ? team.standingSummary : null,
        logo: teamLogo(team),
        color,
        next: parseNextEvent(team),
        recent: schedRes.status === "fulfilled" ? parseRecent(schedRes.value) : [],
        stories: newsRes.status === "fulfilled" ? parseStories(newsRes.value, league.label).slice(0, 6) : [],
      };
    },
    ["pj-team", league.id, abbr],
    { revalidate: REVALIDATE }
  );
  return load();
}



export type HydratedProp = PropDraft & {
  name: string;
  team: string;
  headshot: string | null;
  provider: string;
};

export type DetailBundle = {
  game: Game;
  detail: GameDetail;
  props: HydratedProp[];
  propTotal: number;
  propProvider: string | null;
};

export type MvpRow = {
  id: string;
  name: string;
  team: string;
  headshot: string | null;
  odds: string;
  oddsNum: number;
  implied: number;
  stats: string;
};

export type MvpGroup = {
  league: LeagueId;
  leagueLabel: string;
  market: string;
  provider: string;
  rows: MvpRow[];
};

export type PropsGroup = {
  game: Game;
  provider: string | null;
  total: number;
  props: HydratedProp[];
};

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const size = Math.min(n, items.length);
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) {
        const idx = i++;
        await fn(items[idx]!);
      }
    })
  );
}

function teamIdFromRef(ref: unknown): string | null {
  if (typeof ref !== "string") return null;
  const m = ref.match(/teams\/(\d+)/);
  return m?.[1] ?? null;
}

async function readCoreAthlete(league: League, id: string): Promise<{
  name: string | null;
  headshot: string | null;
  teamId: string | null;
}> {
  const data = (await getJson(
    `https://sports.core.api.espn.com/v2/sports/${league.sport}/leagues/${league.slug}/athletes/${id}`
  )) as Record<string, unknown>;
  const head = data.headshot as { href?: string } | undefined;
  const team = data.team as { $ref?: string } | undefined;
  return {
    name: typeof data.displayName === "string" ? data.displayName : null,
    headshot: allowedHeadshot(typeof head?.href === "string" ? head.href : null),
    teamId: teamIdFromRef(team?.$ref),
  };
}

async function hydrate(
  league: League,
  drafts: PropDraft[],
  provider: string,
  teams: Record<string, string>
): Promise<HydratedProp[]> {
  const ids = [...new Set(drafts.map((d) => d.athleteId))];
  const people = new Map<string, { name: string; team: string; headshot: string | null }>();
  await pool(ids, 10, async (id) => {
    try {
      const a = await readCoreAthlete(league, id);
      if (!a.name) return;
      people.set(id, {
        name: a.name,
        team: (a.teamId && teams[a.teamId]) || "",
        headshot: a.headshot,
      });
    } catch {
      /* skip a player the feed did not resolve */
    }
  });
  return drafts.flatMap((d) => {
    const p = people.get(d.athleteId);
    if (!p) return [];
    return [{ ...d, name: p.name, team: p.team, headshot: p.headshot, provider }];
  });
}

async function teamDirectory(league: League): Promise<Record<string, string>> {
  try {
    const data = await getJson(
      `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.slug}/teams?limit=400`
    );
    const out: Record<string, string> = {};
    const walk = (v: unknown) => {
      if (Array.isArray(v)) {
        v.forEach(walk);
        return;
      }
      if (!v || typeof v !== "object") return;
      const d = v as Record<string, unknown>;
      if (typeof d.id === "string" && typeof d.abbreviation === "string" && d.abbreviation.length <= 6) {
        out[d.id] = d.abbreviation;
      }
      for (const child of Object.values(d)) {
        if (child && typeof child === "object") walk(child);
      }
    };
    walk(data);
    return out;
  } catch {
    return {};
  }
}

async function loadPropDrafts(league: League, eventId: string, limit: number): Promise<{
  provider: string | null;
  total: number;
  drafts: PropDraft[];
}> {
  const base = `https://sports.core.api.espn.com/v2/sports/${league.sport}/leagues/${league.slug}/events/${eventId}/competitions/${eventId}/odds`;
  let providerId = "100";
  let provider: string | null = null;
  try {
    const listed = providerFromOddsList(await getJson(base));
    if (listed) {
      providerId = listed.id;
      provider = listed.name;
    }
  } catch {
    return { provider: null, total: 0, drafts: [] };
  }
  try {
    const data = await getJson(`${base}/${providerId}/propBets?limit=${limit}`);
    const parsed = parsePropItems(data);
    return { provider, total: parsed.total, drafts: parsed.drafts };
  } catch {
    return { provider, total: 0, drafts: [] };
  }
}

async function loadDetail(leagueId: string, id: string): Promise<DetailBundle | null> {
  const league = leagueById(leagueId);
  if (!league || !/^\d+$/.test(id)) return null;
  let summary: unknown;
  try {
    summary = await getJson(
      `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.slug}/summary?event=${id}`
    );
  } catch {
    return null;
  }
  const d = summary as { header?: Record<string, unknown>; pickcenter?: unknown[] };
  const header = (d.header ?? {}) as Record<string, unknown>;
  const comp = (Array.isArray(header.competitions) ? header.competitions[0] : {}) as Record<string, unknown>;
  const odds = Array.isArray(comp.odds) && comp.odds.length ? comp.odds[0] : d.pickcenter?.[0];
  const game = parseGame(
    league,
    { id, date: (comp.date as string) || "", competitions: [comp] },
    0,
    odds
  );
  if (!game) return null;
  const detail = parseSummaryDetail(summary, league.label);
  const teams: Record<string, string> = { [game.home.id]: game.home.abbr, [game.away.id]: game.away.abbr };
  const propsRaw = await loadPropDrafts(league, id, 80);
  const props = await hydrate(league, propsRaw.drafts, propsRaw.provider || "ESPN", teams);
  return {
    game,
    detail,
    props,
    propTotal: propsRaw.total,
    propProvider: propsRaw.provider,
  };
}

export function getGameDetail(leagueId: string, id: string): Promise<DetailBundle | null> {
  const league = leagueById(leagueId);
  if (!league || !/^\d+$/.test(id)) return Promise.resolve(null);
  return unstable_cache(() => loadDetail(leagueId, id), ["pj-detail2", league.id, id], {
    revalidate: REVALIDATE,
  })();
}

async function loadPropsBoard(day: string): Promise<{ groups: PropsGroup[]; fetchedAt: string }> {
  const slate = await loadSlate(day);
  const games = rankGames(slate.games).slice(0, 8);
  const groups: PropsGroup[] = [];
  for (const game of games) {
    const league = leagueById(game.league);
    if (!league) continue;
    const raw = await loadPropDrafts(league, game.id, 40);
    const teams: Record<string, string> = { [game.home.id]: game.home.abbr, [game.away.id]: game.away.abbr };
    const props = await hydrate(league, raw.drafts.slice(0, 6), raw.provider || "ESPN", teams);
    groups.push({ game, provider: raw.provider, total: raw.total, props });
  }
  return { groups: groups.filter((g) => g.props.length > 0), fetchedAt: new Date().toISOString() };
}

export function getPropsBoard(): Promise<{ groups: PropsGroup[]; fetchedAt: string }> {
  const day = sportsDate();
  return unstable_cache(() => loadPropsBoard(day), ["pj-props", day], { revalidate: REVALIDATE })();
}

async function loadMvp(year: number): Promise<{ groups: MvpGroup[]; fetchedAt: string }> {
  const wanted = LEAGUES.filter((l) => l.id === "nfl" || l.id === "nba");
  const groups: MvpGroup[] = [];
  for (const league of wanted) {
    let data: unknown;
    try {
      data = await getJson(
        `https://sports.core.api.espn.com/v2/sports/${league.sport}/leagues/${league.slug}/seasons/${year}/futures?limit=50`
      );
    } catch {
      continue;
    }
    const market = parseMvpMarket(data);
    if (!market) continue;
    const teams = await teamDirectory(league);
    const rows: MvpRow[] = [];
    const top = new Set(market.books.slice(0, 12).map((b) => b.athleteId));
    await pool(market.books, 10, async (book) => {
      try {
        const a = await readCoreAthlete(league, book.athleteId);
        if (!a.name) return;
        let stats = "";
        if (top.has(book.athleteId)) {
          try {
            const statJson = await getJson(
              `https://sports.core.api.espn.com/v2/sports/${league.sport}/leagues/${league.slug}/seasons/${year}/types/2/athletes/${book.athleteId}/statistics`
            );
            stats = seasonStatLine(statJson);
          } catch {
            stats = "";
          }
        }
        rows.push({
          id: `${league.id}-${book.athleteId}`,
          name: a.name,
          team: (a.teamId && teams[a.teamId]) || "",
          headshot: a.headshot,
          odds: book.odds,
          oddsNum: book.oddsNum,
          implied: implied(book.oddsNum),
          stats,
        });
      } catch {
        /* skip */
      }
    });
    rows.sort((a, b) => b.implied - a.implied);
    groups.push({
      league: league.id,
      leagueLabel: league.label,
      market: market.market,
      provider: market.provider,
      rows,
    });
  }
  return { groups, fetchedAt: new Date().toISOString() };
}

export function getMvpBoard(): Promise<{ groups: MvpGroup[]; fetchedAt: string }> {
  const year = Number(sportsDate().slice(0, 4));
  return unstable_cache(() => loadMvp(year), ["pj-mvp", String(year)], { revalidate: REVALIDATE })();
}

/**
 * Tiny per-instance memo so a burst of viewers on one game shares one ESPN call.
 * No shared data cache here: live reads must never be served from a stale copy.
 */
const liveMemo = new Map<string, { at: number; value: Promise<unknown> }>();
const LIVE_TTL_MS = 2_000;

function memoJson(url: string): Promise<unknown> {
  const now = Date.now();
  const hit = liveMemo.get(url);
  if (hit && now - hit.at < LIVE_TTL_MS) return hit.value;
  const value = getJson(url);
  liveMemo.set(url, { at: now, value });
  value.catch(() => liveMemo.delete(url));
  if (liveMemo.size > 400) {
    for (const [k, v] of liveMemo) if (now - v.at >= LIVE_TTL_MS) liveMemo.delete(k);
  }
  return value;
}

/** ESPN's scoreboard date (US Eastern) for a game start. */
function easternDay(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(t));
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}

export async function getLive(leagueId: string, id: string): Promise<LiveSnap | null> {
  const league = leagueById(leagueId);
  const extra = league ? null : sportLeague(leagueId);
  if ((!league && !(extra && (extra.kind === "team" || extra.kind === "soccer"))) || !/^\d+$/.test(id)) return null;
  const base = league
    ? `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.slug}`
    : `https://site.api.espn.com/apis/site/v2/sports/${extra!.path}`;
  let data: unknown;
  try {
    data = await memoJson(`${base}/summary?event=${id}`);
  } catch {
    return null;
  }
  let snap = parseLive(data);
  if (snap && extra?.kind === "soccer") {
    const { boxes, subs } = await soccerBoxes(data, extra.path, id, snap.state).catch(() => ({ boxes: snap!.boxes, subs: [] }));
    snap = { ...snap, boxes, subs };
  }
  if (!snap || snap.state === "post") return snap;
  // The scoreboard often posts the score and clock before the game summary does.
  const comp = (data as { header?: { competitions?: { date?: string }[] } })?.header?.competitions?.[0];
  const day = easternDay(typeof comp?.date === "string" ? comp.date : null);
  if (!day) return snap;
  try {
    const board = await memoJson(`${base}/scoreboard?dates=${day}&limit=300`);
    const fresh = freshestStatus(snap, statusFromScoreboard(board, id));
    const bug = bugFromScoreboard(board, id);
    const merged = bug && fresh.state === "in" ? { ...fresh, bug: { ...(fresh.bug ?? {}), ...bug } } : fresh;
    // Scoreboard was as fresh or fresher: take its down and distance too.
    if (fresh !== snap && merged.drives.length) {
      const sit = situationFromScoreboard(board, id, merged);
      if (sit) return { ...merged, situation: sit };
    }
    return merged;
  } catch {
    return snap;
  }
}


export async function getScores(): Promise<{ fetchedAt: string; scores: ScoreRow[] }> {
  const day = sportsDate();
  const rows = await Promise.all(
    LEAGUES.map(async (league) => {
      try {
        const data = await memoJson(
          `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.slug}/scoreboard?dates=${day}&limit=100`
        );
        return parseScoreboard(league, data).games.map(
          (g): ScoreRow => ({
            id: g.id,
            league: g.league,
            state: g.state,
            detail: g.detail,
            clock: g.clock,
            awayScore: g.away.score,
            homeScore: g.home.score,
            awayAbbr: g.away.abbr,
            homeAbbr: g.home.abbr,
            awayId: g.away.id,
            homeId: g.home.id,
          })
        );
      } catch {
        return [] as ScoreRow[];
      }
    })
  );
  return { fetchedAt: new Date().toISOString(), scores: rows.flat() };
}
