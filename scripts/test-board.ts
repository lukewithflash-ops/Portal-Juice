import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { coldProps, hotProps, streakingPlayers, streakingTeams } from "../src/lib/board";
import { HISTORY } from "../src/data/history";
import { allowedHeadshot } from "../src/lib/headshots";
import { FIXTURE } from "./fixtures/history.fixture";

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

console.log(`\n${n} passed`);
