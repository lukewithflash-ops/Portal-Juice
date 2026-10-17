import { NextResponse } from "next/server";
import { currentUser, rateOk, sameOrigin } from "@/lib/auth";
import { tail } from "@/lib/social";

export const dynamic = "force-dynamic";

/** Copy a friend's pick or parlay: returns the legs to add to your Log and counts one tail for them. */
export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await rateOk(`tail:${u.id}`, 30, 600))) return NextResponse.json({ error: "Slow down a little." }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { handle?: string; pickIds?: unknown };
  const ids = Array.isArray(b.pickIds) ? b.pickIds.filter((x): x is string => typeof x === "string").slice(0, 20) : [];
  const legs = await tail(u.id, String(b.handle ?? ""), ids);
  return legs ? NextResponse.json({ ok: true, legs }) : NextResponse.json({ error: "Not available." }, { status: 404 });
}
