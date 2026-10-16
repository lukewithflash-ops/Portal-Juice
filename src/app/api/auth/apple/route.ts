import { NextResponse } from "next/server";
import { oauthState, providersReady, safeNext, SITE } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Sign in with Apple. Apple posts back to the callback (form_post), so the state cookie must allow a cross-site POST. */
export async function GET(req: Request) {
  if (!providersReady().apple) return NextResponse.redirect(`${SITE}/account?error=apple-off`);
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const { state } = await oauthState("apple", { next }, true);
  const q = new URLSearchParams({
    client_id: process.env.APPLE_SERVICES_ID!,
    redirect_uri: `${SITE}/api/auth/apple/callback`,
    response_type: "code",
    response_mode: "form_post",
    scope: "name email",
    state,
  });
  return NextResponse.redirect(`https://appleid.apple.com/auth/authorize?${q}`);
}
