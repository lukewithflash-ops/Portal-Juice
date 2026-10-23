import { NextResponse } from "next/server";
import { currentUser, providersReady, publicUser, refreshSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Who is signed in on this device, and which sign-in options are ready. */
export async function GET() {
  const user = await currentUser().catch(() => null);
  if (user) await refreshSession().catch(() => {});
  return NextResponse.json({ user: publicUser(user), providers: providersReady() }, { headers: { "Cache-Control": "no-store" } });
}
