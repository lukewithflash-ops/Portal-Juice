import assert from "node:assert/strict";
import { compactSnaps, gapRows, gradeLean, moneyRates, splitTrend, type MlEvent, type MlSnap } from "../src/lib/teamDataCore";

const t = (min: number) => new Date(Date.UTC(2026, 9, 26, 18, 0) + min * 60000).toISOString();
const snap = (min: number, h: number, b: number): MlSnap => ({ t: t(min), m: { Spread: [{ side: "SEA Seahawks -3", odds: "-110", h, b }, { side: "LA Rams +3", odds: "-110", h: 100 - h, b: 100 - b }] } });
const snaps: MlSnap[] = [];
for (let i = 0; i <= 18; i++) snaps.push(snap(i * 20, 50 + i, 50 - i)); // 6h of 20-min snaps
const ev: MlEvent = { id: "1", lg: "nfl", title: "LA Rams @ SEA Seahawks", away: "LA Rams", home: "SEA Seahawks", awayAbbr: "LAR", homeAbbr: "SEA", start: t(370), snaps };

const c = compactSnaps(ev);
assert.equal(c[0].t, snaps[0].t, "open kept");
assert.equal(c[c.length - 1].t, snaps[18].t, "close kept");
assert.ok(c.length <= 8 && c.length >= 6, "hourly in between: " + c.length);

const tr = splitTrend(ev, "Spread")!;
assert.equal(tr.from, 50); assert.equal(tr.to, 68); assert.match(tr.text, /50% → 68% in 6h/);

const g = gapRows([ev]);
assert.equal(g.length, 1); assert.equal(g[0].side, "SEA Seahawks -3"); assert.equal(g[0].gap, 68 - 32);

// money on SEA -3 (68%), tickets on LAR +3 (68% bets). SEA wins by 7: money covers, tickets miss -> fade hits.
const gr = gradeLean(ev, { hs: 24, as: 17 });
assert.equal(gr[0].result, "won"); assert.equal(gr[0].tSide, "LA Rams +3"); assert.equal(gr[0].tResult, "lost");
const r = moneyRates([{ ...ev, final: { hs: 24, as: 17, espnId: "x" }, graded: gr }]);
assert.deepEqual(r.all.follow, { w: 1, l: 0, p: 0 }); assert.deepEqual(r.all.fade, { w: 1, l: 0, p: 0 });
assert.equal(r.byMarket.Spread.follow.w, 1); assert.equal(r.byLeague.nfl.fade.w, 1); assert.equal(r.games, 1);
// one-sided early market is skipped from gaps
assert.equal(gapRows([{ ...ev, snaps: [snap(0, 100, 100)] }]).length, 0);
console.log("splitgap ok");
