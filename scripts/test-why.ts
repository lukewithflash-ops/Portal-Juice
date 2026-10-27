import assert from "node:assert/strict";
import { factorCheck, injuryLevel, moveToward, similarRecord, whyInjuries, type FactorCtx, type SimPick } from "../src/lib/whyCore";
import type { DkSplitEvent } from "../src/lib/teamDataCore";

assert.equal(injuryLevel("Out"), "out");
assert.equal(injuryLevel("Day-To-Day"), "questionable");
const inj = whyInjuries([{ team: "MIN", name: "Anthony Edwards", status: "Out" }, { team: "MIN", name: "Bench Guy", status: "Out" }, { team: "LAL", name: "LeBron James", status: "Questionable" }], [{ team: "MIN", name: "Anthony Edwards" }, { team: "LAL", name: "LeBron James" }]);
assert.equal(inj[0].key, true);
assert.equal(inj.find((i) => i.name === "Bench Guy")!.key, false);
const ev: DkSplitEvent = { id: "1", title: "LAL Lakers @ MIN Timberwolves", away: "LAL Lakers", home: "MIN Timberwolves", awayAbbr: "LAL", homeAbbr: "MIN", when: "", markets: [
  { name: "Spread", rows: [{ side: "LAL Lakers +3", odds: "-110", handle: 30, bets: 70 }, { side: "MIN Timberwolves -3", odds: "-110", handle: 70, bets: 30 }] },
  { name: "Total", rows: [{ side: "Over 220.5", odds: "-110", handle: 80, bets: 80 }, { side: "Under 220.5", odds: "-110", handle: 20, bets: 20 }] },
] };
const ctx: FactorCtx = { injuries: inj, move: { spreadHome: -3, spreadHomeOpen: -5, total: 220.5, totalOpen: 223 }, splits: ev, home: "MIN", away: "LAL" };
const L = { league: "nba", gameId: "9" };
assert.equal(moveToward({ kind: "spread", side: "home" }, ctx.move), -2);
// Home MIN: key player out -> skip
assert.match(factorCheck({ ...L, kind: "spread", side: "home", line: -3 }, ctx).skip ?? "", /Edwards/);
// Away LAL: line moved 2 toward, opponent key out -> pros; LAL key Q -> con
const away = factorCheck({ ...L, kind: "spread", side: "away", line: 3 }, ctx);
assert.equal(away.skip, null);
assert.ok(away.pros.some((p) => /Edwards/.test(p)) && away.pros.some((p) => /toward/.test(p)) && away.pros.some((p) => /Reverse/.test(p)));
assert.ok(away.cons.some((c) => /LeBron/.test(c)));
// Over: total dropped 2.5 -> skip
assert.match(factorCheck({ ...L, kind: "total", pick: "over", line: 220.5 }, ctx).skip ?? "", /against/);
// RLM against: 70% money on MIN, line moved 0.5 away
const rlm = factorCheck({ ...L, kind: "spread", side: "home", line: -4.5 }, { ...ctx, injuries: [], move: { spreadHome: -4.5, spreadHomeOpen: -5, total: null, totalOpen: null } });
assert.match(rlm.skip ?? "", /Reverse line move against/);
// Prop: player listed -> skip
assert.ok(factorCheck({ ...L, kind: "prop", athleteName: "LeBron James", line: 25.5, pick: "over" }, ctx).skip);
assert.equal(factorCheck({ ...L, kind: "spread", side: "home" }, null).skip, null);
// Similar record
const sp = (o: Partial<SimPick>): SimPick => ({ league: "nba", kind: "spread", team: "MIN", home: "MIN", away: "X", atHome: true, fav: true, num: 4, result: "W", ...o });
const rows = similarRecord([sp({}), sp({ result: "L" }), sp({ home: "Y", away: "Z", num: 8 }), sp({ kind: "total", team: null, atHome: null, fav: null, num: null }), sp({ league: "nfl" })], { league: "nba", home: "MIN", away: "LAL", spreadHome: -3.5, lg: "NBA" });
const by = Object.fromEntries(rows.map((r) => [r.label, r]));
assert.equal(by["Games with MIN"].n, 3);
assert.equal(by["Games with LAL"].note, "No graded picks yet");
assert.equal(by["Home fav -3–6.5 spread"].w, 1);
assert.equal(by["Home fav -3–6.5 spread"].l, 1);
assert.equal(by["Home fav -3–6.5 spread"].note, "Small sample");
assert.equal(by["NBA totals"].n, 1);
assert.equal(by["All NBA Portal picks"].n, 4);
console.log("why ok");
