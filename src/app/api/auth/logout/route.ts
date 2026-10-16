import { NextResponse } from "next/server";
import { endSession, sameOrigin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  await endSession().catch(() => {});
  return NextResponse.json({ ok: true });
}
