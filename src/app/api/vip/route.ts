import { NextResponse, after } from "next/server";
import { currentUser } from "@/lib/auth";
import { sportsDate } from "@/lib/slate";
import { stripeReady } from "@/lib/stripe";
import { onWaitlist, vipState } from "@/lib/vipAccess";
import { teaser, VIP_NOTE, VIP_PRICE } from "@/lib/vipCore";
import { runVip, vipDay, vipRecordAll } from "@/lib/vipStore";

export const dynamic = "force-dynamic";

function addDay(d: string): string {
  const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8) + 1));
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, "0")}${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** Today's VIP picks (full for VIP, locked teasers otherwise) and the public record. */
export async function GET() {
  const u = await currentUser();
  const access = await vipState(u);
  const today = sportsDate();
  const [a, b, rec] = await Promise.all([vipDay(today), vipDay(addDay(today)), vipRecordAll()]);
  const picks = [...a, ...b];
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
