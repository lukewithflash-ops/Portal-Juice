import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { statFromMarket, statLabel } from "@/lib/breakdown";
import { runBreakdown } from "@/lib/checkRun";
import { getGameDetail, getLive, getScores } from "@/lib/espn";
import { chooseLean } from "@/lib/gameLean";
import { noVig, winPct } from "@/lib/winPct";
import { leagueById } from "@/lib/slate";
import { researchGame } from "@/lib/research";
import { findPlayer } from "@/lib/slipRead";
import { SPORT_LEAGUES } from "@/lib/sports";
import { getSportSlate } from "@/lib/sportsFetch";
import { LEAGUES } from "@/lib/slate";
import {
  TEAM_LEAGUES,
  depthChart,
  headToHead,
  leagueInjuries,
  leagueLeaders,
  lgById,
  matchupPreview,
  norm as normData,
  playerLog as playerLogData,
  playerSplits,
  resolvePair,
  resolveTeam,
  standings,
  teamDefense,
  teamProfile,
  teamStatRank,
  type Lg,
  type TeamRef,
} from "@/lib/askData";

/** Plain-words guide to the site. The model answers site questions from this only. */
export const SITE_HELP = `Portal Juice guide:
- Lines: every posted line and how it moved since open (DraftKings). Green = better price for that side, red = worse. Totals moves are off-white.
- Games: today's games across NFL, NBA, MLB, NHL, NCAAF plus WNBA, NCAAM, NCAAW, soccer (EPL, UCL, La Liga, Serie A, Bundesliga, MLS), tennis (ATP, WTA), golf (PGA), UFC. Sticky league bar at the top. Each game page has a live score bug, play-by-play, box score, projected win % (ESPN projection or from the moneyline with vig removed), and "Our lean".
- Best: the biggest line moves and best numbers right now.
- Props: player prop lines and moves.
- Log (/lines/portfolio): picks you saved. Tally is wins, losses, pushes, open. Live meters show each leg's progress and chance to hit (an estimate from pace and price, not a guarantee). Every saved slip has a Break it down button and a summary.
- Breakdown (/check, under More): pros and cons for any leg or parlay from ESPN numbers. Lean meter, strongest and weakest leg, combined chance from the prices.
- Slip upload: on Breakdown or Log tap "Import your slip". Upload a slip photo, paste a share link, or paste slip text. Check each row (pick the stat from the dropdown if needed), then "Break it down" (no saving needed) or "Track it" (saves to Log).
- Portal Pick: one free pick a day. Not a guarantee. Shown with its small sample record.
- Alerts: tap the bell or the "Turn on notifications" banner, then Enable. "Send me a test" checks it. Alerts cover hits, close calls, big plays, lead changes, finals for games you follow. "Mute game" on a notification silences that game.
- Add to Home Screen: iPhone: open in Safari, tap Share, then Add to Home Screen; open Portal Juice from the icon, then enable alerts (iOS needs this for notifications). Android: browser menu, Install app.
- Ask Portal AI (/ask, under More): this assistant.
Portal Juice does not take bets or place bets. It is not a book.`;

const ALL_IDS = [...LEAGUES.map((l) => l.id), ...SPORT_LEAGUES.map((l) => l.id)] as string[];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export const askTools = {
  todaysGames: tool({
    description: "Today's games and live scores. Filter by league id and/or a team name or abbreviation (e.g. 'Cowboys', 'DAL').",
    inputSchema: z.object({
      league: z.string().optional().describe(`League id, one of: ${ALL_IDS.join(", ")}`),
      team: z.string().optional().describe("Team name, city, nickname, or abbreviation"),
    }),
    execute: async ({ league, team }) => {
      const t = team ? norm(team) : "";
      if (t) await loadTeamWords();
      const core = (await getScores().catch(() => ({ scores: [] }))).scores
        .filter((r) => !league || r.league === league)
        .map((r) => ({ league: r.league, id: r.id, game: `${r.awayAbbr} @ ${r.homeAbbr}`, score: `${r.awayAbbr} ${r.awayScore ?? "-"} - ${r.homeScore ?? "-"} ${r.homeAbbr}`, state: r.state, status: r.detail, names: `${r.awayAbbr} ${r.homeAbbr}` }));
      const extraIds = league ? SPORT_LEAGUES.filter((l) => l.id === league) : t ? SPORT_LEAGUES.filter((l) => l.kind !== "golf") : [];
      const extra = (
        await Promise.all(
          extraIds.map(async (l) => {
            const s = await getSportSlate(l.id).catch(() => null);
            return (s?.matches ?? []).map((m) => ({ league: l.id, id: m.id, game: `${m.away.short} @ ${m.home.short}`, score: `${m.away.short} ${m.away.score ?? "-"} - ${m.home.score ?? "-"} ${m.home.short}`, state: m.state, status: m.detail, names: `${m.away.name} ${m.home.name} ${m.away.short} ${m.home.short}` }));
          })
        )
      ).flat();
      let rows = [...core, ...extra];
      if (t) {
        // Core rows carry abbreviations only: match full names through ESPN's team list words.
        const nick: Record<string, string[]> = TEAM_WORDS;
        rows = rows.filter((r) => {
          const n = norm(r.names);
          if (n.split(" ").includes(t) || n.includes(t)) return true;
          return r.names.split(" ").some((ab) => (nick[`${r.league}:${ab}`] ?? []).some((w) => t.includes(w)));
        });
      }
      return { count: rows.length, games: rows.slice(0, 25).map(({ names, ...r }) => (void names, r)) };
    },
  }),
  rankGames: tool({
    description:
      "Rank games by who is most likely to win: projected win % per team (ESPN projection, live ESPN win probability, or no-vig DraftKings moneyline), team records, recent form, scoring margins, and Portal Juice's lean per game. Use for 'best teams', 'most likely to win', 'safest favorites', 'who wins today'. Pass league and/or game ids from todaysGames; with neither, ranks today's games in all main leagues.",
    inputSchema: z.object({
      league: z.string().optional().describe(`League id, one of: ${ALL_IDS.join(", ")}`),
      ids: z.array(z.string()).optional().describe("ESPN game ids to limit to (from todaysGames)"),
    }),
    execute: async ({ league, ids }) => {
      let list: { league: string; id: string }[] = [];
      if (ids?.length && league) list = ids.map((id) => ({ league, id }));
      else {
        const core = (await getScores().catch(() => ({ scores: [] }))).scores.filter((r) => r.state !== "post" && (!league || r.league === league)).map((r) => ({ league: r.league, id: r.id }));
        const extra = league && !leagueById(league) ? ((await getSportSlate(league).catch(() => null))?.matches ?? []).filter((m) => m.state !== "post").map((m) => ({ league, id: m.id })) : [];
        list = [...core, ...extra].filter((g) => !ids?.length || ids.includes(g.id));
      }
      list = list.slice(0, 14);
      const rows = await Promise.all(
        list.map(async ({ league: lg, id }) => {
          const [g, bundle] = await Promise.all([researchGame(lg, id).catch(() => null), leagueById(lg) ? getGameDetail(lg, id).catch(() => null) : Promise.resolve(null)]);
          if (!g) return null;
          let win = bundle
            ? winPct({ state: bundle.game.state, liveHome: bundle.detail.liveHomeWin ?? bundle.game.liveHomeWin, projection: bundle.detail.projection, homeMl: bundle.game.price?.homeMl, awayMl: bundle.game.price?.awayMl, drawMl: bundle.game.price?.drawMl })
            : null;
          if (!win && g.odds?.homeMl != null && g.odds?.awayMl != null) {
            const nv = noVig(g.odds.homeMl, g.odds.awayMl, (g.odds as { drawMl?: number | null }).drawMl ?? null);
            if (nv) win = { ...nv, source: "moneyline", label: "From the moneyline, vig removed" };
          }
          const lean = chooseLean(g);
          const t = (x: typeof g.home) => ({ team: x.name, record: x.record, last5: x.form.map((f) => f.result).join(""), scoredPerGame: x.ppg, allowedPerGame: x.papg, ats: x.ats });
          const fav = win ? (win.home >= win.away ? { team: g.home.name, pct: win.home } : { team: g.away.name, pct: win.away }) : null;
          return {
            league: lg,
            id,
            game: g.label,
            state: g.state,
            winPct: win ? { home: win.home, away: win.away, draw: win.draw, source: win.label } : "Not enough data",
            favorite: fav,
            away: t(g.away),
            home: t(g.home),
            ourLean: lean.kind === "lean" ? { pick: lean.report.title, score: lean.report.score, reasons: lean.points.map((p) => `${p.pro ? "+" : "-"} ${p.text}`) } : lean.reason,
          };
        })
      );
      const ok = rows.filter((r): r is NonNullable<typeof r> => !!r);
      ok.sort((a, b) => (b.favorite?.pct ?? 0) - (a.favorite?.pct ?? 0));
      return { count: ok.length, rankedByWinPct: ok, note: "Win % is an estimate. Not a guarantee." };
    },
  }),
  gameDetail: tool({
    description: "Live or final detail for one game: score, clock, situation, ESPN live win chance, last plays, and the full player box score. Use ids from todaysGames.",
    inputSchema: z.object({ league: z.string(), id: z.string() }),
    execute: async ({ league, id }) => {
      const s = await getLive(league, id).catch(() => null);
      if (!s) return { error: "Not enough data: ESPN has no live feed for that game." };
      return {
        state: s.state,
        status: s.detail,
        score: `${s.awayAbbr} ${s.awayScore ?? 0} - ${s.homeScore ?? 0} ${s.homeAbbr}`,
        homeWinChance: s.homeWin,
        lastPlays: s.plays.slice(-6).map((p) => p.text),
        situation: (s as { situation?: unknown }).situation ?? null,
        box: s.boxes.map((b) => ({ team: b.abbr, columns: b.columns, players: b.players.filter((p) => p.played).slice(0, 14).map((p) => ({ name: p.name, stats: p.stats })) })),
      };
    },
  }),
  oddsAndForm: tool({
    description: "Pregame odds (DraftKings), line moves since open, team records, recent form, scoring ranks, injuries for one game.",
    inputSchema: z.object({ league: z.string(), id: z.string() }),
    execute: async ({ league, id }) => {
      const g = await researchGame(league, id).catch(() => null);
      if (!g) return { error: "Not enough data for that game." };
      const team = (t: typeof g.home) => ({ team: t.name, record: t.record, last5: t.form.map((f) => `${f.result} ${f.pf}-${f.pa} vs ${f.opp}`), scoredPerGame: t.ppg, allowedPerGame: t.papg, ats: t.ats, injuries: t.injuries.slice(0, 6) });
      return { game: g.label, start: g.start, state: g.state, odds: g.odds, away: team(g.away), home: team(g.home) };
    },
  }),
  playerLog: tool({
    description:
      "A player's game log for one stat from ESPN (newest first): values per game, last-5 and season averages, highs/lows. Optional: last N games, vsTeam (scans up to 6 past seasons for games vs that team, e.g. 'Brunson vs Celtics'), line (prop hit rate: over/under/push counts and %), seasons (how many seasons back). Works for NFL, NBA, MLB, NHL, college, WNBA.",
    inputSchema: z.object({
      name: z.string(),
      stat: z.string().describe("Stat in words, e.g. 'points', 'rushing yards', 'receptions', 'hits', 'shots on goal', 'PRA', 'fantasy score'"),
      last: z.number().int().min(1).max(40).optional().describe("How many games to show (default 10, or 20 with vsTeam)"),
      vsTeam: z.string().optional().describe("Opponent team name or abbreviation to filter to"),
      line: z.number().optional().describe("Prop line to compute the hit rate against"),
      seasons: z.number().int().min(1).max(8).optional().describe("Seasons to include (default 1; 6 with vsTeam)"),
    }),
    execute: async ({ name, stat, last, vsTeam, line, seasons }) => {
      const p = await findPlayer(name, []);
      if (!p) return { missing: `No ESPN player found named "${name}". Check the spelling.` };
      const l = lgById(p.league);
      if (!l) return { missing: `ESPN game logs for ${p.name} (${p.league}) aren't supported here.` };
      const key = statFromMarket(p.league, stat);
      if (!key) return { missing: `Can't read "${stat}" from an ESPN ${l.label} game log. Try a box-score stat (e.g. points, rebounds, passing yards, hits, shots).` };
      let vsAbbr: string | null = null;
      if (vsTeam) {
        const t = await resolveTeam(vsTeam, l.id).catch(() => null);
        if (!t) return { missing: `No ${l.label} team matching "${vsTeam}".` };
        vsAbbr = t.team.abbr;
      }
      return playerLogData(l, { id: p.id, league: l.id, name: p.name }, key, statLabel(p.league, key), { last, vsAbbr, line: line ?? null, seasons });
    },
  }),
  playerSplits: tool({
    description: "A player's season splits from ESPN: home/away, wins/losses, by month, by opponent and more (whatever ESPN lists for that sport), with per-game averages.",
    inputSchema: z.object({ name: z.string() }),
    execute: async ({ name }) => {
      const p = await findPlayer(name, []);
      if (!p) return { missing: `No ESPN player found named "${name}".` };
      const l = lgById(p.league);
      if (!l) return { missing: `ESPN splits for ${p.name} aren't supported here.` };
      return playerSplits(l, { id: p.id, league: l.id, name: p.name });
    },
  }),
  headToHead: tool({
    description:
      "Last N meetings between two teams from ESPN schedules (scans back through past seasons, regular season and playoffs): dates, scores, winners, plus the pregame spread/total ESPN has on file (DraftKings when available, otherwise the book ESPN lists, named) with ATS and over/under results. Use for 'last 5 times X played Y', 'history between', 'series record'.",
    inputSchema: z.object({
      teamA: z.string().describe("Team name, city, nickname or abbreviation"),
      teamB: z.string(),
      league: z.string().optional().describe(`League id if known: ${TEAM_LEAGUES.map((l) => l.id).join(", ")}`),
      count: z.number().int().min(1).max(15).optional().describe("How many meetings (default 5)"),
    }),
    execute: async ({ teamA, teamB, league, count }) => {
      const pair = await resolvePair(teamA, teamB, league).catch(() => null);
      if (!pair) return { missing: `Couldn't match both "${teamA}" and "${teamB}" to teams in one ESPN league. Pass the league id.` };
      return headToHead(pair[0], pair[1], count ?? 5);
    },
  }),
  teamProfile: tool({
    description:
      "One team's season snapshot from ESPN: overall/home/away records, points for/against per game, standing, streak, last 10 results, ATS and over/under record from real closing lines (DraftKings via ESPN), next game id.",
    inputSchema: z.object({ team: z.string(), league: z.string().optional() }),
    execute: async ({ team, league }) => {
      const t = await teamOf(team, league);
      return "missing" in t ? t : teamProfile(t.team);
    },
  }),
  teamDefense: tool({
    description:
      "A team's defense / what it allows, with league ranks across all teams (ESPN team stats, opponent splits). NFL/NCAAF: points, total, passing and rushing yards allowed per game, yards per carry/attempt allowed, sacks, takeaways, INTs, opponent 3rd-down %, red-zone TD % allowed. NBA/WNBA/college: opponent PPG, FG%, 3P%, rebounds, turnovers forced, steals, blocks. NHL: goals and shots against per game, save %, PK %. MLB: team ERA, opponent average, WHIP, runs/HR allowed.",
    inputSchema: z.object({ team: z.string(), league: z.string().optional() }),
    execute: async ({ team, league }) => {
      const t = await teamOf(team, league);
      return "missing" in t ? t : teamDefense(t.team).catch(() => ({ missing: "ESPN team stats didn't load. Try again." }));
    },
  }),
  teamStats: tool({
    description:
      "Look up ANY team stat by name for every team in a league and rank them (ESPN team stats). side 'team' = the team's own numbers (offense, own pitching/goalie stats); side 'opponent' = what opponents did vs that team (allowed). Use for 'which defenses allow the most rushing yards' (side opponent, order most), 'best 3-point shooting teams', 'most goals per game', 'lowest team ERA', or one team's value and rank. If no match, it returns the stat names available.",
    inputSchema: z.object({
      league: z.string().describe(`League id: ${TEAM_LEAGUES.filter((l) => l.kind === "team").map((l) => l.id).join(", ")}`),
      stat: z.string().describe("Stat in words, e.g. 'rushing yards per game', 'points per game', 'three point percentage', 'goals against average', 'ERA', 'sacks'"),
      side: z.enum(["team", "opponent"]).default("team"),
      order: z.enum(["most", "least"]).default("most").describe("Sort: most = highest first"),
      team: z.string().optional().describe("A team to report value and rank for"),
      top: z.number().int().min(3).max(32).optional(),
    }),
    execute: async ({ league, stat, side, order, team, top }) => {
      const l = lgById(league);
      if (!l || l.kind !== "team") return { missing: `Team stat tables are for ${TEAM_LEAGUES.filter((x) => x.kind === "team").map((x) => x.id).join(", ")}.` };
      const t = team ? await resolveTeam(team, l.id).catch(() => null) : null;
      return teamStatRank(l, stat, side, order, t?.team ?? null, top ?? 10).catch(() => ({ missing: "ESPN team stats didn't load. Try again." }));
    },
  }),
  standings: tool({
    description: "League standings from ESPN by conference/division: W-L(-OTL), win %, games back, streak, points for/against, home/road, last 10, playoff seed.",
    inputSchema: z.object({ league: z.string() }),
    execute: async ({ league }) => {
      const l = lgById(league);
      if (!l) return { missing: `Unknown league "${league}".` };
      return standings(l).catch(() => ({ missing: `ESPN has no standings for ${l.label} right now.` }));
    },
  }),
  injuries: tool({
    description: "Current injury report from ESPN for a team (or the whole league if no team): player, position, status (Out, Questionable...), injury, expected return, latest note.",
    inputSchema: z.object({ team: z.string().optional(), league: z.string().optional() }),
    execute: async ({ team, league }) => {
      let l: Lg | null = lgById(league);
      let t: TeamRef | null = null;
      if (team) {
        const r = await teamOf(team, league);
        if ("missing" in r) return r;
        t = r.team;
        l = lgById(t.league);
      }
      if (!l) return { missing: "Pass a team or a league id." };
      const all = await leagueInjuries(l).catch(() => null);
      if (!all) return { missing: `ESPN has no ${l.label} injury report right now.` };
      if (t) {
        const row = all.find((x) => x.teamId === t!.id);
        return row ? { team: row.team, players: row.players } : { team: t.name, players: [], note: "No injuries listed by ESPN for this team." };
      }
      return { league: l.label, teams: all.map((x) => ({ team: x.team, players: x.players.slice(0, 8).map((p) => `${p.name} (${p.pos}) ${p.status}${p.injury ? ", " + p.injury : ""}`) })) };
    },
  }),
  depthChart: tool({
    description: "A team's ESPN depth chart (starters and backups by position; NFL/college football), or its roster by position for other leagues.",
    inputSchema: z.object({ team: z.string(), league: z.string().optional() }),
    execute: async ({ team, league }) => {
      const t = await teamOf(team, league);
      return "missing" in t ? t : depthChart(t.team);
    },
  }),
  matchupPreview: tool({
    description:
      "Everything ESPN has for one game: ESPN Matchup Predictor win %, DraftKings spread/total/moneyline with open vs now, venue, weather, injuries both sides, season leaders, last five results, season series, TV. Pass league + id (from todaysGames) or a team to use its next game.",
    inputSchema: z.object({ league: z.string().optional(), id: z.string().optional(), team: z.string().optional() }),
    execute: async ({ league, id, team }) => {
      let l = lgById(league);
      let gid = id && /^\d+$/.test(id) ? id : null;
      if (!gid && team) {
        const t = await teamOf(team, league);
        if ("missing" in t) return t;
        l = lgById(t.team.league);
        const prof = await teamProfile(t.team).catch(() => null);
        gid = prof?.nextGame?.id ?? null;
        if (!gid) return { missing: `ESPN lists no upcoming game for ${t.team.name}.` };
      }
      if (!l || !gid) return { missing: "Pass league and game id, or a team." };
      return matchupPreview(l, gid).catch(() => ({ missing: "ESPN summary didn't load. Try again." }));
    },
  }),
  leagueLeaders: tool({
    description: "Season stat leaders from ESPN for a league (top 10 per category: points, passing yards, home runs, goals...). Optional stat words to filter categories.",
    inputSchema: z.object({ league: z.string(), stat: z.string().optional() }),
    execute: async ({ league, stat }) => {
      const l = lgById(league);
      if (!l) return { missing: `Unknown league "${league}".` };
      const r = await leagueLeaders(l).catch(() => null);
      if (!r) return { missing: `ESPN has no ${l.label} leaders right now.` };
      if (!stat) return r;
      const w = normData(stat).split(" ").filter((x) => x.length > 2);
      const cats = r.categories.filter((c) => w.some((x) => normData(`${c.stat} ${c.key}`).includes(x)));
      return { season: r.season, categories: cats.length ? cats : r.categories, note: cats.length ? undefined : `No category matched "${stat}"; all categories shown.` };
    },
  }),
  breakdown: tool({
    description: "Run the Portal Juice breakdown on up to 6 legs. Props need athleteName, market (stat words), line, pick; league/gameId optional (empty string if unknown). Team legs need league, gameId, kind, team.",
    inputSchema: z.object({
      legs: z
        .array(
          z.object({
            league: z.string().default(""),
            gameId: z.string().default(""),
            kind: z.enum(["prop", "spread", "total", "moneyline"]),
            athleteName: z.string().optional(),
            market: z.string().optional(),
            team: z.string().optional(),
            line: z.number().nullable().optional(),
            pick: z.enum(["over", "under"]).optional(),
            odds: z.number().nullable().optional(),
          })
        )
        .max(6),
    }),
    execute: async ({ legs }) => {
      const r = await runBreakdown(legs);
      if (!r) return { error: "Not enough data: no legs." };
      return {
        legs: r.reports.map((x) => ({ title: x.title, sub: x.sub, lean: x.lean, score: x.score, implied: x.implied, pros: x.pros.map((p) => p.text), cons: x.cons.map((p) => p.text), facts: x.facts.map((f) => `${f.label}: ${f.value}`) })),
        parlay: r.parlay ? { combinedFromPrices: r.parlay.combined, summary: r.parlay.summary } : null,
      };
    },
  }),
  siteHelp: tool({
    description: "How Portal Juice works: pages, slip upload, alerts, Portal Pick, Add to Home Screen.",
    inputSchema: z.object({}),
    execute: async () => ({ guide: SITE_HELP }),
  }),
};

/** City and nickname words for core-league abbreviations, so "Cowboys" finds DAL. Filled from ESPN team lists once per instance. */
const TEAM_WORDS: Record<string, string[]> = {};
let loaded: Promise<void> | null = null;
export function loadTeamWords(): Promise<void> {
  if (!loaded)
    loaded = Promise.all(
      LEAGUES.map(async (l) => {
        try {
          const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${l.sport}/${l.slug}/teams?limit=400`, { next: { revalidate: 86400 } });
          const d = (await r.json()) as { sports?: { leagues?: { teams?: { team: { abbreviation: string; displayName: string; name?: string; location?: string } }[] }[] }[] };
          for (const { team } of d.sports?.[0]?.leagues?.[0]?.teams ?? []) {
            TEAM_WORDS[`${l.id}:${team.abbreviation}`] = [norm(team.displayName), norm(team.name ?? ""), norm(team.location ?? "")].filter((w) => w.length >= 3);
          }
        } catch {
          /* fall back to abbreviations */
        }
      })
    ).then(() => undefined);
  return loaded;
}

async function teamOf(q: string, league?: string): Promise<{ team: TeamRef } | { missing: string }> {
  const r = await resolveTeam(q, league).catch(() => null);
  if (!r) return { missing: `No team matching "${q}"${league ? ` in ${league}` : ""}. Try the full name or pass the league id.` };
  return { team: r.team };
}
