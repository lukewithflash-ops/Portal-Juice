import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { isOwner, isVipUid } from "@/lib/vipAccess";
import { getSlate } from "@/lib/espn";
import { sportsDate } from "@/lib/slate";
import { buildOwnerPick, DAILY_PICK_NAME, ownerPickText, type OwnerMarket, type OwnerSlot } from "@/lib/ownerPick";
import { saveOwnerPick } from "@/lib/ownerPickStore";
import { vipPush } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await currentUser().catch(() => null);
  if (!isOwner(u)) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, string>;
  const slot = b.slot === "vip" ? "vip" : b.slot === "free" ? "free" : null;
  const market = (["spread", "total", "ml"] as const).find((m) => m === b.market) ?? null;
  if (!slot || !market) return NextResponse.json({ error: "Pick a slot and market." }, { status: 400 });
  const slate = await getSlate();
  const g = slate.games.find((x) => x.id === b.gameId && x.league === b.league);
  if (!g) return NextResponse.json({ error: "Game not on today's slate." }, { status: 400 });
  const pick = buildOwnerPick(g, slot as OwnerSlot, market as OwnerMarket, String(b.side ?? ""), String(b.note ?? ""), sportsDate());
  if (typeof pick === "string") return NextResponse.json({ error: pick }, { status: 400 });
  const err = await saveOwnerPick(pick);
  if (err) return NextResponse.json({ error: err }, { status: 409 });
  // Quiet: only the VIP slot, only to VIP accounts that opted into VIP drop alerts (off by default), silent.
  if (slot === "vip" && b.notify === "1") {
    await vipPush("vipdrop", isVipUid, () => ({ title: `💎 ${DAILY_PICK_NAME} is in`, body: `Today's VIP ${DAILY_PICK_NAME} is posted. Not a guarantee.`, url: "/vip", tag: `ownerpick:${pick.date}` })).catch(() => 0);
  }
  return NextResponse.json({ ok: true, pick, text: ownerPickText(pick) });
}
