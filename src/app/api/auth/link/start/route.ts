import { NextResponse } from "next/server";
import { currentUser, sameOrigin, startLink } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** One-time code to sign in another device to this account. Good for 10 minutes. */
export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ code: await startLink(u.id), expiresIn: 600 });
}
