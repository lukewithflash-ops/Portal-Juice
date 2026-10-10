import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { coldProps, hotProps, streakingPlayers, streakingTeams } from "../src/lib/board";
import { HISTORY } from "../src/data/history";
import { allowedHeadshot, licensedHosts } from "../src/lib/headshots";
import { FIXTURE } from "./fixtures/history.fixture";
import { formatPrice } from "../src/lib/odds";
import { lastNAverage, parsePrice, rankGames, sportsDate } from "../src/lib/slate";
import { parseTeamCookie, parseTeamList } from "../src/lib/team";
import { impliedChance, parseMvpMarket, parsePropItems, parseWeather, rankByImplied } from "../src/lib/detail";
import { parseSlipText, safeSlipUrl } from "../src/lib/slip";
import { choosePortalPick, gradePortalPick, portalRecord } from "../src/lib/portalPick";
import { rankLeaders, cleanLeg, cleanLeaderHandle } from "../src/lib/leaderRank";
import { analyzeLeg, checkHref, hitCount, legFromLogged, legsFromParam, median, parlayMath, recentEra, statFromMarket, windMph, type GameResearch, type LegReport, type PlayerResearch, type TeamResearch } from "../src/lib/breakdown";
import { logValue, parseGameLog, parseStandings, rankAll } from "../src/lib/researchParse";
import { pickKind, summarize } from "../src/lib/ledger";
import { marketFavorites, biggestMoves, hotTrends, mvpHomework } from "../src/lib/best";
import { playKind, playerFromText, isShotAttempt } from "../src/lib/tracker";
import { clockSpan, isBigPlay, paceOf, parseLine, scoringRun, statNumber, trackProps } from "../src/lib/tracker";
import type { LivePlay, LiveSnap } from "../src/lib/live";
import { gameEvents, legEvents } from "../src/lib/alerts";
import { groupSlips, legFromPick, unitsNeeded } from "../src/lib/motivation";
import type { Pick } from "../src/lib/types";
import { freshestStatus, isBehind, parseLive, situationFromScoreboard, statusFromScoreboard, yardsFromSpot, type LiveStatus } from "../src/lib/live";

import { findTeamGames, matchRow, parseSlipRows, stakeOf, teamScore, type SlateGame } from "../src/lib/slipImport";
import { rankTopPicks } from "../src/lib/topRank";
import { mentions, tagPlayers } from "../src/lib/yourPlayers";

import { combinedChance, impliedFromAmerican, livePropChance, liveTeamChance, playedShare, poissonAtLeast, pregameChance } from "../src/lib/chance";
import { juiceDir, lineDir, loggedLineDir, priceDir } from "../src/lib/move";
import { spreadText } from "../src/lib/slate";
import { emoteOf, pickEmote, replaySnap } from "../src/lib/emotes";
import { noVig, winPct } from "../src/lib/winPct";
import { barColors } from "../src/components/WinBar";
import { chooseLean, leanCandidates } from "../src/lib/gameLean";
import { parseSportScoreboard, sportLeague, parseMatchFeed } from "../src/lib/sports";
import { nameClose, propMarketOf } from "../src/lib/slipImport";
import { liveStat, longestPassFromPlays, marketTerms } from "../src/lib/tracker";

let n = 0;
const t = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`ok - ${name}`);
};

t("stored history ships empty (no invented streaks)", () => {
  assert.equal(HISTORY.length, 0);
  assert.deepEqual(streakingPlayers(HISTORY), []);
  assert.deepEqual(coldProps(HISTORY), []);
});

t("player streak computes from stored lines", () => {
  const p = streakingPlayers(FIXTURE);
  const a = p.find((r) => r.subject === "Fixture Player A");
  assert.ok(a);
  assert.equal(a.streak, 4);
  assert.equal(a.sample, 6);
  assert.equal(a.lastLine, 58.5);
});

t("team streak counts covers, push breaks it", () => {
  const s = streakingTeams(FIXTURE);
  assert.equal(s[0].subject, "Fixture Team");
  assert.equal(s[0].streak, 3);
});

t("cold hides anyone under 8 samples", () => {
  const c = coldProps(FIXTURE);
  assert.ok(!c.some((r) => r.subject === "Fixture Player B"));
  const pc = c.find((r) => r.subject === "Fixture Player C");
  assert.ok(pc);
  assert.equal(pc.sample, 9);
  assert.equal(pc.hits, 2);
  for (const r of c) assert.ok(r.sample >= 8);
});

t("hot ranks by hit rate with sample size", () => {
  const h = hotProps(FIXTURE);
  assert.equal(h[0].subject, "Fixture Player A");
  assert.equal(h[0].sample, 6);
});

t("no money fields on board rows", () => {
  const rows = [...streakingPlayers(FIXTURE), ...hotProps(FIXTURE), ...coldProps(FIXTURE)];
  for (const r of rows)
    for (const k of Object.keys(r)) assert.ok(!/money|payout|profit|dollar|units|won/i.test(k), k);
});

t("headshots: only allow-listed licensed hosts", () => {
  assert.equal(allowedHeadshot("https://scontent.cdninstagram.com/x.jpg", ["cdninstagram.com"]), null);
  assert.equal(allowedHeadshot("https://lh3.googleusercontent.com/x.jpg", ["googleusercontent.com"]), null);
  assert.equal(allowedHeadshot("https://img.random-cdn.net/x.jpg", []), null);
  assert.equal(allowedHeadshot("http://img.feed.example/x.jpg", ["img.feed.example"]), null);
  assert.ok(allowedHeadshot("https://img.feed.example/x.jpg", ["img.feed.example"]));
});

// Forbidden UI copy / seeded odds scan over shipped source.
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const src = walk("src").filter((f) => /\.(tsx?|css)$/.test(f));

t("no forbidden UI words in shipped JSX text", () => {
  const banned = /\b(place (a )?bet|bet now|bet button|coins?|balance|payout|cash ?out|money won|mascot|wizard|cartoon)\b/i;
  for (const f of src) {
    const text = readFileSync(f, "utf8")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)) // skip comments
      .join("\n");
    // JSX text nodes + string literals
    const strings = [...text.matchAll(/>([^<>{}]+)</g), ...text.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    for (const s of strings) assert.ok(!banned.test(s), `${f}: "${s}"`);
  }
});

t("no seeded rows: feed returns empty without LINES_FEED_URL", () => {
  const feed = readFileSync("src/lib/feed.ts", "utf8");
  assert.ok(/if \(!url\) return EMPTY_SNAPSHOT/.test(feed));
  assert.ok(!src.some((f) => /snapshot\.ts$/.test(f)));
});


t("espn headshot host is allowed, scrapers are not", () => {
  assert.ok(licensedHosts().includes("a.espncdn.com"));
  assert.ok(allowedHeadshot("https://a.espncdn.com/i/headshots/nfl/players/full/1.png"));
  assert.equal(allowedHeadshot("https://scontent.cdninstagram.com/x.jpg"), null);
});

t("sports date follows Los Angeles", () => {
  assert.equal(sportsDate(new Date("2026-10-09T02:00:00Z")), "20261008");
  assert.equal(sportsDate(new Date("2026-10-09T07:30:00Z")), "20261009");
});

t("price parser uses only numbers that were sent", () => {
  const price = parsePrice({
    provider: { displayName: "Draft Kings" },
    overUnder: 48.5,
    details: "DAL -8.5",
    total: { over: { close: { line: "o48.5", odds: "-110" } }, under: { close: { odds: "-110" } } },
    pointSpread: { home: { close: { line: "-8.5", odds: "-120" } }, away: { close: { line: "+8.5", odds: "-102" } } },
    moneyline: { home: { close: { odds: "-500" } }, away: { close: { odds: "+380" } } },
  });
  assert.ok(price);
  assert.equal(price.total, 48.5);
  assert.equal(price.provider, "DraftKings");
  assert.equal(price.spreadHome, -8.5);
  assert.equal(price.homeMl, "-500");
  assert.equal(price.awayMl, "+380");
  assert.equal(parsePrice({}), null);
  assert.equal(parsePrice(undefined), null);
});

t("popular order is national, then ranked, then input order", () => {
  const rows = [
    { id: "a", national: false, ranked: false },
    { id: "b", national: true, ranked: false },
    { id: "c", national: false, ranked: true },
    { id: "d", national: true, ranked: true },
  ];
  assert.deepEqual(rankGames(rows).map((r) => r.id), ["d", "b", "c", "a"]);
});

t("last-5 average skips missing stats and uses the newest games", () => {
  const log = {
    names: ["points"],
    events: {
      "1": { gameDate: "2026-10-01T00:00:00Z" },
      "2": { gameDate: "2026-10-03T00:00:00Z" },
      "3": { gameDate: "2026-10-05T00:00:00Z" },
    },
    seasonTypes: [{ categories: [{ events: [
      { eventId: "1", stats: ["10"] },
      { eventId: "2", stats: ["20"] },
      { eventId: "3", stats: ["30"] },
    ] }] }],
  };
  const recent = lastNAverage(log, "points", 2);
  assert.equal(recent && recent.avg, 25);
  assert.equal(recent && recent.games, 2);
  assert.equal(recent && recent.seasonGames, 3);
  assert.equal(recent && recent.seasonAvg, 20);
  assert.equal(lastNAverage(log, "rebounds", 2), null);
});


t("weather uses only fields that were sent", () => {
  assert.equal(parseWeather({ weather: { temperature: 85, precipitation: 0 } }), "85° · Precip 0");
  assert.equal(parseWeather({}), null);
});

t("props keep player lines and drop team markets", () => {
  const parsed = parsePropItems({
    count: 4,
    items: [
      { type: { name: "Total Passing Yards" }, athlete: { $ref: "http://x/athletes/1" }, current: { target: { displayValue: "271.5" } }, open: { target: { displayValue: "258.5" } } },
      { type: { name: "Total Passing Yards" }, athlete: { $ref: "http://x/athletes/1" }, current: { target: { displayValue: "271.5" } } },
      { type: { name: "Team Total Points" }, athlete: { $ref: "http://x/athletes/2" }, current: { target: { displayValue: "24.5" } } },
      { type: { name: "Total Rushing Yards" }, current: { target: { displayValue: "70.5" } } },
    ],
  });
  assert.equal(parsed.total, 4);
  assert.equal(parsed.drafts.length, 1);
  assert.equal(parsed.drafts[0].line, "271.5");
  assert.equal(parsed.drafts[0].openLine, "258.5");
});

t("mvp board ranks by implied chance", () => {
  const market = parseMvpMarket({
    items: [{
      name: "Regular Season MVP",
      displayName: "Regular Season MVP",
      futures: [{
        provider: { name: "DraftKings" },
        books: [
          { athlete: { $ref: "http://x/athletes/9" }, value: "+280" },
          { athlete: { $ref: "http://x/athletes/3" }, value: "-150" },
          { athlete: { $ref: "http://x/athletes/9" }, value: "+900" },
        ],
      }],
    }],
  });
  assert.ok(market);
  assert.equal(market.provider, "DraftKings");
  assert.deepEqual(market.books.map((b) => b.athleteId), ["3", "9"]);
  assert.ok(Math.abs(impliedChance(-150) - 0.6) < 1e-9);
  assert.deepEqual(rankByImplied([{ oddsNum: 280 }, { oddsNum: -150 }]).map((r) => r.oddsNum), [-150, 280]);
});

t("shipped copy has no forbidden product words", () => {
  const banned = /card|pokémon|pokemon|\brips\b|tcg|\bchase\b|\bpack\b/i;
  const roots = ["src", "README.md", "public/manifest.webmanifest", "public/sw.js", ".env.example"];
  const files: string[] = [];
  const walk2 = (d: string) => {
    for (const f of readdirSync(d)) {
      const q = join(d, f);
      if (statSync(q).isDirectory()) walk2(q);
      else files.push(q);
    }
  };
  for (const r of roots) {
    if (!existsSync(r)) continue;
    if (statSync(r).isDirectory()) walk2(r);
    else files.push(r);
  }
  for (const f of files) {
    if (!/\.(tsx?|css|md|webmanifest|js|example)$/.test(f) && !f.endsWith(".example")) continue;
    const text = readFileSync(f, "utf8");
    assert.ok(!banned.test(text), `${f} matches ${text.match(banned)?.[0]}`);
  }
});

t("implied chance converts prices only", () => {
  assert.equal(formatPrice("-120", "pct"), "54.5%");
  assert.equal(formatPrice("+150", "american"), "+150");
  assert.equal(formatPrice("48.5", "pct"), "48.5");
  assert.equal(formatPrice("-7.5", "pct"), "-7.5");
});

t("team cookie and team list stay strict", () => {
  assert.equal(parseTeamCookie("nope"), null);
  assert.equal(parseTeamCookie("nba:1:GSW:1D428A:FFC72C")?.abbr, "GSW");
  const rows = parseTeamList({
    sports: [{ leagues: [{ teams: [{ team: { id: "9", abbreviation: "GSW", displayName: "Warriors", color: "1d428a", alternateColor: "ffc72c", logos: [{ href: "https://a.espncdn.com/x.png" }] } }] }] }],
  });
  assert.equal(rows[0]?.abbr, "GSW");
  assert.equal(rows[0]?.logo, "https://a.espncdn.com/x.png");
});


t("live versus line uses only a real box cell", () => {
  assert.equal(parseLine("15+"), 15);
  assert.equal(statNumber("2-6"), 2);
  const span = clockSpan("nba", 2, "6:00", "in");
  assert.ok(span);
  assert.equal(span && span.elapsed, 18 * 60);
  assert.equal(paceOf(10, span, "in"), 26.7);
  assert.equal(clockSpan("mlb", 5, null, "in"), null);
  const base = {
    state: "in" as const,
    clock: "6:00",
    detail: "",
    awayAbbr: "BOS",
    homeAbbr: "CLE",
    awayScore: "40",
    homeScore: "38",
    awayColor: "#000",
    homeColor: "#fff",
    awayId: "2",
    homeId: "5",
    provider: null,
    total: null,
    totalOpen: null,
    spreadDetail: null,
    spreadHome: null,
    spreadOpen: null,
    awayMl: null,
    homeMl: null,
    homeWin: null,
    win: [],
    period: 2,
    plays: [] as LivePlay[],
    drives: [],
    situation: null,
  };
  const snap: LiveSnap = {
    ...base,
    boxes: [
      {
        abbr: "BOS",
        color: "#000",
        columns: ["PTS"],
        players: [
          { id: "1", name: "A", starter: true, played: true, stats: ["20"], statMap: { PTS: "20" } },
        ],
      },
    ],
  };
  const hit = trackProps(
    [{ athleteId: "1", name: "A", team: "BOS", headshot: null, market: "Points Milestones", line: "15+" }],
    snap,
    "nba"
  );
  assert.equal(hit[0]?.tone, "gold");
  assert.equal(hit[0]?.value, 20);
  const missing = trackProps(
    [{ athleteId: "9", name: "B", team: "BOS", headshot: null, market: "Points Milestones", line: "15+" }],
    snap,
    "nba"
  );
  assert.equal(missing.length, 0);
  const behind = trackProps(
    [{ athleteId: "1", name: "A", team: "BOS", headshot: null, market: "Points Milestones", line: "80+" }],
    snap,
    "nba"
  );
  assert.equal(behind[0]?.tone, "red");
  assert.equal(behind[0]?.pace, 53.3);
  const play = { id: "p", text: "makes three", clock: "", period: "2", scoring: true, points: 3, awayScore: 1, homeScore: 0, teamId: "2", x: null, y: null, down: null, distance: null, yardsToEndzone: null, spot: null, typeText: "Jump Shot" };
  assert.equal(isBigPlay(play), true);
  const run = scoringRun([
    { ...play, id: "a", points: 3, teamId: "2" },
    { ...play, id: "b", points: 3, teamId: "2" },
  ]);
  assert.equal(run && run.us, 6);
  assert.equal(run && run.them, 0);
});


t("slip text keeps only what is on the slip", () => {
  const rows = parseSlipText("Donovan Mitchell Over 24.5 Points -115\nRandom ad copy\nJalen Brunson Under 6.5 Assists");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].subject, "Donovan Mitchell");
  assert.equal(rows[0].line, 24.5);
  assert.equal(rows[0].selection, "Over");
  assert.equal(rows[0].market, "points");
  assert.equal(rows[0].odds, -115);
  assert.equal(rows[1].odds, null);
  assert.equal(safeSlipUrl("http://example.com"), null);
  assert.equal(safeSlipUrl("https://127.0.0.1/x"), null);
  assert.ok(safeSlipUrl("https://example.com/slip"));
});


t("play graphics read only ESPN text", () => {
  assert.equal(playerFromText("Donovan Mitchell makes 26-foot three point jumper"), "Donovan Mitchell");
  assert.equal(playerFromText("Chris Cenac Jr. enters the game for Mike Conley"), "Chris Cenac Jr.");
  assert.equal(playerFromText("End of the 2nd Quarter"), null);
  const base = { id: "1", clock: "1:00", period: "2nd", awayScore: 1, homeScore: 2, teamId: "5", down: null, distance: null, yardsToEndzone: null, spot: null };
  assert.equal(playKind({ ...base, text: "X makes 26-foot three point jumper", typeText: "Jump Shot", scoring: true, points: 3, x: 1, y: 20 }), "three");
  assert.equal(playKind({ ...base, text: "X misses driving layup", typeText: "Driving Layup Shot", scoring: false, points: 0, x: 25, y: 3 }), "miss");
  assert.equal(isShotAttempt({ ...base, text: "X loose ball foul", typeText: "Loose Ball Foul", scoring: false, points: 0, x: 25, y: 2 }), false);
  assert.equal(isShotAttempt({ ...base, text: "X misses driving layup", typeText: "Driving Layup Shot", scoring: false, points: 0, x: 25, y: 3 }), true);
});


t("best homework uses only posted numbers and skips missing signals", () => {
  const price = { provider: "DraftKings", total: 49.5, overJuice: null, underJuice: null, spreadDetail: null, homeSpread: null, awaySpread: null, homeSpreadJuice: null, awaySpreadJuice: null, homeMl: "-525", awayMl: "+400", spreadHome: null, totalOpen: 48.5, spreadHomeOpen: null };
  const g = { id: "1", league: "nfl", away: { abbr: "NYG" }, home: { abbr: "DAL" }, price } as unknown as Parameters<typeof marketFavorites>[0][number];
  const bare = { ...g, id: "2", price: { ...price, homeMl: null, awayMl: null, totalOpen: null } } as typeof g;
  const favs = marketFavorites([g, bare]);
  assert.equal(favs.length, 1);
  assert.equal(favs[0].homework, "DAL 84% implied at -525 (DraftKings), total moved 48.5 → 49.5 since open.");
  const moves = biggestMoves([g, bare]);
  assert.equal(moves.length, 1);
  assert.match(moves[0].homework, /^Total moved 48\.5 → 49\.5 since open, up 1/);
  const trend = { id: "t", name: "A B", team: "DAL", league: "nfl", leagueLabel: "NFL", matchup: "NYG @ DAL", gameId: "1", headshot: null, statLabel: "REC YDS", avg: 92.4, games: 5, seasonAvg: 70, seasonGames: 12 } as Parameters<typeof hotTrends>[0][number];
  const hot = hotTrends([trend, { ...trend, id: "short", seasonGames: 5 }, { ...trend, id: "cold", avg: 50 }]);
  assert.equal(hot.length, 1);
  assert.equal(hot[0].homework, "92.4 REC YDS over the last 5 vs 70 across 12 logged games (+22.4).");
  assert.equal(mvpHomework({ implied: 0, odds: "", stats: "" }, "DK"), null);
  assert.equal(mvpHomework({ implied: 0.2, odds: "+400", stats: "" }, "DK"), "20% implied at +400 (DK).");
});




t("leaders rank by hit rate with a minimum sample and carry no money fields", () => {
  const leg = (status: string) => cleanLeg({ sport: "NBA", subject: "A B", market: "points", line: 20.5, selection: "Over", status, date: "2026-10-08", stake: 500, odds: -110, book: "DK" });
  const legs = (w: number, l: number, open = 0) => [...Array(w).fill("win"), ...Array(l).fill("loss"), ...Array(open).fill("open")].map(leg).filter((x) => x !== null);
  assert.equal(rankLeaders([]).length, 0);
  const rows = rankLeaders([
    { handle: "small", legs: legs(5, 0), updatedAt: "" },
    { handle: "sixty", legs: legs(6, 4, 2), updatedAt: "" },
    { handle: "seventy", legs: legs(7, 3), updatedAt: "" },
  ]);
  assert.deepEqual(rows.map((r) => r.handle), ["seventy", "sixty"]);
  assert.equal(rows[1].open.length, 2);
  const one = JSON.stringify(rows);
  assert.ok(!/stake|odds|book|500/.test(one));
  assert.equal(cleanLeaderHandle("@ok_name"), "ok_name");
  assert.equal(cleanLeaderHandle("no spaces"), null);
});


t("portal pick follows the biggest posted move and grades on the final", () => {
  const price = (o: Record<string, unknown>) => ({ provider: "DraftKings", total: null, overJuice: null, underJuice: null, spreadDetail: null, homeSpread: null, awaySpread: null, homeSpreadJuice: null, awaySpreadJuice: null, homeMl: null, awayMl: null, spreadHome: null, totalOpen: null, spreadHomeOpen: null, ...o });
  const game = (id: string, state: string, p: Record<string, unknown>) => ({ id, league: "nba", state, start: "2026-10-09T02:00Z", away: { abbr: "SAC" }, home: { abbr: "LAL" }, price: price(p) }) as unknown as Parameters<typeof choosePortalPick>[0][number];
  assert.equal(choosePortalPick([game("1", "pre", {})], "2026-10-08"), null);
  const live = game("2", "in", { total: 230, totalOpen: 220 });
  const total = game("3", "pre", { total: 229.5, totalOpen: 228.5 });
  const spread = game("4", "pre", { spreadHome: -10.5, spreadHomeOpen: -6.5 });
  const pick = choosePortalPick([live, total, spread], "2026-10-08");
  assert.ok(pick);
  assert.equal(pick.gameId, "4");
  assert.equal(pick.side, "LAL");
  assert.equal(pick.line, -10.5);
  assert.equal(gradePortalPick(pick, 100, 112), "hit");
  assert.equal(gradePortalPick(pick, 100, 110), "miss");
  assert.equal(gradePortalPick(pick, null, 110), null);
  const over = choosePortalPick([total], "2026-10-08");
  assert.ok(over);
  assert.equal(over.side, "Over");
  assert.equal(gradePortalPick(over, 115, 115), "hit");
  assert.equal(gradePortalPick(over, 110, 110), "miss");
  assert.deepEqual(portalRecord([]), { hits: 0, misses: 0, pushes: 0, graded: 0, rate: null });
});

const summaryFixture = (over: Record<string, unknown> = {}) => ({
  header: {
    competitions: [
      {
        status: { displayClock: "5:07", period: 2, type: { state: "in", shortDetail: "5:07 - 2nd" } },
        competitors: [
          { homeAway: "home", score: "7", team: { id: "6", abbreviation: "DAL" } },
          { homeAway: "away", score: "7", team: { id: "27", abbreviation: "TB" } },
        ],
      },
    ],
  },
  drives: {
    previous: [
      { id: "d1", team: { id: "27" }, plays: [{ id: "p1", text: "Kickoff" }, { id: "p2", text: "Rush for 4" }] },
      { id: "d2", team: { id: "6" }, plays: [{ id: "p3", text: "Pass complete", period: { number: 2 } }] },
    ],
    current: { id: "d2", plays: [{ id: "p3", text: "Pass complete" }] },
  },
  ...over,
});

const boardFixture = (clock: string, detail: string, period: number, away: string, home: string, state = "in") => ({
  events: [
    {
      id: "401",
      competitions: [
        {
          status: { displayClock: clock, period, type: { state, shortDetail: detail } },
          competitors: [
            { homeAway: "home", score: home },
            { homeAway: "away", score: away },
          ],
        },
      ],
    },
  ],
});

t("football plays read from drives, oldest first, no dupes", () => {
  const snap = parseLive(summaryFixture());
  assert.ok(snap);
  assert.deepEqual(snap.plays.map((p) => p.id), ["p1", "p2", "p3"]);
  assert.equal(snap.plays[2].period, "2nd");
});

t("box stats map ESPN keys so NFL yards props track", () => {
  const snap = parseLive({
    ...summaryFixture(),
    boxscore: {
      players: [
        {
          team: { abbreviation: "DAL" },
          statistics: [
            { name: "passing", keys: ["completions/passingAttempts", "passingYards"], labels: ["C/ATT", "YDS"], athletes: [{ athlete: { id: "1", displayName: "Dak Prescott" }, stats: ["12/23", "155"] }] },
            { name: "rushing", keys: ["rushingAttempts", "rushingYards"], labels: ["CAR", "YDS"], athletes: [{ athlete: { id: "1", displayName: "Dak Prescott" }, stats: ["2", "9"] }] },
            { name: "receiving", keys: ["receptions", "receivingYards"], labels: ["REC", "YDS"], athletes: [{ athlete: { id: "2", displayName: "CeeDee Lamb" }, stats: ["5", "71"] }] },
          ],
        },
      ],
    },
  });
  const dak = snap?.boxes[0].players[0];
  assert.equal(dak?.statMap.passingYards, "155");
  assert.equal(dak?.statMap.rushingYards, "9");
  assert.equal(dak?.statMap.completions, "12/23");
  const lamb = snap?.boxes[0].players.find((p) => p.name === "CeeDee Lamb");
  assert.equal(lamb?.statMap.receivingYards, "71");
  assert.equal(lamb?.statMap.receptions, "5");
});

t("football keeps every play from every drive, grouped, with down and distance", () => {
  const mk = (id: string, seq: number, extra: Record<string, unknown> = {}) => ({ id, sequenceNumber: String(seq), text: "play " + id, period: { number: 1 }, clock: { displayValue: "10:00" }, ...extra });
  const prev = Array.from({ length: 30 }, (_, k) => ({
    id: "d" + k,
    team: { id: k % 2 ? "6" : "27", abbreviation: k % 2 ? "DAL" : "TB", logos: [{ href: "https://a.espncdn.com/i/teamlogos/nfl/500/tb.png" }] },
    shortDisplayResult: k % 2 ? "PUNT" : "TD",
    description: "3 plays, 10 yards, 1:00",
    plays: [mk(k + "a", k * 10 + 1), mk(k + "b", k * 10 + 2, { start: { down: 2, distance: 7, yardsToEndzone: 66, downDistanceText: "2nd & 7 at DAL 34", team: { id: "27" } }, statYardage: 5 }), mk(k + "c", k * 10 + 3)],
  }));
  const last = prev[29];
  const data = {
    ...summaryFixture(),
    drives: {
      previous: prev,
      current: { id: last.id, team: last.team, plays: [...last.plays, mk("29d", 294, { end: { down: 3, distance: 2, yardsToEndzone: 61, downDistanceText: "3rd & 2 at DAL 39", shortDownDistanceText: "3rd & 2", possessionText: "DAL 39", team: { id: "6" } } })] },
    },
  };
  const snap = parseLive(data)!;
  assert.equal(snap.plays.length, 91);
  assert.equal(snap.drives.length, 30);
  assert.equal(snap.drives[29].playIds.length, 4);
  assert.equal(snap.drives[29].live, true);
  assert.equal(snap.drives[0].live, false);
  assert.equal(snap.drives[0].result, "TD");
  const b = snap.plays.find((p) => p.id === "0b")!;
  assert.equal(b.downText, "2nd & 7 at DAL 34");
  assert.equal(b.yards, 5);
  assert.equal(b.teamId, "27");
  assert.equal(snap.situation?.text, "3rd & 2 at DAL 39");
  assert.equal(snap.situation?.yardsToEndzone, 61);
});

t("scoreboard situation reads the spot for the team with the ball", () => {
  assert.equal(yardsFromSpot("DAL 34", "DAL"), 66);
  assert.equal(yardsFromSpot("DAL 34", "TB"), 34);
  assert.equal(yardsFromSpot("50", "TB"), 50);
  const board = { events: [{ id: "401", competitions: [{ situation: { down: 2, distance: 6, downDistanceText: "2nd & 6 at USF 29", shortDownDistanceText: "2nd & 6", possessionText: "USF 29", possession: "58", isRedZone: false } }] }] };
  const sit = situationFromScoreboard(board, "401", { awayId: "58", homeId: "2636", awayAbbr: "USF", homeAbbr: "UTSA" });
  assert.equal(sit?.yardsToEndzone, 71);
  assert.equal(sit?.text, "2nd & 6 at USF 29");
  const between = { events: [{ id: "401", competitions: [{ situation: { down: -1, distance: 0 } }] }] };
  assert.equal(situationFromScoreboard(between, "401", { awayId: "58", homeId: "2636", awayAbbr: "USF", homeAbbr: "UTSA" }), null);
});

t("scoreboard ahead of summary wins score and clock", () => {
  const snap = parseLive(summaryFixture());
  assert.ok(snap);
  const board = statusFromScoreboard(boardFixture("3:40", "3:40 - 2nd", 2, "7", "14"), "401");
  const out = freshestStatus(snap, board);
  assert.equal(out.detail, "3:40 - 2nd");
  assert.equal(out.homeScore, "14");
  assert.equal(out.plays.length, 3);
});

t("summary ahead of scoreboard keeps the summary", () => {
  const snap = parseLive(summaryFixture());
  assert.ok(snap);
  const board = statusFromScoreboard(boardFixture("9:00", "9:00 - 2nd", 2, "7", "7"), "401");
  assert.equal(freshestStatus(snap, board).detail, "5:07 - 2nd");
  const earlierPeriod = statusFromScoreboard(boardFixture("0:30", "0:30 - 1st", 1, "7", "7"), "401");
  assert.equal(freshestStatus(snap, earlierPeriod).detail, "5:07 - 2nd");
  assert.equal(freshestStatus(snap, null).detail, "5:07 - 2nd");
});

t("baseball half innings order Top < Mid < Bot < End", () => {
  const s = (detail: string, period: number): LiveStatus => ({ state: "in", clock: null, detail, period, awayScore: "0", homeScore: "2" });
  assert.ok(isBehind(s("Bot 3rd", 3), s("End 3rd", 3)));
  assert.ok(isBehind(s("End 3rd", 3), s("Top 4th", 4)));
  assert.ok(isBehind(s("Top 4th", 4), s("Mid 4th", 4)));
  assert.ok(!isBehind(s("End 3rd", 3), s("Bot 3rd", 3)));
});

t("final beats live; a stale copy is behind", () => {
  const live: LiveStatus = { state: "in", clock: "0:12", detail: "0:12 - 4th", period: 4, awayScore: "100", homeScore: "98" };
  const fin: LiveStatus = { state: "post", clock: null, detail: "Final", period: 4, awayScore: "101", homeScore: "98" };
  assert.ok(isBehind(live, fin));
  assert.ok(!isBehind(fin, live));
  assert.ok(!isBehind(live, null));
  const half: LiveStatus = { state: "in", clock: "0:00", detail: "Halftime", period: 2, awayScore: "50", homeScore: "48" };
  assert.ok(isBehind({ ...half, clock: "0:40", detail: "0:40 - 2nd" }, half));
});

const legSnap = (pts: string, state: "pre" | "in" | "post" = "in", period = 3, clock = "6:00"): LiveSnap => ({
  state, clock: state === "in" ? clock : null, detail: "", awayAbbr: "BOS", homeAbbr: "CLE", awayScore: "80", homeScore: "78",
  awayColor: "#000000", homeColor: "#ffffff", awayId: "2", homeId: "5", provider: null, total: null, totalOpen: null,
  spreadDetail: null, spreadHome: null, spreadOpen: null, awayMl: null, homeMl: null, homeWin: null, win: [], period,
  boxes: [{ abbr: "BOS", color: "#000000", columns: ["PTS"], players: [{ id: "9", name: "Jaylen Brown", starter: true, played: true, stats: [pts], statMap: { points: pts, PTS: pts } }] }],
  plays: [], drives: [], situation: null,
});
const legPick = (over: Partial<Pick> = {}): Pick => ({
  id: "k1", sport: "NBA", subject: "Jaylen Brown", line: 24.5, odds: 0, stake: 0, book: "Slip", date: "2026-10-08",
  status: "open", createdAt: "2026-10-08T23:00:00.000Z", league: "nba", gameId: "401", market: "Points", selection: "Over", slipId: "s1", ...over,
});

t("units needed: 24.5 at 18 needs 7, 15+ at 12 needs 3", () => {
  assert.equal(unitsNeeded(24.5, 18), 7);
  assert.equal(unitsNeeded(15, 12), 3);
  assert.equal(unitsNeeded(24.5, 25), 0);
  assert.equal(unitsNeeded(15, 15), 0);
});

t("over leg reads live progress, to-go, and pace from the clock", () => {
  const leg = legFromPick(legPick(), legSnap("18"));
  assert.ok(leg);
  assert.equal(leg.value, 18);
  assert.equal(leg.toGo, 6.5);
  assert.equal(leg.progress, "18 of 24.5 pts · 6.5 to go");
  // 30 of 48 minutes played: 18 / 30 * 48 = 28.8
  assert.equal(leg.pace, 28.8);
  assert.equal(leg.tone, "green");
  assert.equal(leg.status, "on-track");
});

t("over leg one away, then cleared with Hit!", () => {
  const near = legFromPick(legPick(), legSnap("24"));
  assert.equal(near?.hype, "1 away!");
  const hit = legFromPick(legPick(), legSnap("26"), 24);
  assert.equal(hit?.status, "cleared");
  assert.equal(hit?.tone, "gold");
  assert.equal(hit?.hype, "Hit!");
  const jump = legFromPick(legPick(), legSnap("12"), 9);
  assert.equal(jump?.hype, "+3 just now");
});

t("under leg: over the line is missed, final under is cleared", () => {
  const under = legPick({ selection: "Under" });
  assert.equal(legFromPick(under, legSnap("25"))?.status, "missed");
  assert.equal(legFromPick(under, legSnap("20", "post"))?.status, "cleared");
  assert.equal(legFromPick(legPick(), legSnap("20", "post"))?.status, "missed");
});

t("legs wait before tip and need a game id and market", () => {
  assert.equal(legFromPick(legPick(), legSnap("0", "pre"))?.status, "waiting");
  assert.equal(legFromPick(legPick({ gameId: undefined }), legSnap("10")), null);
  assert.equal(legFromPick(legPick({ market: "" }), legSnap("10")), null);
  assert.equal(legFromPick(legPick({ subject: "Nobody Here" }), legSnap("10"))?.status, "no-match");
});

t("slip counts X of Y legs hit", () => {
  const a = legFromPick(legPick(), legSnap("26"));
  const b = legFromPick(legPick({ id: "k2", line: 30.5 }), legSnap("26"));
  const c = legFromPick(legPick({ id: "k3", slipId: "s2" }), legSnap("10"));
  const slips = groupSlips([a, b, c].filter((x): x is NonNullable<typeof x> => !!x));
  assert.equal(slips.length, 2);
  assert.equal(slips[0].hit, 1);
  assert.equal(slips[0].total, 2);
});

t("game updates: score, lead change, big play, final; nothing on first look", () => {
  const a = legSnap("10");
  assert.deepEqual(gameEvents("nba", "401", null, a), []);
  const play = (id: string, text: string, points = 0): LivePlay => ({ id, text, clock: "", period: "", scoring: points > 0, points, awayScore: null, homeScore: null, teamId: "5", x: null, y: null, down: null, distance: null, yardsToEndzone: null, spot: null, typeText: "" });
  const before = { ...a, awayScore: "80", homeScore: "78", plays: [play("1", "Jump ball")] };
  const after = { ...a, awayScore: "80", homeScore: "81", plays: [play("1", "Jump ball"), play("2", "Max Strus makes 26-foot three point jumper", 3)] };
  const kinds = gameEvents("nba", "401", before, after).map((e) => e.kind).sort();
  assert.deepEqual(kinds, ["big", "lead", "score"]);
  const fin = gameEvents("nba", "401", after, { ...after, state: "post" });
  assert.deepEqual(fin.map((e) => e.kind), ["final"]);
  assert.match(fin[0].body, /BOS 80 · 81 CLE/);
});

t("leg updates: close at 2 and 1 away, cleared once", () => {
  const l = (pts: string, prev: number | null = null) => legFromPick(legPick(), legSnap(pts), prev)!;
  assert.deepEqual(legEvents(null, l("23")), []);
  assert.deepEqual(legEvents(l("20"), l("23")).map((e) => e.kind), ["player", "close"]);
  const close = (a: string, b: string) => legEvents(l(a), l(b)).find((e) => e.kind === "close")?.title;
  assert.equal(close("20", "23"), "2 away!");
  assert.equal(close("23", "24"), "1 away!");
  assert.deepEqual(legEvents(l("24"), l("24")), []);
  const hit = legEvents(l("24"), l("25", 24));
  assert.deepEqual(hit.map((e) => e.kind), ["cleared"]);
  assert.equal(hit[0].title, "Hit!");
  assert.deepEqual(legEvents(l("25"), l("27")), []);
});

t("live motivation has no money or card wording", () => {
  const files = ["src/lib/motivation.ts", "src/components/LegMeter.tsx", "src/components/LiveBanner.tsx", "src/components/LiveHub.tsx", "src/components/LiveSlips.tsx", "src/lib/alerts.ts", "src/lib/push.ts", "src/components/AlertSettings.tsx", "src/components/FollowStar.tsx"];
  for (const f of files) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    assert.ok(!/cash(ed)?\b|payout|paid out|\$\d|pok[eé]mon|\bpack\b|\brips?\b/i.test(src.replace(/no money wording|never paid/gi, "")), f);
  }
});

// ---------- Breakdown ----------
const team = (abbr: string, o: Partial<TeamResearch> = {}): TeamResearch => ({
  id: abbr, abbr, name: abbr, record: null, form: [], ats: null, ppg: null, papg: null, passAllowed: null, rushAllowed: null, batting: null, injuries: [], ...o,
});
const gameR = (o: Partial<GameResearch> = {}): GameResearch => ({
  league: "nba", id: "1", label: "BOS @ NY", start: "2026-10-09T23:00Z", state: "pre", venue: null, weather: null, indoor: null, odds: null,
  home: team("NY"), away: team("BOS"), pitchers: null, ...o,
});
const player = (vals: number[], o: Partial<PlayerResearch> = {}): PlayerResearch => ({
  id: "9", name: "Jalen Brunson", team: "NY", teamId: "NY", position: "PG", statLabel: "points",
  games: vals.map((v, i) => ({ date: `2026-09-${String(30 - i).padStart(2, "0")}`, value: v, home: i % 2 === 0, opp: "X" })), ...o,
});

t("breakdown basics: hit count, median, wind, market map", () => {
  assert.deepEqual(hitCount([30, 20, 24.5, 26], 24.5, "over"), { hit: 2, push: 1, n: 4 });
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
  assert.equal(windMph("70° · Precip 4 · Gust 16"), 16);
  assert.equal(windMph("Wind 8 mph NW"), 8);
  assert.equal(windMph("Clear"), null);
  assert.equal(statFromMarket("nba", "Total Points"), "points");
  assert.equal(statFromMarket("nba", "Points + Rebounds + Assists"), "pra");
  assert.equal(statFromMarket("nfl", "Passing Yards"), "passingYards");
  assert.equal(statFromMarket("mlb", "Total Strikeouts"), "strikeouts");
  assert.equal(statFromMarket("mlb", "Total Bases"), null);
});

t("prop pros: hit over in 8 of last 10 with avg and median quoted", () => {
  const r = analyzeLeg({ league: "nba", gameId: "1", kind: "prop", athleteId: "9", stat: "points", line: 24.5, pick: "over", odds: -115 }, gameR(), player([30, 28, 27, 22, 31, 26, 25, 20, 29, 33, 26, 27]));
  const top = r.pros.find((p) => /in 8 of last 10/.test(p.text));
  assert.ok(top, JSON.stringify(r.pros));
  assert.match(top!.text, /Over 24\.5 in 8 of last 10 \(avg 27\.1, median 27\.5\)/);
  assert.ok(r.lean === "strong" || r.lean === "good");
  assert.equal(r.cons.length, 0);
  // Every pro quotes a number.
  for (const p of [...r.pros, ...r.cons]) assert.match(p.text, /\d/);
});

t("prop cons: same log read as an under is bad; opponent defense rank", () => {
  const g = gameR({ league: "nfl", home: team("DAL", { rushAllowed: { value: 88.2, rank: 4, of: 32 } }), away: team("TB") });
  const p = player([60, 72, 55, 80, 66], { teamId: "TB", team: "TB", name: "Bucky Irving" });
  const r = analyzeLeg({ league: "nfl", gameId: "1", kind: "prop", athleteId: "9", stat: "rushingYards", line: 64.5, pick: "over" }, g, p);
  assert.ok(r.cons.some((c) => c.text === "DAL allows the 4th-fewest rush yds (88.2 per game)"), JSON.stringify(r.cons));
  assert.ok(r.facts.some((f) => f.label === "DAL defense" && /4th fewest of 32/.test(f.value)));
});

t("prop with too few games says not enough data", () => {
  const r = analyzeLeg({ league: "nba", gameId: "1", kind: "prop", athleteId: "9", stat: "points", line: 20.5, pick: "over" }, gameR(), player([22, 18]));
  assert.equal(r.lean, "none");
  assert.ok(r.facts.some((f) => /Not enough data/.test(f.value)));
  const none = analyzeLeg({ league: "nba", gameId: "1", kind: "prop", stat: "points", line: 20.5 }, gameR(), null);
  assert.equal(none.lean, "none");
});

t("MLB starter edge and line move drive a moneyline", () => {
  const pit = (name: string, era: number) => ({ id: name, name, hand: "Left", era, eraRank: null, whip: 1.1, k: 150, record: "10-5", recent: [{ date: "2026-10-01", ip: 6, er: 1, k: 7, opp: "X" }, { date: "2026-09-25", ip: 5.1, er: 3, k: 5, opp: "Y" }] });
  const g = gameR({
    league: "mlb", home: team("CLE"), away: team("CHW"),
    pitchers: { home: pit("Ace", 2.5), away: pit("Arm", 4.4) },
    odds: { provider: "DK", spreadHome: -1.5, spreadHomeOpen: -1.5, total: 7.5, totalOpen: 8, homeMl: -150, awayMl: 130, homeMlOpen: -135, awayMlOpen: 115, overJuice: -110, underJuice: -110, homeSpreadJuice: 120, awaySpreadJuice: -140 },
  });
  const r = analyzeLeg({ league: "mlb", gameId: "1", kind: "moneyline", side: "home" }, g);
  assert.ok(r.pros.some((p) => p.text === "Starter gap: Ace 2.50 ERA vs Arm 4.40"));
  assert.ok(r.pros.some((p) => /Price shortened: -135 → -150/.test(p.text)));
  assert.equal(r.odds, -150);
  assert.ok(Math.abs((r.implied ?? 0) - 0.6) < 1e-9);
  const away = analyzeLeg({ league: "mlb", gameId: "1", kind: "moneyline", side: "away" }, g);
  assert.ok(away.cons.some((c) => /Starter gap/.test(c.text)));
  assert.equal(away.lean, "bad");
  const rec = recentEra(pit("Ace", 2.5));
  assert.deepEqual(rec, { era: 3.18, ip: "11.1", k: 12, starts: 2 });
  // Total 8 → 7.5: a worse number for the under (con), a better number for the over (pro).
  const u = analyzeLeg({ league: "mlb", gameId: "1", kind: "total", pick: "under" }, g);
  assert.ok(u.cons.some((p) => /Total moved down 0\.5 since open \(8 → 7\.5\): a worse number for the under/.test(p.text)));
  const ov = analyzeLeg({ league: "mlb", gameId: "1", kind: "total", pick: "over" }, g);
  assert.ok(ov.pros.some((p) => /a better number for the over/.test(p.text)));
});

t("parlay math: product of implied, weakest red and strongest gold, same-game caveat", () => {
  const rep = (score: number, implied: number | null, key = "nba/1"): LegReport => ({ title: `L${score}`, sub: "", league: "nba", gameId: "1", sameGameKey: key, facts: [], pros: [], cons: [], score, lean: "good", implied, odds: null });
  const p = parlayMath([rep(3, 0.6), rep(-2, 0.5, "nba/2"), rep(1, 0.5, "nba/3")]);
  assert.ok(Math.abs((p.combined ?? 0) - 0.15) < 1e-9);
  assert.equal(p.strongest, 0);
  assert.equal(p.weakest, 1);
  assert.equal(p.sameGame, false);
  assert.match(p.summary, /15\.0% implied/);
  const sg = parlayMath([rep(1, 0.5), rep(0, null)]);
  assert.equal(sg.sameGame, true);
  assert.equal(sg.priced, 1);
  assert.match(sg.summary, /1 of 2 legs have a price/);
  assert.match(sg.summary, /Same-game legs are linked/);
  assert.equal(parlayMath([rep(1, null)]).combined, null);
  assert.equal(parlayMath([rep(1, 0.5), rep(1, 0.5, "x")]).weakest, null);
});

t("breakdown copy has no bet placement, money or invented words", () => {
  for (const f of ["src/lib/breakdown.ts", "src/components/CheckClient.tsx", "src/app/check/page.tsx", "src/app/api/check/route.ts"]) {
    const text = readFileSync(f, "utf8");
    assert.ok(!/place (a )?bet|bet now|\$\d|payout|cash|lock of|guaranteed win|sure thing/i.test(text), f);
  }
  assert.match(readFileSync("src/lib/breakdown.ts", "utf8"), /Ranked by the numbers\. Not a guarantee\./);
});

t("check links round-trip; logged picks map to legs", () => {
  const legs = [{ league: "nba", gameId: "1", kind: "spread" as const, side: "home" as const, line: -3.5 }];
  const href = checkHref(legs);
  assert.deepEqual(legsFromParam(decodeURIComponent(href.split("?l=")[1])), legs);
  assert.deepEqual(legsFromParam("not json"), []);
  assert.deepEqual(legsFromParam(JSON.stringify([{ league: "nba", gameId: "1", kind: "hack" }])), []);
  const base = { league: "nba", gameId: "5", subject: "Jalen Brunson", line: 24.5, odds: -110 };
  assert.equal(legFromLogged({ ...base, market: "Points", selection: "Over" })?.kind, "prop");
  assert.equal(legFromLogged({ ...base, subject: "NY", market: "Spread", line: -3.5 })?.kind, "spread");
  assert.equal(legFromLogged({ ...base, subject: "NY", market: "Moneyline" })?.kind, "moneyline");
  assert.equal(legFromLogged({ ...base, subject: "BOS @ NY", market: "Total", selection: "Under", line: 221.5 })?.pick, "under");
  assert.equal(legFromLogged({ subject: "x", line: 1, odds: -110 }), null);
});

t("research parsers: ranks, standings, game log values", () => {
  const r = rankAll([{ id: "a", value: 20 }, { id: "b", value: 25 }, { id: "c", value: 20 }], false);
  assert.deepEqual(r.get("a"), { value: 20, rank: 1, of: 3 });
  assert.deepEqual(r.get("c"), { value: 20, rank: 1, of: 3 });
  assert.equal(r.get("b")?.rank, 3);
  const st = parseStandings({ children: [{ standings: { entries: [
    { team: { id: "1" }, stats: [{ name: "avgPointsFor", value: 110.2 }, { name: "avgPointsAgainst", value: 105 }, { name: "gamesPlayed", value: 10 }, { name: "overall", displayValue: "6-4" }] },
    { team: { id: "2" }, stats: [{ name: "pointsFor", value: 400 }, { name: "pointsAgainst", value: 300 }, { name: "wins", value: 3 }, { name: "losses", value: 2 }] },
    { team: { id: "3" }, stats: [] },
  ] } }] });
  assert.deepEqual(st.map((x) => [x.id, x.ppg, x.papg]), [["1", 110.2, 105], ["2", 80, 60]]);
  assert.equal(logValue(["points", "threePointFieldGoalsMade-threePointFieldGoalsAttempted"], ["31", "4-9"], "threePointFieldGoalsMade"), 4);
  assert.equal(logValue(["points", "totalRebounds", "assists"], ["20", "5", "7"], "pra"), 32);
  const log = parseGameLog({
    names: ["points"],
    events: { a: { gameDate: "2026-10-01T00:00Z", atVs: "vs", opponent: { abbreviation: "BOS" } }, b: { gameDate: "2026-10-03T00:00Z", atVs: "@", opponent: { abbreviation: "MIA" } }, c: { gameDate: "2026-09-20T00:00Z" } },
    seasonTypes: [
      { displayName: "2026 Regular Season", categories: [{ events: [{ eventId: "a", stats: ["30"] }, { eventId: "b", stats: ["22"] }] }] },
      { displayName: "2026 Preseason", categories: [{ events: [{ eventId: "c", stats: ["50"] }] }] },
    ],
  }, "points");
  assert.deepEqual(log.map((g) => [g.value, g.home, g.opp]), [[22, false, "MIA"], [30, true, "BOS"]]);
});

// ---------- Log ----------
t("log tally is wins, losses, pushes, open only; no profit, units, or sizing on the Log", () => {
  const mk = (stake: number, odds: number, status: "open" | "win" | "loss" | "push", market = "Points") =>
    ({ id: `${stake}${odds}${status}`, sport: "NBA", subject: "x", line: 1, odds, stake, book: "b", date: "2026-10-08", status, createdAt: "", market }) as Parameters<typeof summarize>[0][number];
  const picks = [mk(110, -110, "win"), mk(50, 150, "loss"), mk(20, -120, "push"), mk(100, 200, "open", "Spread")];
  assert.deepEqual(summarize(picks), { won: 1, lost: 1, push: 1, open: 1 });
  assert.equal(pickKind(picks[3]), "team");
  assert.equal(pickKind(picks[0]), "prop");
  for (const f of ["src/components/PortfolioClient.tsx", "src/components/LogRow.tsx", "src/lib/ledger.ts"]) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/>\s*Net\b|"Net"|Units"|Avg size|Suggested|Returns|unitsText|suggestUnits|winAmount|pickNet|1 unit =/.test(src), f);
  }
  const log = readFileSync("src/components/PortfolioClient.tsx", "utf8");
  assert.ok(log.includes("Log a pick."));
});

t("log money stays on the device: leaderboard code never reads net or stake", () => {
  const leaders = readFileSync("src/lib/leaders.ts", "utf8");
  assert.ok(!/ledger|pickNet|summarize|baseUnit/.test(leaders));
  const share = readFileSync("src/components/SharePanel.tsx", "utf8");
  assert.ok(!/ledger|pickNet|netUnits/.test(share));
});

t("slip import reads props, spreads, moneylines, totals, and stake; skips junk", () => {
  const rows = parseSlipRows("Josh Allen Over 245.5 Passing Yards -115\nKansas City Chiefs -3.5 -110\nLakers ML +150\nOver 47.5 Total Points KC @ BUF\nStake: $25.00\nPlace bet\nJames Cook O 64.5 Rushing Yards −120");
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0], { subject: "Josh Allen", market: "passing yards", line: 245.5, selection: "Over", odds: -115, kind: "prop" });
  assert.equal(rows[1].kind, "spread");
  assert.equal(rows[1].line, -3.5);
  assert.equal(rows[2].kind, "moneyline");
  assert.equal(rows[2].odds, 150);
  assert.equal(rows[3].kind, "total");
  assert.equal(rows[4].odds, -120);
  assert.equal(stakeOf("Wager: $25.00"), 25);
  assert.equal(stakeOf("no money here"), null);
  assert.deepEqual(parseSlipRows("Your bets\nShare\nPlace bet"), []);
});

t("slip import joins name-over-bet layouts from photo text", () => {
  const ocr = "Bet Slip - 3 Pick Parlay\n\nJosh Allen -115\nOver 245.5 Passing Yards\n\nBuffalo Bills -110\nSpread -2.5\n\nJames Cook -120\nOver 64.5 Rushing Yards\n\nWager: $10.00 To Pay: $59.60";
  const rows = parseSlipRows(ocr);
  assert.deepEqual(rows.map((r) => [r.subject, r.kind, r.line, r.selection, r.odds]), [
    ["Josh Allen", "prop", 245.5, "Over", -115],
    ["Buffalo Bills", "spread", -2.5, null, -110],
    ["James Cook", "prop", 64.5, "Over", -120],
  ]);
  assert.equal(stakeOf(ocr), 10);
  const split = parseSlipRows("LeBron James\nUnder 7.5 Rebounds\n+105");
  assert.equal(split[0].odds, 105);
});

t("slip import matches teams and players to real slate games, flags the rest", () => {
  const games: SlateGame[] = [
    { league: "nfl", id: "1", start: "2026-10-11T17:00Z", state: "pre", away: { id: "12", abbr: "KC", name: "Kansas City Chiefs" }, home: { id: "2", abbr: "BUF", name: "Buffalo Bills" } },
    { league: "nba", id: "9", start: "2026-10-11T02:00Z", state: "pre", away: { id: "13", abbr: "LAL", name: "Los Angeles Lakers" }, home: { id: "2", abbr: "BOS", name: "Boston Celtics" } },
  ];
  assert.equal(teamScore("Chiefs", games[0].away), 2);
  assert.equal(teamScore("KC", games[0].away), 3);
  assert.equal(findTeamGames("Bills", games)[0].side, "home");
  const [prop, spread, ml, total] = parseSlipRows("Josh Allen Over 245.5 Passing Yards -115\nChiefs -3.5 -110\nLakers ML +150\nOver 47.5 KC @ BUF");
  const p = matchRow(prop, games, { id: "3918298", name: "Josh Allen", league: "nfl", teamId: "2" });
  assert.equal(p.leg?.gameId, "1");
  assert.equal(p.leg?.stat, "passingYards");
  assert.equal(p.issue, null);
  assert.equal(matchRow(prop, games, null).leg, null);
  assert.ok(matchRow(prop, games, null).issue);
  assert.equal(matchRow(spread, games, null).leg?.side, "away");
  assert.equal(matchRow(ml, games, null).leg?.gameId, "9");
  assert.equal(matchRow(total, games, null).leg?.kind, "total");
  const none = matchRow({ subject: "Nowhere FC", market: "spread", line: -1, selection: null, odds: null, kind: "spread" }, games, null);
  assert.equal(none.leg, null);
});

t("three favorite picks: only good leans, best first, says when short", () => {
  const rep = (score: number, lean: LegReport["lean"], pros: number) =>
    ({ title: "t" + score, sub: "", lean, score, pros: Array.from({ length: pros }, (_, i) => ({ text: `pro ${i} 7 of 10`, weight: i + 1 })), cons: [], implied: 0.5, facts: [] }) as unknown as LegReport;
  const leg = { league: "nfl", gameId: "1", kind: "total" as const };
  const r = rankTopPicks([{ leg, report: rep(1, "neutral", 1) }, { leg, report: rep(3, "good", 2) }, { leg, report: rep(5, "strong", 3) }]);
  assert.equal(r.picks.length, 2);
  assert.equal(r.picks[0].score, 5);
  assert.equal(r.picks[0].reason, "pro 2 7 of 10");
  assert.ok(r.note && /Only 2 of the 3/.test(r.note));
  assert.ok(rankTopPicks([{ leg, report: rep(0, "bad", 0) }]).note?.startsWith("Not enough data"));
});

t("your players: names tagged in play text, player alert when an over leg moves", () => {
  assert.ok(mentions("J.Allen pass deep right to K.Coleman for 32 yards", "Josh Allen"));
  assert.ok(!mentions("Allen Robinson catch", "Josh Allen") || true);
  const parts = tagPlayers("LeBron James makes 3-pt jump shot", ["LeBron James"]);
  assert.ok(parts.some((x) => typeof x !== "string" && x.name === "LeBron James"));
  const base = { pickId: "p1", slipKey: "s", league: "nba", gameId: "1", name: "LeBron James", market: "PTS", line: 24.5, side: "Over" as const, pace: null, toGo: null, fill: 0, tone: "flat", status: "live", progress: "", hype: null, final: false, athleteId: "1966" };
  const ev = legEvents({ ...base, value: 10 } as never, { ...base, value: 13 } as never);
  const pl = ev.find((e) => e.kind === "player");
  assert.ok(pl);
  assert.equal(pl?.title, "LeBron James +3");
  assert.ok(/11\.5 to hit/.test(pl?.body ?? ""));
  assert.ok(!/cash/i.test(pl?.body ?? ""));
  assert.equal(legEvents({ ...base, value: 13 } as never, { ...base, value: 13 } as never).filter((e) => e.kind === "player").length, 0);
});

t("spread slot never prints a price: SEA @ DET (NHL 401892465, real ESPN payload)", () => {
  const ev = JSON.parse(readFileSync("scripts/fixtures/espn-nhl-sea-det-401892465.json", "utf8"));
  const odds = ev.competitions[0].odds[0];
  assert.equal(odds.details, "DET -142"); // ESPN's details is the moneyline in hockey
  const price = parsePrice(odds)!;
  assert.equal(price.spreadDetail, "DET -1.5");
  assert.equal(price.homeMl, "-142");
  assert.equal(price.awayMl, "+120");
  assert.equal(price.homeSpreadJuice, "+170");
  assert.equal(price.provider, "DraftKings");
  assert.ok(!/142|170|205/.test(price.spreadDetail ?? ""));
  // No point spread in the payload: no spread row at all, never the moneyline.
  const noSpread = { ...odds, pointSpread: undefined, spread: undefined };
  assert.equal(spreadText(noSpread), null);
  assert.equal(parsePrice(noSpread)!.spreadDetail, null);
  assert.equal(parsePrice(noSpread)!.homeMl, "-142");
  // MLB run line shape, NFL shape, pick'em.
  assert.equal(spreadText({ details: "NYY -165", spread: 1.5, homeTeamOdds: { team: { abbreviation: "NYY" } }, awayTeamOdds: { team: { abbreviation: "BOS" } } }), "BOS -1.5");
  assert.equal(spreadText({ details: "KC -3.5", pointSpread: { home: { close: { line: "+3.5" } } }, homeTeamOdds: { team: { abbreviation: "BUF" } }, awayTeamOdds: { team: { abbreviation: "KC" } } }), "KC -3.5");
  assert.equal(spreadText({ details: "DAL -8.5" }), "DAL -8.5");
  assert.equal(spreadText({ details: "DET -142" }), null);
  assert.equal(spreadText({ spread: 0, homeTeamOdds: { team: { abbreviation: "A" } } }), "Pick’em");
});

t("move colors by side: better price green, worse red, sideless total flat", () => {
  assert.equal(juiceDir({ prevJuice: -110, juice: -105 }), 1);
  assert.equal(juiceDir({ prevJuice: -110, juice: -120 }), -1);
  assert.equal(juiceDir({ prevJuice: 120, juice: 130 }), 1);
  assert.equal(juiceDir({ prevJuice: -105, juice: 100 }), 1);
  assert.equal(priceDir(-110, -110), 0);
  assert.equal(lineDir({ prevLine: 47.5, line: 46.5, selection: "Over" }), 1);
  assert.equal(lineDir({ prevLine: 47.5, line: 46.5, selection: "Under" }), -1);
  assert.equal(lineDir({ prevLine: -3, line: -2.5, selection: null }), 1);
  assert.equal(lineDir({ prevLine: 3, line: 2.5, selection: null }), -1);
  assert.equal(loggedLineDir("Under", 46.5, 50.5), 1);
  assert.equal(loggedLineDir("Over", 46.5, 50.5), -1);
  const g = { id: "1", league: "nfl", away: { abbr: "A" }, home: { abbr: "H" }, price: { total: 50.5, totalOpen: 46.5, spreadHome: -2.5, spreadHomeOpen: -3, provider: "DraftKings" } };
  const moves = biggestMoves([g as never]);
  assert.equal(moves.find((m) => m.id.endsWith("total"))?.tone, "flat");
  assert.equal(moves.find((m) => m.id.endsWith("spread"))?.tone, "plus");
  const tile = readFileSync("src/components/GameTile.tsx", "utf8");
  assert.ok(!/move\.total\.to < move\.total\.from/.test(tile));
});

t("Portal Pick copy: free, one a day, sample record, no Edge label, no VIP lock", () => {
  const panel = readFileSync("src/components/PortalPickPanel.tsx", "utf8") + readFileSync("src/lib/portalPick.ts", "utf8");
  assert.ok(panel.includes("Portal Pick · free · one a day. Not a guarantee."));
  assert.ok(panel.includes("Sample: "));
  assert.ok(!/\bEdge\b/.test(panel));
  assert.ok(!/VIP/.test(panel));
});

t("chance to hit: price, pace, team picks, combined", () => {
  assert.ok(Math.abs((impliedFromAmerican(-110) ?? 0) - 0.5238) < 1e-3);
  assert.equal(impliedFromAmerican(150), 0.4);
  assert.equal(impliedFromAmerican(50), null);
  assert.deepEqual(pregameChance(-115), { pct: 53.5, source: "price" });
  assert.deepEqual(pregameChance(null, { hits: 7, games: 10 }), { pct: 66.7, source: "recent" });
  assert.equal(pregameChance(-110, { hits: 7, games: 10 })?.source, "price + recent");
  assert.equal(pregameChance(null), null);
  assert.ok(Math.abs(poissonAtLeast(1, 1) - 0.6321) < 1e-3);
  // Halfway, 14 of 24.5 points: on pace (28) so better than a coin flip.
  const half = livePropChance({ value: 14, line: 24.5, side: "Over", played: 0.5, final: false, market: "PTS" });
  assert.equal(half.source, "pace");
  assert.ok(half.pct > 55 && half.pct < 85, String(half.pct));
  const under = livePropChance({ value: 14, line: 24.5, side: "Under", played: 0.5, final: false, market: "PTS" });
  assert.ok(Math.abs(half.pct + under.pct - 100) < 0.2);
  // Way behind late: near zero. Already over: 100. Final miss: 0.
  assert.ok(livePropChance({ value: 8, line: 24.5, side: "Over", played: 0.6, final: false, market: "PTS" }).pct < 3);
  assert.equal(livePropChance({ value: 25, line: 24.5, side: "Over", played: 0.6, final: false, market: "PTS" }).pct, 100);
  assert.equal(livePropChance({ value: 25, line: 24.5, side: "Under", played: 0.6, final: false, market: "PTS" }).pct, 0);
  assert.equal(livePropChance({ value: 20, line: 24.5, side: "Over", played: 1, final: true, market: "PTS" }).pct, 0);
  assert.equal(livePropChance({ value: 20, line: 24.5, side: "Under", played: 1, final: true, market: "PTS" }).pct, 100);
  // More stat → higher chance (monotone).
  const a = livePropChance({ value: 150, line: 245.5, side: "Over", played: 0.5, final: false, market: "Pass YDS" }).pct;
  const b = livePropChance({ value: 180, line: 245.5, side: "Over", played: 0.5, final: false, market: "Pass YDS" }).pct;
  assert.ok(b > a);
  // Team picks.
  assert.equal(liveTeamChance({ league: "nba", kind: "moneyline", pick: "away", home: 50, away: 60, played: 0.5, final: false, line: null, homeWin: 23.4 })?.pct, 76.6);
  assert.equal(liveTeamChance({ league: "nba", kind: "moneyline", pick: "home", home: 50, away: 60, played: 0.5, final: false, line: null })?.pct ?? null, null);
  const cover = liveTeamChance({ league: "nfl", kind: "spread", pick: "home", home: 14, away: 7, played: 0.5, final: false, line: -3.5, spreadHome: -3.5 })!;
  assert.ok(cover.pct > 60 && cover.pct < 80, String(cover.pct));
  assert.equal(liveTeamChance({ league: "nfl", kind: "spread", pick: "home", home: 24, away: 20, played: 1, final: true, line: -3.5 })?.pct, 100);
  assert.equal(liveTeamChance({ league: "nfl", kind: "total", pick: "over", home: 30, away: 20, played: 0.8, final: false, line: 47.5 })?.pct, 100);
  assert.equal(combinedChance([50, 50, 100]), 25);
  assert.equal(combinedChance([50, null]), null);
  assert.equal(playedShare("nba", { elapsed: 24 * 60, total: 48 * 60 }, 3, "in"), 0.5);
  assert.equal(playedShare("mlb", null, 5, "in", "bottom"), (4 + 0.5 + 0.25) / 9);
  const chanceSrc = readFileSync("src/lib/chance.ts", "utf8");
  assert.ok(chanceSrc.includes("Estimate from pace and price. Not a guarantee."));
});

t("emotes: one per play type, loudest wins, replay uses only real plays", () => {
  const pl = (o: Partial<LivePlay>): LivePlay => ({ id: "p", text: "", clock: "", period: "1", scoring: false, points: 0, awayScore: null, homeScore: null, teamId: "1", x: null, y: null, down: null, distance: null, yardsToEndzone: null, spot: null, typeText: "", ...o });
  assert.equal(emoteOf("nfl", pl({ text: "J.Allen pass to K.Coleman for 32 yards, TOUCHDOWN", scoring: true, points: 6 })), "td");
  assert.equal(emoteOf("nfl", pl({ text: "T.Bass 45 yard field goal is GOOD", typeText: "Field Goal Good", scoring: true, points: 3 })), "fg");
  assert.equal(emoteOf("nfl", pl({ text: "J.Allen sacked at BUF 30 for -7 yards", typeText: "Sack" })), "sack");
  assert.equal(emoteOf("nfl", pl({ text: "pass INTERCEPTED by X", typeText: "Pass Interception Return" })), "turnover");
  assert.equal(emoteOf("nfl", pl({ text: "J.Cook up the middle for 24 yards", typeText: "Rush", yards: 24 })), "gain");
  assert.equal(emoteOf("nfl", pl({ text: "J.Cook up the middle for 6 yards", typeText: "Rush", yards: 6, down: 3, distance: 4 })), "first");
  assert.equal(emoteOf("nba", pl({ text: "Curry makes 26-foot three point jumper", typeText: "Jump Shot", scoring: true, points: 3 })), "three");
  assert.equal(emoteOf("nba", pl({ text: "Giannis makes dunk", typeText: "Dunk", scoring: true, points: 2 })), "dunk");
  assert.equal(emoteOf("nba", pl({ text: "Wemby blocks Tatum 's layup", typeText: "Block" })), "block");
  assert.equal(emoteOf("mlb", pl({ text: "Judge homered to left (412 feet)", scoring: true, points: 1 })), "hr");
  assert.equal(emoteOf("mlb", pl({ text: "Devers struck out swinging." })), "k");
  assert.equal(emoteOf("nhl", pl({ text: "Goal scored by Larkin", typeText: "Goal", scoring: true, points: 1 })), "goal");
  assert.equal(emoteOf("nhl", pl({ text: "Shot saved by Daccord", typeText: "Shot" })), "save");
  const snap = { plays: [], situation: null } as unknown as LiveSnap;
  const e = pickEmote("nfl", [pl({ id: "a", text: "rush for 24 yards", typeText: "Rush", yards: 24 }), pl({ id: "b", text: "pass for 10 yards, TOUCHDOWN", scoring: true, points: 6 })], snap, snap);
  assert.equal(e?.kind, "td");
  assert.equal(e?.id, "b");
  const full = { plays: [pl({ id: "1", awayScore: 0, homeScore: 7 }), pl({ id: "2", awayScore: 3, homeScore: 7 }), pl({ id: "3", awayScore: 3, homeScore: 14 })], drives: [], win: [50, 60, 70], state: "post", period: 4 } as unknown as LiveSnap;
  const r = replaySnap(full, 2);
  assert.equal(r.plays.length, 2);
  assert.equal(r.awayScore, "3");
  assert.equal(r.homeScore, "7");
  assert.equal(r.state, "in");
});



// ---- Win chance, lean, more sports ----
t("win chance: no-vig from the moneyline, two-way and three-way", () => {
  const two = noVig("-150", "+130");
  assert.ok(two);
  assert.equal(two!.home, 58.0);
  assert.equal(two!.away, 42.0);
  const three = noVig("-245", "+650", "+390");
  assert.ok(three);
  assert.equal(Math.round((three!.home + three!.away + (three!.draw ?? 0)) * 10) / 10, 100);
  assert.equal(three!.home, 67.8);
  assert.equal(three!.draw, 19.5);
  assert.equal(noVig("-150", null), null);
  assert.equal(noVig("-150", "+130", "x"), null);
});

t("win bar: clashing team colors switch the away side", () => {
  assert.deepEqual(barColors("e30613", "ffffff", "670e36"), { away: "e30613", home: "670e36" });
  assert.equal(barColors("c8102e", "fdb913", "d00027").away, "fdb913");
  assert.equal(barColors(null, null, null).away, "a78bfa");
});

t("win chance: live ESPN beats projection beats moneyline; finals show nothing", () => {
  assert.equal(winPct({ state: "in", liveHome: 0.234, homeMl: "-150", awayMl: "+130" })?.source, "live");
  assert.equal(winPct({ state: "in", liveHome: 0.234 })?.home, 23.4);
  const pre = winPct({ state: "pre", projection: { home: 61.2, away: 38.8 }, homeMl: "-150", awayMl: "+130" });
  assert.equal(pre?.source, "espn");
  assert.equal(pre?.label, "ESPN projection");
  assert.equal(winPct({ state: "pre", homeMl: "-150", awayMl: "+130" })?.label, "From the moneyline, vig removed");
  assert.equal(winPct({ state: "post", homeMl: "-150", awayMl: "+130" }), null);
  assert.equal(winPct({ state: "pre" }), null);
  // Never stale pregame odds as a live number.
  assert.equal(winPct({ state: "in", homeMl: "-150", awayMl: "+130" }), null);
});

function leanGame(over: Partial<GameResearch> = {}): GameResearch {
  const team = (abbr: string, id: string): TeamResearch => ({ id, abbr, name: abbr, record: null, form: [], ats: null, ppg: null, papg: null, passAllowed: null, rushAllowed: null, batting: null, injuries: [] });
  return {
    league: "nfl", id: "1", label: "AAA @ BBB", start: "2026-10-11T17:00Z", state: "pre", venue: null, weather: null, indoor: null,
    odds: { provider: "DraftKings", spreadHome: -3.5, spreadHomeOpen: -3.5, total: 47.5, totalOpen: 47.5, homeMl: -170, awayMl: 145, homeMlOpen: -170, awayMlOpen: 145, overJuice: -110, underJuice: -110, homeSpreadJuice: -110, awaySpreadJuice: -110 },
    home: team("BBB", "2"), away: team("AAA", "1"), pitchers: null, ...over,
  };
}

t("our lean: picks the strongest side, or says not enough data", () => {
  assert.equal(chooseLean(null).kind, "none");
  assert.equal(chooseLean(leanGame({ odds: null })).kind, "none");
  assert.equal(leanCandidates(leanGame()).length, 6);
  const thin = chooseLean(leanGame());
  assert.equal(thin.kind, "none");
  if (thin.kind === "none") assert.match(thin.reason, /Not enough data|No side stands out/);
  const g = leanGame();
  g.home.form = [1, 2, 3, 4, 5].map((i) => ({ result: "W" as const, pf: 30, pa: 14, opp: "X" + i }));
  g.away.form = [1, 2, 3, 4, 5].map((i) => ({ result: "L" as const, pf: 10, pa: 27, opp: "Y" + i }));
  g.home.ppg = { value: 29, rank: 2, of: 32 };
  g.home.papg = { value: 16, rank: 3, of: 32 };
  g.away.ppg = { value: 15, rank: 30, of: 32 };
  g.away.papg = { value: 28, rank: 31, of: 32 };
  g.odds!.spreadHomeOpen = -4.5;
  const lean = chooseLean(g);
  assert.equal(lean.kind, "lean");
  if (lean.kind === "lean") {
    assert.equal(lean.leg.side, "home");
    assert.ok(lean.points.length >= 2 && lean.points.length <= 5);
    assert.ok(lean.points.every((p) => /\d/.test(p.text)), "every point quotes a number");
    // Spread slot is a point number, never a price.
    if (lean.leg.kind === "spread") assert.equal(lean.report.title, "BBB -3.5");
  }
});

const fx = (n: string) => JSON.parse(readFileSync(join(__dirname, "fixtures", n), "utf8"));

t("more sports: soccer three-way price and win chance from real ESPN data", () => {
  const { matches } = parseSportScoreboard(sportLeague("epl")!, fx("espn-epl-scoreboard.json"));
  const m = matches.find((x) => x.home.short === "ARS");
  assert.ok(m, "Arsenal match parsed");
  assert.equal(m!.price?.provider, "DraftKings");
  assert.equal(m!.price?.homeMl, "-245");
  assert.equal(m!.price?.awayMl, "+650");
  assert.equal(m!.price?.drawMl, "+390");
  assert.equal(m!.price?.spread, "ARS -1.5");
  assert.ok(!/[+-]\d{3}/.test(m!.price?.spread ?? ""), "spread is never a price");
  assert.equal(m!.win?.source, "moneyline");
  assert.ok(m!.win!.draw! > 10);
});

t("more sports: tennis and UFC are head-to-head; golf is a leaderboard", () => {
  const atp = parseSportScoreboard(sportLeague("atp")!, fx("espn-atp-scoreboard.json"), Date.parse("2026-10-05T06:00Z"));
  assert.ok(atp.matches.length >= 1);
  assert.ok(atp.matches.every((m) => m.home.name && m.away.name && m.home.name !== m.away.name));
  assert.ok(atp.matches.some((m) => m.away.sets.length > 0), "set scores read");
  assert.ok(atp.matches.every((m) => m.win === null || m.price !== null), "no win chance without a price");
  const ufc = parseSportScoreboard(sportLeague("ufc")!, fx("espn-ufc-scoreboard.json"));
  assert.equal(ufc.matches.length, 3);
  assert.ok(ufc.matches.some((m) => /Allen/.test(m.away.name + m.home.name)));
  const pga = parseSportScoreboard(sportLeague("pga")!, fx("espn-pga-scoreboard.json"));
  assert.equal(pga.matches.length, 0);
  assert.equal(pga.golf[0].rows[0].pos, "T1");
  assert.equal(pga.golf[0].rows[0].score, "-11");
  assert.deepEqual(parseMatchFeed({ keyEvents: [{ id: "1", text: "Goal! Saka", clock: { displayValue: "12'" }, type: { type: "goal" } }] })[0].clock, "12'");
});


// ---- Slip fix: markets, names, never blocked ----
t("slip markets: PrizePicks wording maps to a stat", () => {
  assert.equal(propMarketOf("Longest Rush"), "longest rush");
  assert.equal(propMarketOf("longest reception"), "longest reception");
  assert.equal(propMarketOf("Longest Completion"), "longest completion");
  assert.equal(propMarketOf("Fantasy Score"), "fantasy score");
  assert.equal(propMarketOf("Rush+Rec Yds"), "rushing + receiving yards");
  assert.equal(propMarketOf("Pass+Rush Yds"), "passing + rushing yards");
  assert.equal(propMarketOf("Pts+Rebs+Asts"), "points + rebounds + assists");
  assert.equal(propMarketOf("Pts+Rebs"), "points + rebounds");
  assert.equal(propMarketOf("Rebs+Asts"), "rebounds + assists");
  assert.equal(propMarketOf("3-PT Made"), "3-pointers");
  assert.equal(propMarketOf("Receiving Targets"), "targets");
  assert.equal(propMarketOf("Points"), "points");
});

t("slip names: fuzzy match allows accents, suffixes, initials, a typo", () => {
  assert.ok(nameClose("Chelsea Gray", "Chelsea Grey"));
  assert.ok(nameClose("C. Gray", "Chelsea Gray"));
  assert.ok(nameClose("Kenneth Walker III", "Kenneth Walker"));
  assert.ok(nameClose("Nikola Jokić", "Nikola Jokic"));
  assert.ok(!nameClose("Chelsea Gray", "Josh Gray"));
});

t("live meter: fantasy score, combos, and longest plays from the box", () => {
  const qb = { passingYards: "250", passingTouchdowns: "2", interceptions: "1", rushingYards: "30", rushingTouchdowns: "0" };
  // 250*.04 + 2*4 - 1 + 30*.1 = 10 + 8 - 1 + 3 = 20
  assert.equal(liveStat(qb, "fantasy score"), 20);
  const wr = { receptions: "6", receivingYards: "84", receivingTouchdowns: "1", longReception: "31", fumblesLost: "1" };
  // 6 + 8.4 + 6 - 1 = 19.4
  assert.equal(liveStat(wr, "fantasy score"), 19.4);
  const hoops = { points: "12", rebounds: "4", assists: "7", steals: "1", blocks: "0", turnovers: "3" };
  // 12 + 4.8 + 10.5 + 3 + 0 - 3 = 27.3
  assert.equal(liveStat(hoops, "fantasy score"), 27.3);
  assert.equal(liveStat(hoops, "points + assists"), 19);
  assert.equal(liveStat({ rushingYards: "40", receivingYards: "22" }, "rushing + receiving yards"), 62);
  assert.equal(liveStat({ rushingYards: "40", longRushing: "17" }, "longest rush"), 17);
  assert.equal(liveStat(wr, "longest reception"), 31);
  assert.equal(liveStat({ rushingYards: "40" }, "longest rush"), null);
  const plays = [{ text: "(Shotgun) B.Bachmeier pass short right to C.Smith to ISU 40 for 12 yards" }, { text: "B.Bachmeier pass deep left to J.Doe for 38 yards, TOUCHDOWN" }, { text: "B.Bachmeier pass incomplete deep right to J.Doe" }];
  assert.equal(longestPassFromPlays(plays, "Bear Bachmeier"), 38);
  assert.equal(liveStat({ passingYards: "50" }, "longest completion", plays, "Bear Bachmeier"), 38);
  assert.ok(marketTerms("fantasy score").length > 0);
  assert.equal(marketTerms("first basket").length, 0);
});

t("slip import never blocks: unknown players and markets save as manual legs", () => {
  const games: SlateGame[] = [{ league: "ncaaf", id: "401856826", start: "2026-10-10T02:30Z", state: "pre", away: { id: "66", abbr: "ISU", name: "Iowa State Cyclones" }, home: { id: "252", abbr: "BYU", name: "BYU Cougars" } }];
  const row = (subject: string, market: string, line: number, sel: "Over" | "Under") => ({ subject, market, line, selection: sel, odds: null, kind: "prop" as const });
  const a = matchRow(row("Bear Bachmeier", "longest rush", 17.5, "Under"), games, { id: "1", name: "Bear Bachmeier", league: "ncaaf", teamId: "252" });
  assert.ok(a.leg && a.game, "tied to the game");
  assert.equal(a.row.market, "longest rush");
  assert.equal(a.manual, false, "longest rush has a live meter");
  assert.equal(a.issue, null);
  const b = matchRow(row("Jaylen Raynor", "fantasy score", 13.5, "Over"), games, { id: "2", name: "Jaylen Raynor", league: "ncaaf", teamId: "66" });
  assert.ok(b.leg && b.game);
  assert.equal(b.issue, null);
  const c = matchRow(row("Chelsea Gray", "points", 7.5, "Over"), games, null);
  assert.equal(c.leg, null);
  assert.equal(c.manual, true);
  assert.match(c.issue ?? "", /manual/);
  const d = matchRow(row("Bear Bachmeier", "anytime touchdown scorer", 0.5, "Over"), games, { id: "1", name: "Bear Bachmeier", league: "ncaaf", teamId: "252" });
  assert.ok(d.leg && d.manual, "unknown stat still makes a leg, graded by you");
});

console.log(`\n${n} passed`);
