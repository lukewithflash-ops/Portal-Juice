import { NextResponse } from "next/server";
import { runBreakdown } from "@/lib/checkRun";
import { currentUser } from "@/lib/auth";
import { vipState } from "@/lib/vipAccess";

const FREE_POINTS = 3;

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Read-only. Breaks down up to 6 legs from real ESPN numbers. */
export async function POST(req: Request) {
  let body: { legs?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const r = await runBreakdown(Array.isArray(body.legs) ? body.legs : []);
  if (!r) return NextResponse.json({ error: "Add a leg first." }, { status: 400 });
  // Free: the three heaviest reasons each way. VIP: every reason.
  const vip = (await vipState(await currentUser().catch(() => null)).catch(() => null))?.vip ?? false;
  if (!vip)
    r.reports = r.reports.map((x) =>
      x.pros.length > FREE_POINTS || x.cons.length > FREE_POINTS
        ? { ...x, pros: [...x.pros].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, FREE_POINTS), cons: [...x.cons].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, FREE_POINTS), hidden: { pros: Math.max(0, x.pros.length - FREE_POINTS), cons: Math.max(0, x.cons.length - FREE_POINTS) } }
        : x
    );
  return NextResponse.json({ ...r, vip, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
