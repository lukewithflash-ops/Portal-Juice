import "server-only";
import { unstable_cache } from "next/cache";
import { allowedHeadshot } from "@/lib/headshots";
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
  type Trend,
} from "@/lib/slate";

const REVALIDATE = 60;

async function getJson(url: string): Promise<unknown> {
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

export function getSlate(): Promise<Slate> {
  const day = sportsDate();
  return unstable_cache(() => loadSlate(day), ["pj-slate", day], { revalidate: REVALIDATE })();
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
    ["pj-game", league.id, id],
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

