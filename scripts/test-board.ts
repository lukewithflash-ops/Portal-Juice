import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { coldProps, hotProps, streakingPlayers, streakingTeams } from "../src/lib/board";
import { HISTORY } from "../src/data/history";
import { allowedHeadshot, licensedHosts } from "../src/lib/headshots";
import { FIXTURE } from "./fixtures/history.fixture";
import { lastNAverage, parsePrice, rankGames, sportsDate } from "../src/lib/slate";

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
  assert.deepEqual(lastNAverage(log, "points", 2), { avg: 25, games: 2 });
  assert.equal(lastNAverage(log, "rebounds", 2), null);
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
    if (statSync(r).isDirectory()) walk2(r);
    else files.push(r);
  }
  for (const f of files) {
    if (!/\.(tsx?|css|md|webmanifest|js|example)$/.test(f) && !f.endsWith(".example")) continue;
    const text = readFileSync(f, "utf8");
    assert.ok(!banned.test(text), `${f} matches ${text.match(banned)?.[0]}`);
  }
});

console.log(`\n${n} passed`);
