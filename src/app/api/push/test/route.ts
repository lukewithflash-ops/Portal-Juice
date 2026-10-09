import { NextResponse } from "next/server";
import { sendTest } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Sends one real push to this device's saved subscription, now. */
export async function POST(req: Request) {
  let body: { endpoint?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  if (typeof body.endpoint !== "string" || !body.endpoint.startsWith("https://")) {
    return NextResponse.json({ ok: false, error: "No subscription on this device." }, { status: 400 });
  }
  const r = await sendTest(body.endpoint);
  return NextResponse.json(r, { status: r.ok ? 200 : r.stored ? 502 : 409 });
}
