import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { feed } from "@/lib/social";

export const dynamic = "force-dynamic";

/** Friends' and squadmates' recent picks (W/L/P/open, no stakes or prices), reactions and tail counts. */
export async function GET() {
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.json({ signedIn: false, friends: [] }, { headers: { "cache-control": "no-store" } });
  return NextResponse.json({ signedIn: true, ...(await feed(u.id)) }, { headers: { "cache-control": "no-store" } });
}
