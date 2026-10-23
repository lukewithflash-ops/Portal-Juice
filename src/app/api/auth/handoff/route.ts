import { NextResponse } from "next/server";
import { SITE, startSession, takeHandoff } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** iOS app: the webview trades the one-time code from app.portaljuice://auth for a session. */
export async function GET(req: Request) {
  const c = new URL(req.url).searchParams.get("code");
  const h = c ? await takeHandoff(c) : null;
  if (!h) return NextResponse.redirect(`${SITE}/account?error=handoff`);
  await startSession(h.userId);
  return NextResponse.redirect(`${SITE}${h.next}${h.next.includes("?") ? "&" : "?"}signed=1`);
}
