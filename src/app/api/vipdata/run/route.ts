import { NextResponse } from "next/server";
import { runTeamData } from "@/lib/teamData";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Cron: pull new ESPN finals + DraftKings closing lines, recompute VIP Data. A Redis lock keeps one run at a time. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authed = !secret || req.headers.get("authorization") === `Bearer ${secret}`;
  const lg = new URL(req.url).searchParams.get("lg");
  // Unauthenticated calls are allowed but short (the lock still applies), so a manual backfill can nudge it.
  const r = await runTeamData({ budgetMs: authed ? 240_000 : 50_000, leagues: lg ? [lg] : undefined }).catch((e) => ({ ran: false, why: String(e) }));
  return NextResponse.json(r, { headers: { "cache-control": "no-store" } });
}
