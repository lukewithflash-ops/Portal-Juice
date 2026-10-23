import { NextResponse } from "next/server";
import { clientIp, currentUser, publicUser, rateOk, restoreWithDeviceKey, sameOrigin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** iOS app launch with no cookie: trade the stored device key for a session. Never creates an account. */
export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const cur = await currentUser().catch(() => null);
  if (cur) return NextResponse.json({ user: publicUser(cur) });
  if (!(await rateOk(`restore:${await clientIp()}`, 30, 3600))) return NextResponse.json({ error: "Too many tries." }, { status: 429 });
  const b = (await req.json().catch(() => null)) as { key?: unknown } | null;
  const r = await restoreWithDeviceKey(typeof b?.key === "string" ? b.key : "");
  if (!r) return NextResponse.json({ error: "unknown-key" }, { status: 404 });
  return NextResponse.json({ user: publicUser(r.user), key: r.key }, { headers: { "Cache-Control": "no-store" } });
}
