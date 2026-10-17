import { NextResponse } from "next/server";
import { currentUser, rateOk } from "@/lib/auth";
import { chatEnabled } from "@/lib/chat";
import { uidFromWidgetToken, widgetData } from "@/lib/widget";

export const dynamic = "force-dynamic";
const H = { "cache-control": "private, no-store" };

/**
 * Home-screen widget feed. Signed-in session cookie, or a device token from /api/widget/token
 * sent as "Authorization: Bearer pjw_…" (or ?t= for widget runtimes that can't set headers).
 */
export async function GET(req: Request) {
  if (!chatEnabled()) return NextResponse.json({ error: "Not available." }, { status: 503, headers: H });
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? new URL(req.url).searchParams.get("t");
  const uid = (await uidFromWidgetToken(bearer)) ?? (await currentUser().catch(() => null))?.id ?? null;
  if (!uid) return NextResponse.json({ error: "Sign in or send a widget token." }, { status: 401, headers: H });
  if (!(await rateOk(`widget:${uid}`, 120, 3600))) return NextResponse.json({ error: "Too many refreshes." }, { status: 429, headers: H });
  try {
    return NextResponse.json(await widgetData(uid), { headers: H });
  } catch {
    return NextResponse.json({ error: "Try again soon." }, { status: 502, headers: H });
  }
}
