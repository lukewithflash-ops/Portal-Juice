import { NextResponse } from "next/server";
import { authEnabled, clientIp, currentUser, newDeviceAccount, publicUser, rateOk, sameOrigin, startSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** A private account with no email. Add other devices with a one-time code; add email, Google or Apple later. */
export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  if (!authEnabled()) return NextResponse.json({ error: "Accounts open when the store is connected." }, { status: 503 });
  const cur = await currentUser();
  if (cur) return NextResponse.json({ user: publicUser(cur) });
  if (!(await rateOk(`device:${await clientIp()}`, 10, 3600))) return NextResponse.json({ error: "Too many new accounts from here. Try later." }, { status: 429 });
  const u = await newDeviceAccount();
  await startSession(u.id);
  return NextResponse.json({ user: publicUser(u) });
}
