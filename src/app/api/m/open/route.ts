import { NextResponse } from "next/server";
import { currentUser, sameOrigin } from "@/lib/auth";
import { recordOpen } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/** One open per device per day (the client only calls once a day). Signed in: counted by account. */
export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return new NextResponse(null, { status: 204 });
  const body = (await req.json().catch(() => ({}))) as { d?: string };
  const u = await currentUser().catch(() => null);
  const dev = typeof body.d === "string" && /^[a-z0-9]{12,40}$/i.test(body.d) ? `d:${body.d}` : "";
  await recordOpen(u ? `u:${u.id}` : dev).catch(() => {});
  return new NextResponse(null, { status: 204 });
}
