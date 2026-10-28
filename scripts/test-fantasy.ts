import assert from "node:assert/strict";
import { propMarketOf } from "@/lib/slipImport";
import { liveStat } from "@/lib/tracker";
import { reResolve } from "@/lib/pickStore";
for (const s of ["Fantasy Score", "Fantasy Pts", "Fantasy Points", "FS", "FPTS", "Player Fantasy Score"]) assert.equal(propMarketOf(s), "fantasy score", s);
// NBA box: 20 pts, 5 reb, 8 ast, 2 stl, 1 blk, 3 TO = 20 + 6 + 12 + 6 + 3 - 3 = 44
assert.equal(liveStat({ PTS: "20", REB: "5", AST: "8", STL: "2", BLK: "1", TO: "3" }, "fantasy score"), 44);
const base = { id: "x", sport: "nba", subject: "Ja Morant", line: 40.5, odds: 0, stake: 0, book: "PrizePicks", date: "2026-10-27", status: "open", createdAt: "" };
// Misread slip text still re-reads while you haven't touched it...
assert.equal(reResolve({ ...base, market: "fantasy score", marketRaw: "Points" } as never).market, "points");
// ...but once you edit the stat, the edit drops marketRaw and your stat sticks.
const edited = { ...base, market: "fantasy score", marketRaw: "Points" } as Record<string, unknown>;
delete edited.marketRaw;
assert.equal(reResolve(edited as never).market, "fantasy score");
console.log("fantasy tests ok");
