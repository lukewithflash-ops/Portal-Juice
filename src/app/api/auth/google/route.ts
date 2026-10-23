import { NextResponse } from "next/server";
import { oauthState, takeNativeTicket, providersReady, safeNext, SITE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!providersReady().google) return NextResponse.redirect(`${SITE}/account?error=google-off`);
  const sp = new URL(req.url).searchParams;
  const ticket = sp.get("ticket");
  const native = ticket ? await takeNativeTicket("google", ticket) : null;
  if (ticket && !native) return NextResponse.redirect(`${SITE}/account?error=google-state`);
  const next = safeNext(native ? native.next : sp.get("next"));
  const extra: Record<string, string> = native ? { next, native: "1", linkUid: native.uid } : { next };
  const { state, challenge } = await oauthState("google", extra);
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${SITE}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
}
