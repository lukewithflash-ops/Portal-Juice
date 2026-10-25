import assert from "node:assert/strict";
import { propMarketOf, parseSlipRows, statFromNearbyText } from "@/lib/slipImport";
import { statShort } from "@/lib/sweat";
import { reResolve } from "@/lib/pickStore";
const T = "two-pointers attempted";
for (const s of ["2-pt att", "2-Pt Att", "2PT ATT", "2 pt attempts", "2-Pointers Attempted", "2PA"]) {
  assert.equal(propMarketOf(s), T, s);
  assert.equal(statShort(s).toUpperCase(), "2-PT ATT", s);
  const r = parseSlipRows(`Anthony Edwards\nOver 11.5 ${s}`)[0];
  assert.equal(r?.market, T, "paste " + s);
  assert.equal(r?.marketRaw?.toLowerCase(), s.toLowerCase(), "raw kept " + s);
  // Vision model tidied it to Points: the slip's own lines win.
  assert.equal(statFromNearbyText(["Anthony Edwards", "TOR @ MIN", `11.5 ${s}`, "More"], "Anthony Edwards", "points"), T, "nearby " + s);
}
assert.equal(statShort("points"), "pts");
assert.equal(statShort("points + rebounds + assists"), "Pts+Reb+Ast");
assert.equal(statFromNearbyText(["Anthony Edwards", "11.5 Points"], "Anthony Edwards", "points"), null);
const base = { id: "x", sport: "nba", subject: "Anthony Edwards", line: 11.5, odds: 0, stake: 0, book: "Power Play", date: "2026-10-25", status: "open", createdAt: "" } as never;
assert.equal(reResolve({ ...(base as object), market: "points", marketRaw: "2-pt att" } as never).market, T);
assert.equal(reResolve({ ...(base as object), market: "points" } as never).market, "points");
import { statFromMarket } from "@/lib/breakdown";
for (const m of ["two-pointers attempted", "two-pointers made", "2-pt att"]) assert.equal(statFromMarket("nba", m), null, m);
assert.equal(statFromMarket("nba", "points"), "points");
assert.equal(statFromMarket("nba", "3-pointers"), "threePointFieldGoalsMade");
console.log("2PA tests ok");
