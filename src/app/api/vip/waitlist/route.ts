import { NextResponse } from "next/server";
import { cleanEmail, clientIp, currentUser, rateOk, sameOrigin } from "@/lib/auth";
import { joinWaitlist } from "@/lib/vipAccess";

export const dynamic = "force-dynamic";

/** "VIP opens soon": save the account (or an email) to hear when it opens. */
export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  if (!(await rateOk(`pj:vip:wait:${await clientIp()}`, 10, 3600))) return NextResponse.json({ error: "Try again later." }, { status: 429 });
  const u = await currentUser();
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = u?.email ?? cleanEmail(body.email);
  if (!u && !email) return NextResponse.json({ error: "Add an email or sign in." }, { status: 400 });
  await joinWaitlist({ uid: u?.id ?? null, email: email ?? null });
  return NextResponse.json({ ok: true });
}
