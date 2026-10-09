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
import { rankLeaders, cleanLeg, cleanLeaderHandle } from "../src/lib/leaderRank";
import { unitHint } from "../src/lib/units";
import { marketFavorites, biggestMoves, hotTrends, mvpHomework } from "../src/lib/best";
import { playKind, playerFromText, isShotAttempt } from "../src/lib/tracker";
import { clockSpan, isBigPlay, paceOf, parseLine, scoringRun, statNumber, trackProps } from "../src/lib/tracker";
import type { LivePlay, LiveSnap } from "../src/lib/live";

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
  const banned = /\b(place (a )?bet|bet now|bet button|coins?|balance|payout|cash ?out|parlay|money won|mascot|wizard|cartoon)\b/i;
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
  assert.equal(price.provider, "Draft Kings");
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


t("suggested unit comes only from logged stakes", () => {
  const mk = (stake: number, status: "open" | "win" = "win") => ({ id: String(stake) + status, sport: "NBA", subject: "x", line: 1, odds: 0, stake, book: "b", date: "2026-10-08", status, createdAt: "" }) as Parameters<typeof unitHint>[0][number];
  assert.equal(unitHint([]), null);
  assert.equal(unitHint([mk(0)]), null);
  const h = unitHint([mk(10), mk(20, "open"), mk(30), mk(0)]);
  assert.ok(h);
  assert.equal(h.unit, 20);
  assert.equal(h.count, 3);
  assert.equal(h.total, 60);
  assert.equal(h.totalUnits, 3);
  assert.equal(h.openUnits, 1);
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

console.log(`\n${n} passed`);
