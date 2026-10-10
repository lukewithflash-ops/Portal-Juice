import { NextResponse } from "next/server";
import { hasSubscription, muteGame } from "@/lib/push";

export const dynamic = "force-dynamic";

/** "Mute game" from a notification: no more alerts for that game on this device for two days. */
export async function POST(req: Request) {
  let body: { endpoint?: unknown; game?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (typeof body.endpoint !== "string" || typeof body.game !== "string" || !(await hasSubscription(body.endpoint))) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  return NextResponse.json({ ok: await muteGame(body.endpoint, body.game) });
}
