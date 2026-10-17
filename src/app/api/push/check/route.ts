import { NextResponse, after } from "next/server";
import { runHistory } from "@/lib/historyStore";
import { checkPush } from "@/lib/push";
import { settlePortalPicks } from "@/lib/portalPickStore";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No." }, { status: 401 });
  }
  const result = await checkPush("cron");
  const settled = await settlePortalPicks().catch(() => 0);
  // Board: grade a few finished games each minute (closing lines + finals from ESPN), newest first.
  after(() => runHistory({ games: 4, backfillDays: 2, lockS: 55 }).catch(() => {}));
  return NextResponse.json({ ...result, settled });
}
