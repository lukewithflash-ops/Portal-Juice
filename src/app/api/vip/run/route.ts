import { NextResponse } from "next/server";
import { gameRoute } from "@/lib/gameRoute";
import { getSlate } from "@/lib/espn";
import { vipPush } from "@/lib/push";
import { isVipUid } from "@/lib/vipAccess";
import { claimDrop, lineMoved, runVip } from "@/lib/vipStore";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Cron (every 15 min): find and lock VIP picks, grade finished ones, send opt-in VIP pushes. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No." }, { status: 401 });
  // Without CRON_SECRET the 10-minute throttle still applies.
  const run = await runVip({ force: !!secret }).catch((e) => ({ ran: false, checked: 0, added: [], graded: 0, why: String(e) }));
  let drops = 0;
  const dates = [...new Set(run.added.map((p) => p.date))];
  for (const d of dates) {
    if (!(await claimDrop(d).catch(() => false))) continue;
    const n = run.added.filter((p) => p.date === d).length;
    drops += await vipPush("vipdrop", isVipUid, () => ({ title: "💎 VIP picks are in", body: `${n} new VIP pick${n === 1 ? "" : "s"} with the numbers behind each. Not a guarantee.`, url: "/vip", tag: `vipdrop:${d}` }));
  }
  let moves = 0;
  const slate = await getSlate().catch(() => null);
  const moved = new Map<string, string>();
  for (const g of slate?.games ?? []) {
    if (g.state !== "pre") continue;
    const m = await lineMoved(g).catch(() => null);
    if (m) moved.set(`${g.league}:${g.id}`, `${g.away.abbr} @ ${g.home.abbr}: ${m.text}`);
  }
  if (moved.size)
    moves = await vipPush("linemove", isVipUid, ({ games }) => {
      const hit = games.find((x) => moved.has(`${x.league}:${x.id}`));
      if (!hit) return null;
      const text = moved.get(`${hit.league}:${hit.id}`)!;
      return { title: "📈 Line moved", body: text, url: gameRoute(hit.league, hit.id), tag: `lm:${hit.league}:${hit.id}` };
    });
  return NextResponse.json({ ran: run.ran, checked: run.checked, added: run.added.length, graded: run.graded, why: "why" in run ? run.why : undefined, drops, moved: moved.size, moves });
}
