import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { boards, parseDkOdds, parseDkSplits, summarize, tdLeague, type TdGame } from "../src/lib/teamDataCore";

const nba = tdLeague("nba")!;
const g = (id: string, d: string, h: string, a: string, hs: number, as: number, sp: number | null, tot: number | null): TdGame => ({ id, d, h, a, hs, as, hq: [25, 25, 25, hs - 75], aq: [25, 25, 25, as - 75], sp, tot });
const games = [
  g("1", "2026-01-01T03:00:00Z", "BOS", "NYK", 110, 100, -5, 200), // BOS home fav, wins by 10: covers, over
  g("2", "2026-01-02T03:00:00Z", "NYK", "BOS", 104, 100, 2, 210), // BOS away fav (-2): loses, no cover, under
  g("3", "2026-01-05T03:00:00Z", "BOS", "MIA", 100, 97, -3, 197), // push ATS, push total
  g("4", "2026-01-06T03:00:00Z", "MIA", "BOS", 90, 95, null, null), // no line: SU only
];
const s = summarize(nba, games, "BOS");
assert.equal(s.all.n, 4);
assert.deepEqual([s.all.w, s.all.l], [3, 1]);
assert.deepEqual(s.all.ats, [1, 1, 1]);
assert.equal(s.all.atsN, 3);
assert.deepEqual(s.all.ou, [1, 1, 1]);
const home = s.splits.find((x) => x.label === "Home")!.r;
assert.equal(home.n, 2);
const b2b = s.splits.find((x) => x.label === "Back-to-back")!.r;
assert.equal(b2b.n, 2, "games 2 and 4 are back-to-backs");
assert.equal(s.splits.find((x) => x.label === "After a win")!.r.n, 2);
assert.equal(s.per.n, 4);
assert.ok(boards(nba, [s], 1).length > 0);

// DraftKings odds parse
const odds = { items: [{ provider: { id: "58", name: "ESPN BET" }, spread: 9 }, { provider: { id: "100", name: "DraftKings" }, spread: 4.5, overUnder: 227.5, homeTeamOdds: { open: { pointSpread: { american: "+3.5" }, moneyLine: { american: "+124" } }, close: { pointSpread: { american: "+4.5" }, moneyLine: { american: "+150" } } }, awayTeamOdds: { close: { moneyLine: { american: "-180" } } }, open: { total: { american: "231.5" } }, close: { total: { american: "227.5" } } }] };
const o = parseDkOdds(odds)!;
assert.equal(o.sp, 4.5);
assert.equal(o.osp, 3.5);
assert.equal(o.tot, 227.5);
assert.equal(o.otot, 231.5);
assert.equal(o.mla, -180);
assert.equal(parseDkOdds({ items: [{ provider: { id: "58", name: "ESPN BET" } }] }), null, "only DraftKings");

// DK Network splits HTML
const fx = "scripts/fixtures/dk-splits.html";
if (existsSync(fx)) {
  const ev = parseDkSplits(readFileSync(fx, "utf8"));
  assert.ok(ev.length > 0);
  const e = ev[0];
  assert.ok(e.homeAbbr && e.awayAbbr);
  assert.ok(e.markets.length >= 3, "moneyline, spread, total");
  for (const m of e.markets) for (const r of m.rows) assert.ok(r.bets >= 0 && r.bets <= 100 && r.handle >= 0 && r.handle <= 100);
  console.log("dk splits:", e.title, JSON.stringify(e.markets[1]));
}
console.log("teamdata ok");
