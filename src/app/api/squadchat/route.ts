import { NextResponse } from "next/server";
import { currentUser, sameOrigin } from "@/lib/auth";
import { coinsOn } from "@/lib/coins";
import { messages, react, send, unread } from "@/lib/squadChat";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store" };
const off = () => NextResponse.json({ enabled: false }, { status: 404, headers: H });

/** GET → squads with unread; GET ?sq=id → that squad's messages (marks read). Behind PJ_COINS. */
export async function GET(req: Request) {
  if (!coinsOn()) return off();
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.json({ signedIn: false }, { headers: H });
  const sq = new URL(req.url).searchParams.get("sq");
  if (!sq) return NextResponse.json({ enabled: true, squads: await unread(u.id) }, { headers: H });
  const r = await messages(u.id, sq);
  if (!r) return NextResponse.json({ error: "Not in that squad." }, { status: 403, headers: H });
  return NextResponse.json({ enabled: true, ...r }, { headers: H });
}

export async function POST(req: Request) {
  if (!coinsOn()) return off();
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign in to chat." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { sq?: string; text?: string; pos?: unknown; react?: { id: string; emote: string } };
  const sq = String(b.sq ?? "");
  if (b.react) {
    const r = await react(u.id, sq, String(b.react.id), String(b.react.emote));
    return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: H });
  }
  const r = await send(u.id, sq, b.text, b.pos);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status, headers: H });
  return NextResponse.json({ ok: true }, { headers: H });
}
