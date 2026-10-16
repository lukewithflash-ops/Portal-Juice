import { NextResponse } from "next/server";
import { cleanEmail, clientIp, currentUser, publicUser, rateOk, resolveIdentity, sameOrigin, startSession, verifyEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Finish email sign-in with the 6-digit code or the link token. POST only, so mail scanners can't use the link. */
export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; code?: unknown; link?: unknown };
  const email = cleanEmail(body.email);
  if (!email) return NextResponse.json({ error: "Check the email address." }, { status: 400 });
  if (!(await rateOk(`verify:${await clientIp()}`, 30, 3600))) return NextResponse.json({ error: "Too many tries. Wait a bit." }, { status: 429 });
  const ok = await verifyEmail(email, { code: typeof body.code === "string" ? body.code.trim() : undefined, link: typeof body.link === "string" ? body.link : undefined });
  if (!ok) return NextResponse.json({ error: "That code didn't work. Check it or send a new one." }, { status: 400 });
  const r = await resolveIdentity({ provider: "email", email, emailVerified: true }, await currentUser());
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 409 });
  await startSession(r.user.id);
  return NextResponse.json({ user: publicUser(r.user) });
}
