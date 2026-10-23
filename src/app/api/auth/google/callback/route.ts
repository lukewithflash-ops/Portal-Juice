import { NextResponse } from "next/server";
import { getUser, nativeHandoff, currentUser, jwtClaims, providersReady, resolveIdentity, SITE, startSession, takeOauthState } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const saved = await takeOauthState("google");
  const fail = (why: string) => NextResponse.redirect(`${SITE}/account?error=${why}`);
  if (!providersReady().google || !saved || u.searchParams.get("state") !== saved.state) return fail("google-state");
  const code = u.searchParams.get("code");
  if (!code) return fail("google-cancel");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${SITE}/api/auth/google/callback`,
      grant_type: "authorization_code",
      code_verifier: saved.verifier,
    }),
  }).catch(() => null);
  const j = res?.ok ? ((await res.json()) as { id_token?: string }) : null;
  // The id_token comes straight from Google over TLS in the code exchange, so its claims can be read directly.
  const c = j?.id_token ? jwtClaims(j.id_token) : null;
  if (!c || c.aud !== process.env.GOOGLE_CLIENT_ID || !["https://accounts.google.com", "accounts.google.com"].includes(String(c.iss)) || typeof c.sub !== "string") return fail("google-token");
  const r = await resolveIdentity(
    { provider: "google", sub: c.sub, email: typeof c.email === "string" ? c.email : null, emailVerified: c.email_verified === true, name: typeof c.name === "string" ? c.name : null, image: typeof c.picture === "string" ? c.picture : null },
    saved.native ? (saved.linkUid ? await getUser(saved.linkUid) : null) : await currentUser()
  );
  if ("error" in r) return fail("taken");
  if (saved.native) return NextResponse.redirect(await nativeHandoff(r.user.id, saved.next ?? "/account"));
  await startSession(r.user.id);
  return NextResponse.redirect(`${SITE}${saved.next ?? "/account"}${(saved.next ?? "/account").includes("?") ? "&" : "?"}signed=1`);
}
