import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { isOwner, isVipUid } from "@/lib/vipAccess";
import { getSlate } from "@/lib/espn";
import { sportsDate } from "@/lib/slate";
import { buildOwnerPick, DAILY_PICK_NAME, ownerPickText, type OwnerMarket, type OwnerSlot } from "@/lib/ownerPick";
import { saveOwnerPick } from "@/lib/ownerPickStore";
import { vipPush } from "@/lib/push";
import { agentAuthorized } from "@/lib/ownerAgent";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const agent = agentAuthorized(req.headers.get("x-pj-owner-agent"));
  if (!agent) {
    const u = await currentUser().catch(() => null);
    if (!isOwner(u)) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }
  const b = (await req.json().catch(() => ({}))) as Record<string, string>;
  if (agent && b.list === "1") {
    const slate = await getSlate();
    const games = slate.games.filter((x) => !b.league || x.league === b.league).map((x) => ({ id: x.id, league: x.league, start: x.start, state: x.state, away: x.away.abbr, home: x.home.abbr, awayName: x.away.name, homeName: x.home.name }));
    return NextResponse.json({ ok: true, games });
  }
  const slot = b.slot === "vip" ? "vip" : b.slot === "free" ? "free" : null;
  const market = (["spread", "total", "ml"] as const).find((m) => m === b.market) ?? null;
  if (!slot || !market) return NextResponse.json({ error: "Pick a slot and market." }, { status: 400 });
  const slate = await getSlate();
  const g = slate.games.find((x) => x.id === b.gameId && x.league === b.league);
  if (!g) return NextResponse.json({ error: "Game not on today's slate." }, { status: 400 });
  const pick = buildOwnerPick(g, slot as OwnerSlot, market as OwnerMarket, String(b.side ?? ""), String(b.note ?? ""), sportsDate());
  if (typeof pick === "string") return NextResponse.json({ error: pick }, { status: 400 });
  if (agent) pick.postedBy = "assistant for owner";
  if (b.dryRun === "1") return NextResponse.json({ ok: true, dryRun: true, pick, text: ownerPickText(pick) });
  if (agent) console.log(`[ownerpick] posted by assistant for owner: ${pick.slot} ${pick.league} ${ownerPickText(pick)}`);
  const err = await saveOwnerPick(pick);
  if (err) return NextResponse.json({ error: err }, { status: 409 });
  // Quiet: only the VIP slot, only to VIP accounts that opted into VIP drop alerts (off by default), silent.
  if (slot === "vip" && b.notify === "1") {
    await vipPush("vipdrop", isVipUid, () => ({ title: `💎 ${DAILY_PICK_NAME} is in`, body: `Today's VIP ${DAILY_PICK_NAME} is posted. Not a guarantee.`, url: "/vip", tag: `ownerpick:${pick.date}` })).catch(() => 0);
  }
  return NextResponse.json({ ok: true, pick, text: ownerPickText(pick) });
}
