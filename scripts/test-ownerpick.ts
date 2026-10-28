import assert from "node:assert";
import { buildOwnerPick, gradeOwnerPick, ownerRecord, ownerPickText } from "../src/lib/ownerPick";
const g = { id: "1", league: "nba", leagueLabel: "NBA", start: "2099-01-01T00:00:00Z", state: "pre", away: { abbr: "BOS" }, home: { abbr: "NYK" },
  price: { provider: "DraftKings", total: 220.5, overJuice: "-110", underJuice: "-110", homeSpread: "-3.5", awaySpread: "+3.5", homeSpreadJuice: "-108", awaySpreadJuice: "-112", homeMl: "-160", awayMl: "+135", spreadHome: -3.5, totalOpen: null, spreadHomeOpen: null, spreadDetail: null } } as never;
const s = buildOwnerPick(g, "free", "spread", "BOS", " ok ", "20261026");
assert.ok(typeof s !== "string"); assert.equal(s.line, 3.5); assert.equal(s.odds, "-112"); assert.equal(ownerPickText(s), "BOS +3.5");
assert.equal(gradeOwnerPick(s, 100, 103), "hit"); assert.equal(gradeOwnerPick(s, 100, 104), "miss");
const t = buildOwnerPick(g, "vip", "total", "Under", "", "20261026"); assert.ok(typeof t !== "string"); assert.equal(gradeOwnerPick(t, 100, 100), "hit");
const m = buildOwnerPick(g, "vip", "ml", "NYK", "", "20261026"); assert.ok(typeof m !== "string"); assert.equal(m.odds, "-160"); assert.equal(gradeOwnerPick(m, 99, 100), "hit");
assert.equal(typeof buildOwnerPick({ ...(g as object), price: { ...(g as { price: object }).price, provider: "ESPN BET" } } as never, "free", "ml", "NYK", "", "d"), "string");
assert.equal(typeof buildOwnerPick(g, "free", "ml", "LAL", "", "d"), "string");
const r = ownerRecord([{ date: "3", result: "hit" }, { date: "2", result: "push" }, { date: "1", result: "hit" }, { date: "0", result: "miss" }, { date: "4", result: null }]);
assert.deepEqual(r, { w: 2, l: 1, p: 1, rate: 66.7, streak: "W2" });
import { agentAuthorized } from "../src/lib/ownerAgent";
const sec = "x".repeat(40);
assert.equal(agentAuthorized(sec, sec), true); assert.equal(agentAuthorized("y".repeat(40), sec), false);
assert.equal(agentAuthorized(null, sec), false); assert.equal(agentAuthorized("short", "short"), false); assert.equal(agentAuthorized(sec, undefined), false);
console.log("ownerpick ok");
