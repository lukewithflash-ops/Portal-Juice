/** Book sync (SharpSports) pure logic, checked against the payload examples in docs.sharpsports.io. No network. */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { bookSyncOn, outcomeStatus, periodWords, rowFromBet, syncPickId, syncSlipId, verifyHmac, webhookAction, type SsBetSlip } from "../src/lib/bookSyncCore";
import { trackableMarket } from "../src/lib/tracker";

// Flag: off by default, on for allowlist / owner / test cookie / global env.
assert.equal(bookSyncOn({ env: undefined, allow: undefined, uid: "u1", owner: false, cookie: undefined }), false);
assert.equal(bookSyncOn({ env: undefined, allow: "a, u1", uid: "u1", owner: false, cookie: undefined }), true);
assert.equal(bookSyncOn({ env: undefined, allow: "a", uid: null, owner: false, cookie: "1" }), true);
assert.equal(bookSyncOn({ env: "1", allow: "", uid: null, owner: false, cookie: undefined }), true);
assert.equal(bookSyncOn({ env: "0", allow: "", uid: "x", owner: true, cookie: undefined }), true);

// HMAC: base64(HMAC-SHA256(secret, raw body)), exact bytes.
const raw = JSON.stringify({ event: "refreshresponse.created", sender: "SampleApp", data: { id: "RRES_1" } });
const sig = createHmac("sha256", "s3cret").update(raw).digest("base64");
assert.ok(verifyHmac(raw, sig, "s3cret"));
assert.ok(!verifyHmac(raw + " ", sig, "s3cret"));
assert.ok(!verifyHmac(raw, sig, "other"));
assert.ok(!verifyHmac(raw, null, "s3cret"));
assert.ok(!verifyHmac(raw, sig, undefined));

// Docs example betSlip (BetMGM spread single), money fields present on the wire.
const docSlip: SsBetSlip & { atRisk: number; toWin: number } = {
  id: "SLIP_c27a9b53280e4658b9d8720ad6597268",
  book: { id: "BOOK_pPg9ABaPSj2mL6qoMTKR1A", name: "BetMGM", abbr: "mg" },
  bettorAccount: "BACT_9c8448050aa04a14bffbf2f6602ac37f",
  timePlaced: "2024-07-01T23:44:35Z",
  type: "single",
  oddsAmerican: -155,
  atRisk: 5000,
  toWin: 3226,
  status: "completed",
  outcome: "win",
  bets: [
    {
      id: "BET_5d0b6e51f3c6433a834925fc6c996979",
      type: "straight",
      event: { league: "NFL", name: "Miami Dolphins @ Kansas City Chiefs", startTime: "2024-01-14T01:00:00Z", startDate: "2024-01-14", contestantAway: { fullName: "Miami Dolphins" }, contestantHome: { fullName: "Kansas City Chiefs" } },
      proposition: "spread",
      position: "Miami Dolphins",
      line: 4.5,
      oddsAmerican: -105,
      status: "completed",
      outcome: "loss",
      segmentId: "SEGM_M",
    },
  ],
};
const r0 = rowFromBet(docSlip.bets![0]);
assert.equal(r0.kind, "spread");
assert.equal(r0.subject, "Miami Dolphins");
assert.equal(r0.line, 4.5);
assert.equal(r0.league, "nfl");
assert.equal(r0.date, "2024-01-14");
assert.equal(r0.opponent, "Kansas City Chiefs");
assert.equal(r0.period, null);
assert.ok(!JSON.stringify(r0).includes("5000") && !JSON.stringify(r0).includes("3226"), "no money on rows");
assert.equal(outcomeStatus(docSlip.bets![0].outcome, "completed"), "loss");
assert.equal(outcomeStatus("win"), "win");
assert.equal(outcomeStatus("push"), "push");
assert.equal(outcomeStatus("void"), "push");
assert.equal(outcomeStatus(null, "pending"), "open");

// Docs propDetails example (James Harden free throws) → a prop row our stat parser reads.
const harden = rowFromBet({ id: "BET_x", type: "prop", event: { league: "NBA", startDate: "2024-03-01" }, proposition: "total", position: "Over", line: 5.5, oddsAmerican: -120, status: "pending", outcome: null, propDetails: { player: "James Harden", metricSpecial: "Free Throws" } });
assert.equal(harden.kind, "prop");
assert.equal(harden.subject, "James Harden");
assert.equal(harden.selection, "Over");
assert.equal(harden.line, 5.5);
assert.equal(harden.market, "free throws made");
assert.ok(trackableMarket(harden.market, "nba"), `live tracker follows "${harden.market}"`);

// Quarter / half segments carry into our period code.
assert.equal(periodWords({ id: "b", segmentDetail: "2nd Quarter" }), "2Q");
assert.equal(periodWords({ id: "b", segmentId: "SEGM_H1" }), "1H");
assert.equal(periodWords({ id: "b", segmentId: "SEGM_M" }), null);
const q2 = rowFromBet({ id: "b", type: "prop", event: { league: "NFL" }, position: "Under", line: 30.5, segmentDetail: "2nd Quarter", propDetails: { player: "Amon-Ra St. Brown", metricSpecial: "Receiving Yards" } });
assert.equal(q2.period, "2Q");
assert.equal(q2.selection, "Under");
assert.match(q2.market, /receiving yards · 2nd quarter/);
assert.ok(trackableMarket(q2.market, "nfl"), "quarter prop is trackable");

// Total and moneyline rows.
const tot = rowFromBet({ id: "b", type: "straight", event: { league: "NBA", contestantAway: { fullName: "Boston Celtics" }, contestantHome: { fullName: "Miami Heat" } }, proposition: "total", position: "Under 210.5", line: 210.5 });
assert.equal(tot.kind, "total");
assert.equal(tot.selection, "Under");
const ml = rowFromBet({ id: "b", type: "straight", event: { league: "NHL", contestantAway: { fullName: "Boston Bruins" }, contestantHome: { fullName: "New York Rangers" } }, proposition: "moneyline", position: "New York Rangers" });
assert.equal(ml.kind, "moneyline");
assert.equal(ml.opponent, "Boston Bruins");
assert.equal(ml.line, null);

// Stable ids: dedupe on betSlip id.
assert.equal(syncPickId(docSlip.id, 0), syncPickId(docSlip.id, 0));
assert.notEqual(syncPickId(docSlip.id, 0), syncPickId(docSlip.id, 1));
assert.ok(syncPickId(docSlip.id, 12).length <= 80);
assert.equal(syncSlipId(docSlip.id), "ss:SLIP_c27a9b53280e4658b9d8720ad6597268");

// Webhooks, from the docs' examples.
const rr = webhookAction({ event: "refreshresponse.created", sender: "SampleApp", data: { id: "RRES_95ac", bettor: "BTTR_a0eb", bettorAccount: "BACT_a679", status: 200, type: "manual", betSlips: [docSlip] } });
assert.equal(rr.kind, "refreshed");
assert.equal(rr.bettor, "BTTR_a0eb");
assert.equal(rr.account, "BACT_a679");
assert.equal(rr.slips.length, 1);
const un = webhookAction({ event: "bettoraccount.unverified", sender: "SampleApp", data: { id: "BACT_IqNr", bettor: "BTTR_cahA", book: "wh", region: "New Jersey" } });
assert.deepEqual([un.kind, un.account, un.book], ["relink", "BACT_IqNr", "wh"]);
const ver = webhookAction({ event: "bettoraccount.verified", data: { id: "BACT_7dae", bettor: "BTTR_4d1c", book: { id: "BOOK_n", name: "DraftKings", abbr: "dk" } } });
assert.deepEqual([ver.kind, ver.account, ver.book], ["linked", "BACT_7dae", "DraftKings"]);
assert.equal(webhookAction({ event: "bettor.created", data: {} }).kind, "ignore");

console.log("ok - book sync: flag, HMAC, docs betSlip/webhook mapping, periods, dedupe ids, no money fields");
