import { NextResponse } from "next/server";
import { oauthState, providersReady, safeNext, SITE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!providersReady().google) return NextResponse.redirect(`${SITE}/account?error=google-off`);
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const { state, challenge } = await oauthState("google", { next });
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
