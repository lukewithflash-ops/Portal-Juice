import { NextResponse } from "next/server";
import { claimLink, clientIp, getUser, publicUser, rateOk, sameOrigin, startSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  if (!(await rateOk(`claim:${await clientIp()}`, 10, 600))) return NextResponse.json({ error: "Too many tries. Wait a few minutes." }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  const id = typeof body.code === "string" ? await claimLink(body.code) : null;
  const u = id ? await getUser(id) : null;
  if (!u) return NextResponse.json({ error: "That code didn't work or ran out. Make a new one on your other device." }, { status: 400 });
  await startSession(u.id);
  return NextResponse.json({ user: publicUser(u) });
}
