import "server-only";
/**
 * Every game in progress right now, across every league the site lists. One pull of each scoreboard,
 * shared by every viewer for a few seconds. Real ESPN scores only.
 */
import { getJson } from "@/lib/espn";
import { LEAGUES, parseScoreboard, sportsDate } from "@/lib/slate";
import { parseSportScoreboard, SPORT_LEAGUES } from "@/lib/sports";
import { gameRoute } from "@/lib/gameRoute";

export type AllLiveSide = { name: string; short: string; score: string | null; logo: string | null; color: string | null };

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
};

export type AllLive = { fetchedAt: string; games: AllLiveGame[]; leagues: { id: string; label: string; count: number }[] };

const BASE = "https://site.api.espn.com/apis/site/v2/sports/";
const GROUP: Record<string, string> = { nfl: "Football", ncaaf: "Football", nba: "Basketball", mlb: "Baseball", nhl: "Hockey" };
/** Every FBS / D-I game, not only ranked ones. */
const GROUPS: Record<string, string> = { ncaaf: "&groups=80", ncaam: "?groups=50", ncaaw: "?groups=50" };
const TTL_MS = 5_000;
let memo: { at: number; value: Promise<AllLive> } | null = null;

async function pull(): Promise<AllLive> {
  const day = sportsDate();
  const core = LEAGUES.map(async (l): Promise<AllLiveGame[]> => {
    try {
      const data = await getJson(`${BASE}${l.sport}/${l.slug}/scoreboard?dates=${day}&limit=300${GROUPS[l.id] ?? ""}`, 1);
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
    } catch {
      return [];
    }
  });
  const extra = SPORT_LEAGUES.map(async (l): Promise<AllLiveGame[]> => {
    try {
      const data = await getJson(`${BASE}${l.path}/scoreboard${GROUPS[l.id] ?? ""}`, 1);
      const { matches, golf } = parseSportScoreboard(l, data);
      const out: AllLiveGame[] = matches
        .filter((m) => m.state === "in")
        .map((m) => ({
          key: `${l.id}/${m.id}`,
          league: l.id,
          label: l.label,
          group: l.group,
          id: m.id,
          href: gameRoute(l.id, m.id),
          detail: m.detail,
          event: l.kind === "team" || l.kind === "soccer" ? null : m.event || null,
          away: { name: m.away.name, short: m.away.short, score: m.away.score, logo: m.away.logo, color: m.away.color ? `#${m.away.color}` : null },
          home: { name: m.home.name, short: m.home.short, score: m.home.score, logo: m.home.logo, color: m.home.color ? `#${m.home.color}` : null },
          sets: l.kind === "tennis" ? { away: m.away.sets, home: m.home.sets } : undefined,
        }));
      for (const b of golf.filter((g) => g.state === "in")) {
        out.push({
          key: `${l.id}/${b.id}`,
          league: l.id,
          label: l.label,
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
    } catch {
      return [];
    }
  });
  const games = (await Promise.all([...core, ...extra])).flat();
  const leagues: AllLive["leagues"] = [];
  for (const g of games) {
    const have = leagues.find((x) => x.id === g.league);
    if (have) have.count++;
    else leagues.push({ id: g.league, label: g.label, count: 1 });
  }
  return { fetchedAt: new Date().toISOString(), games, leagues };
}

export function getAllLive(): Promise<AllLive> {
  const now = Date.now();
  if (memo && now - memo.at < TTL_MS) return memo.value;
  const value = pull();
  memo = { at: now, value };
  value.catch(() => (memo = null));
  return value;
}
