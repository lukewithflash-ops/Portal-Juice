import { NextResponse } from "next/server";
import { chatEnabled } from "@/lib/chat";
import { saveSubscription, vapidPublic } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!chatEnabled() || !vapidPublic()) {
    return NextResponse.json({ enabled: false, error: "Push opens when the store is connected." }, { status: 503 });
  }
  let body: { sub?: { endpoint?: string }; props?: unknown[]; games?: unknown; team?: unknown; prefs?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad subscription." }, { status: 400 });
  }
  const endpoint = body.sub?.endpoint;
  if (!body.sub || typeof endpoint !== "string" || !endpoint.startsWith("https://")) {
    return NextResponse.json({ error: "Bad subscription." }, { status: 400 });
  }
  try {
    await saveSubscription(body.sub as Parameters<typeof saveSubscription>[0], Array.isArray(body.props) ? body.props : [], {
      games: body.games,
      team: body.team,
      prefs: body.prefs,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ enabled: false, error: "Push opens when the store is connected." }, { status: 503 });
  }
}
