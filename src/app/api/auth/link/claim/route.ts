import { NextResponse } from "next/server";
import { claimLink, clientIp, currentUser, endSession, getUser, publicUser, rateOk, sameOrigin, startSession } from "@/lib/auth";
import { mergeAccounts } from "@/lib/accountMerge";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Join an account with a one-time code. If this device was signed in to another account, it is merged in. */
export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  if (!(await rateOk(`claim:${await clientIp()}`, 10, 600))) return NextResponse.json({ error: "Too many tries. Wait a few minutes." }, { status: 429 });
  if (!(await rateOk("claim:all", 600, 600))) return NextResponse.json({ error: "Busy. Try again in a few minutes." }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  const id = typeof body.code === "string" ? await claimLink(body.code) : null;
  const u = id ? await getUser(id) : null;
  if (!u) return NextResponse.json({ error: "That code didn't work or ran out. Make a new one on your other device." }, { status: 400 });
  const cur = await currentUser();
  let moved = null;
  if (cur && cur.id !== u.id) {
    moved = (await mergeAccounts(cur.id, u.id).catch((e) => (console.log(JSON.stringify({ event: "merge.error", error: String(e).slice(0, 200) })), null)))?.moved ?? null;
    await endSession().catch(() => {});
  }
  await startSession(u.id);
  return NextResponse.json({ user: publicUser(u), merged: !!cur && cur.id !== u.id, moved });
}
