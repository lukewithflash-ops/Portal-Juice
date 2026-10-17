import { NextResponse } from "next/server";
import { currentUser, rateOk, sameOrigin } from "@/lib/auth";
import { hasWidgetToken, mintWidgetToken, revokeWidgetToken } from "@/lib/widget";

export const dynamic = "force-dynamic";
const H = { "cache-control": "private, no-store" };

export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ signedIn: false }, { headers: H });
  return NextResponse.json({ signedIn: true, has: await hasWidgetToken(u.id) }, { headers: H });
}

/** Mint a new device token (replaces the old one). Shown once. */
export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await rateOk(`wtok:${u.id}`, 10, 3600))) return NextResponse.json({ error: "Slow down." }, { status: 429 });
  return NextResponse.json({ token: await mintWidgetToken(u.id) }, { headers: H });
}

export async function DELETE(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  await revokeWidgetToken(u.id);
  return NextResponse.json({ ok: true });
}
