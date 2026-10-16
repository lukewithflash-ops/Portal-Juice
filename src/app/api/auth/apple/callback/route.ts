import { NextResponse } from "next/server";
import { appleClientSecret, currentUser, jwtClaims, providersReady, resolveIdentity, SITE, startSession, takeOauthState } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const saved = await takeOauthState("apple");
  const fail = (why: string) => NextResponse.redirect(`${SITE}/account?error=${why}`, 303);
  if (!providersReady().apple || !form || !saved || form.get("state") !== saved.state) return fail("apple-state");
  const code = form.get("code");
  if (typeof code !== "string") return fail("apple-cancel");
  const res = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.APPLE_SERVICES_ID!,
      client_secret: appleClientSecret(),
      code,
      grant_type: "authorization_code",
      redirect_uri: `${SITE}/api/auth/apple/callback`,
    }),
  }).catch(() => null);
  const j = res?.ok ? ((await res.json()) as { id_token?: string }) : null;
  // id_token comes straight from Apple over TLS in the code exchange.
  const c = j?.id_token ? jwtClaims(j.id_token) : null;
  if (!c || c.aud !== process.env.APPLE_SERVICES_ID || c.iss !== "https://appleid.apple.com" || typeof c.sub !== "string") return fail("apple-token");
  // Apple sends the name once, on the first sign-in, as a form field.
  let name: string | null = null;
  try {
    const u = JSON.parse(String(form.get("user") ?? "null")) as { name?: { firstName?: string; lastName?: string } } | null;
    name = [u?.name?.firstName, u?.name?.lastName].filter(Boolean).join(" ") || null;
  } catch {
    /* no name */
  }
  const r = await resolveIdentity(
    { provider: "apple", sub: c.sub, email: typeof c.email === "string" ? c.email : null, emailVerified: c.email_verified === true || c.email_verified === "true", name },
    await currentUser()
  );
  if ("error" in r) return fail("taken");
  await startSession(r.user.id);
  const next = saved.next ?? "/account";
  return NextResponse.redirect(`${SITE}${next}${next.includes("?") ? "&" : "?"}signed=1`, 303);
}
