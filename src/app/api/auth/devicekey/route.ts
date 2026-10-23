import { NextResponse } from "next/server";
import { currentUser, dropDeviceKey, mintDeviceKey, sameOrigin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Signed in: mint a device restore key for this device (replaces `old` if given). */
export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "signed-out" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { old?: unknown } | null;
  if (typeof b?.old === "string") await dropDeviceKey(b.old);
  return NextResponse.json({ key: await mintDeviceKey(u.id) }, { headers: { "Cache-Control": "no-store" } });
}

/** Sign-out: forget this device's key. */
export async function DELETE(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { key?: unknown } | null;
  await dropDeviceKey(typeof b?.key === "string" ? b.key : null);
  return NextResponse.json({ ok: true });
}
