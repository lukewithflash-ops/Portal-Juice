import { NextResponse } from "next/server";
import { currentUser, rateOk } from "@/lib/auth";
import { friendView, positionsFor } from "@/lib/social";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store" };

/** GET ?h=handle → a friend's open picks and parlays; anyone else gets only their shared live position. */
export async function GET(req: Request) {
  const h = (new URL(req.url).searchParams.get("h") ?? "").replace(/^@/, "").slice(0, 20);
  const u = await currentUser().catch(() => null);
  if (!u) {
    const pos = (await positionsFor([h], null).catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ friend: false, handle: h, position: pos[h.toLowerCase()] ?? null }, { headers: H });
  }
  if (!(await rateOk(`fpicks:${u.id}`, 120, 600))) return NextResponse.json({ error: "Slow down a little." }, { status: 429 });
  return NextResponse.json(await friendView(u.id, h), { headers: H });
}
