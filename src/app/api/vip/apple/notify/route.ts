import { NextResponse } from "next/server";
import { handleNotification } from "@/lib/appleIap";

export const dynamic = "force-dynamic";

/** App Store Server Notifications v2 endpoint. Every payload is verified against Apple's root CA before use. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { signedPayload?: unknown } | null;
  if (typeof b?.signedPayload !== "string") return NextResponse.json({ error: "bad-request" }, { status: 400 });
  const r = await handleNotification(b.signedPayload);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
