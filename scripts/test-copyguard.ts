import assert from "node:assert/strict";
import { alreadyInLog, copyDupes } from "../src/lib/copyGuard";
import type { Pick } from "../src/lib/types";
const leg = (id: string, slip: string, subject: string, t: string, extra: Partial<Pick> = {}): Pick =>
  ({ id, sport: "NBA", subject, line: 11.5, odds: 0, stake: 0, book: "Tailed from @rotb", date: "2026-10-25", status: "open", createdAt: t, market: "pts", selection: "Over", gameId: "g1", tailFrom: "rotb", slipId: slip, ...extra }) as Pick;
const a = [leg("1", "A", "Edwards", "2026-10-25T20:00:00Z"), leg("2", "A", "Towns", "2026-10-25T20:00:00Z")];
const b = [leg("3", "B", "Towns", "2026-10-25T20:00:30Z"), leg("4", "B", "Edwards", "2026-10-25T20:00:30Z")];
const c = [leg("5", "C", "Edwards", "2026-10-25T21:00:00Z"), leg("6", "C", "Towns", "2026-10-25T21:00:00Z")];
const d = [leg("7", "D", "Edwards", "2026-10-25T20:01:00Z"), leg("8", "D", "Gobert", "2026-10-25T20:01:00Z")];
const e = [leg("9", "E", "Edwards", "2026-10-25T20:01:00Z", { status: "win" }), leg("10", "E", "Towns", "2026-10-25T20:01:00Z", { status: "win" })];
assert.deepEqual(copyDupes([...a, ...b]).sort(), ["3", "4"]);
assert.deepEqual(copyDupes([...a, ...c]), [], "outside 2 min window kept");
assert.deepEqual(copyDupes([...a, ...d]), [], "different legs kept");
assert.deepEqual(copyDupes([...a, ...e]), [], "graded copies kept");
assert.deepEqual(copyDupes(a.map((p) => ({ ...p, tailFrom: undefined }))), [], "own picks untouched");
assert.ok(alreadyInLog(a, [{ subject: "Towns", line: 11.5, market: "pts", selection: "Over", gameId: "g1" }, { subject: "Edwards", line: 11.5, market: "pts", selection: "Over", gameId: "g1" }], "rotb"));
assert.ok(!alreadyInLog(a, [{ subject: "Towns", line: 11.5, market: "pts", selection: "Over", gameId: "g1" }], "rotb"), "subset is not the same slip");
console.log("copyguard ok");
