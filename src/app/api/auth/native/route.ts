import { NextResponse } from "next/server";
import { currentUser, nativeTicket, providersReady, safeNext, sameOrigin, SITE } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** iOS app: get a one-time URL to open in the system browser for Google / Apple sign-in. */
export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "bad-origin" }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { provider?: unknown; next?: unknown } | null;
  const provider = b?.provider === "google" || b?.provider === "apple" ? b.provider : null;
  if (!provider || !providersReady()[provider]) return NextResponse.json({ error: `${provider ?? "provider"}-off` }, { status: 400 });
  const u = await currentUser();
  const t = await nativeTicket(provider, u?.id ?? null, safeNext(typeof b?.next === "string" ? b.next : null));
  return NextResponse.json({ url: `${SITE}/api/auth/${provider}?ticket=${encodeURIComponent(t)}` });
}
