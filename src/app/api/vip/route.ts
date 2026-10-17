import { NextResponse, after } from "next/server";
import { currentUser } from "@/lib/auth";
import { sportsDate } from "@/lib/slate";
import { stripeReady } from "@/lib/stripe";
import { onWaitlist, vipState } from "@/lib/vipAccess";
import { teaser, VIP_NOTE, VIP_PRICE } from "@/lib/vipCore";
import { runVip, vipRecordAll, vipUpcoming } from "@/lib/vipStore";

export const dynamic = "force-dynamic";


/** Today's VIP picks (full for VIP, locked teasers otherwise) and the public record. */
export async function GET() {
  const u = await currentUser();
  const access = await vipState(u);
  const today = sportsDate();
  const [picks, rec] = await Promise.all([vipUpcoming(), vipRecordAll()]);
  // Keep the engine warm between crons (throttled to one run per 10 minutes).
  after(() => runVip().catch(() => {}));
  const waiting = !access.vip && (u ? await onWaitlist(u.id, u.email).catch(() => false) : false);
  return NextResponse.json(
    {
      date: today,
      access: { ...access, signedIn: !!u, stripeReady: stripeReady(), waiting },
      price: VIP_PRICE,
      note: VIP_NOTE,
      picks: access.vip ? picks : picks.map((p) => (p.result ? p : teaser(p))),
      record: rec.record,
      history: rec.history.filter((p) => p.result).slice(0, 40),
    },
    { headers: { "cache-control": "private, no-store" } }
  );
}
