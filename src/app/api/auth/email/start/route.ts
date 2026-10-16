import { NextResponse } from "next/server";
import { cleanEmail, safeNext, sameOrigin, startEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; next?: unknown };
  const email = cleanEmail(body.email);
  if (!email) return NextResponse.json({ error: "Check the email address." }, { status: 400 });
  const r = await startEmail(email, safeNext(typeof body.next === "string" ? body.next : null)).catch(() => ({ error: "Couldn't send the email. Try again." }));
  return NextResponse.json(r, { status: "error" in r ? 400 : 200 });
}
