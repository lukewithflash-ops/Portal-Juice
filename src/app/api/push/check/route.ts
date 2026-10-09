import { NextResponse } from "next/server";
import { checkPush, runOnceAlert } from "@/lib/push";
import { settlePortalPicks } from "@/lib/portalPickStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No." }, { status: 401 });
  }
  const result = await checkPush("cron");
  await runOnceAlert().catch(() => null);
  const settled = await settlePortalPicks().catch(() => 0);
  return NextResponse.json({ ...result, settled });
}
