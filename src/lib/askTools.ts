import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { statFromMarket, statLabel } from "@/lib/breakdown";
import { runBreakdown } from "@/lib/checkRun";
import { getGameDetail, getLive, getScores } from "@/lib/espn";
import { chooseLean } from "@/lib/gameLean";
import { noVig, winPct } from "@/lib/winPct";
import { leagueById } from "@/lib/slate";
import { researchGame, researchPlayer } from "@/lib/research";
import { findPlayer } from "@/lib/slipRead";
import { SPORT_LEAGUES } from "@/lib/sports";
import { getSportSlate } from "@/lib/sportsFetch";
import { LEAGUES } from "@/lib/slate";

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
    description: "Live or final detail for one game: score, clock, and top player box score lines. Use ids from todaysGames.",
    inputSchema: z.object({ league: z.string(), id: z.string() }),
    execute: async ({ league, id }) => {
      const s = await getLive(league, id).catch(() => null);
      if (!s) return { error: "Not enough data: ESPN has no live feed for that game." };
      return {
        state: s.state,
        status: s.detail,
        score: `${s.awayAbbr} ${s.awayScore ?? 0} - ${s.homeScore ?? 0} ${s.homeAbbr}`,
        homeWinChance: s.homeWin,
        lastPlays: s.plays.slice(-4).map((p) => p.text),
        box: s.boxes.map((b) => ({ team: b.abbr, columns: b.columns, players: b.players.filter((p) => p.played).slice(0, 8).map((p) => ({ name: p.name, stats: p.stats })) })),
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
    description: "A player's recent game log for one stat (newest first) and season average, from ESPN. Works across leagues.",
    inputSchema: z.object({ name: z.string(), stat: z.string().describe("Stat in words, e.g. 'points', 'passing yards', 'fantasy score', 'longest rush'") }),
    execute: async ({ name, stat }) => {
      const p = await findPlayer(name, []);
      if (!p) return { error: `Not enough data: no ESPN player named ${name}.` };
      const key = statFromMarket(p.league, stat);
      if (!key) return { error: `Not enough data: can't read "${stat}" from a game log.` };
      const r = await researchPlayer(p.league, p.id, key).catch(() => null);
      if (!r || !r.games.length) return { error: "Not enough data: ESPN has no game log for this player and stat." };
      const v = r.games.map((g) => g.value);
      const avg = (xs: number[]) => Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10;
      return { player: r.name || p.name, team: r.team, league: p.league, stat: statLabel(p.league, key), last10: r.games.slice(0, 10).map((g) => ({ date: g.date.slice(0, 10), value: g.value, opp: g.opp, home: g.home })), last5Avg: avg(v.slice(0, 5)), last10Avg: avg(v.slice(0, 10)), seasonAvg: avg(v), games: v.length };
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
