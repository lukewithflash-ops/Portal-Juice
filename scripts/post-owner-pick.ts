/**
 * Post a Bettor's Choice pick for the owner (owner-approved assistant path).
 * Usage: tsx scripts/post-owner-pick.ts <free|vip> <league> <team> <spread|total|ml> <side> [--note "..."] [--dry] [--notify]
 *   side: team abbr for spread/ml, Over|Under for total. team: abbr or name fragment to find the game.
 * Reads OWNER_AGENT_SECRET from /workspace/.pj-owner-agent.env (never printed).
 */
import { readFileSync } from "node:fs";

const env = readFileSync(process.env.PJ_OWNER_AGENT_ENV || "/workspace/.pj-owner-agent.env", "utf8");
const secret = /OWNER_AGENT_SECRET=(\S+)/.exec(env)?.[1];
if (!secret) throw new Error("OWNER_AGENT_SECRET missing in env file");
const base = process.env.PJ_BASE || "https://portaljuice.app";
const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const noteI = argv.indexOf("--note");
const note = noteI >= 0 ? argv[noteI + 1] ?? "" : "";
const pos = argv.filter((a, i) => !a.startsWith("--") && !(noteI >= 0 && i === noteI + 1));
const [slot, league, team, market, side] = pos;
if (!slot || !league || !team || !market || !side) {
  console.error("Usage: tsx scripts/post-owner-pick.ts <free|vip> <league> <team> <spread|total|ml> <side> [--note ..] [--dry] [--notify]");
  process.exit(1);
}
const call = async (body: Record<string, string>) => {
  const r = await fetch(`${base}/api/ownerpick`, { method: "POST", headers: { "content-type": "application/json", "x-pj-owner-agent": secret }, body: JSON.stringify(body) });
  return { status: r.status, j: (await r.json().catch(() => ({}))) as any };
};
(async () => {
  const { status, j } = await call({ list: "1", league });
  if (status !== 200) { console.error("List failed", status, j); process.exit(1); }
  const t = team.toLowerCase();
  const games = (j.games as any[]).filter((g) => [g.away, g.home, g.awayName, g.homeName].some((v: string) => v?.toLowerCase().includes(t)));
  console.log(`Matching ${league} games:`);
  for (const g of games) console.log(`  ${g.id}  ${g.away} @ ${g.home}  ${g.state}  ${new Date(g.start).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT`);
  const pre = games.filter((g) => g.state === "pre");
  if (pre.length !== 1) { console.error(pre.length ? "Ambiguous: more than one upcoming game matches." : "No upcoming game matches."); process.exit(1); }
  const g = pre[0];
  const sideV = market === "total" ? side[0].toUpperCase() + side.slice(1).toLowerCase() : side.toUpperCase();
  const res = await call({ slot, league, gameId: g.id, market, side: sideV, note, notify: flag("--notify") ? "1" : "0", dryRun: flag("--dry") ? "1" : "0" });
  if (res.status !== 200) { console.error("Rejected", res.status, res.j.error); process.exit(1); }
  const p = res.j.pick;
  console.log(`${res.j.dryRun ? "DRY RUN (not saved)" : "POSTED"}: ${p.slot.toUpperCase()} ${p.label} — ${res.j.text} (${p.odds ?? "n/a"}, ${p.provider})${p.postedBy ? ` [posted by ${p.postedBy}]` : ""}`);
})();
