import { NextResponse, after } from "next/server";
import { currentUser, sameOrigin } from "@/lib/auth";
import { chatEnabled } from "@/lib/chat";
import { blockAuthor, list, post, react, report, syncSystem, validRoom } from "@/lib/gameChat";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store" };
type Ctx = { params: Promise<{ league: string; id: string }> };

/** Live game chat: anyone can read; posting needs an account (a private one is fine). */
export async function GET(_req: Request, ctx: Ctx) {
  const { league, id } = await ctx.params;
  const room = validRoom(league, id);
  if (!room) return NextResponse.json({ error: "No game." }, { status: 404, headers: H });
  if (!chatEnabled()) return NextResponse.json({ enabled: false, msgs: [] }, { headers: H });
  const u = await currentUser().catch(() => null);
  after(() => syncSystem(league.toLowerCase(), id, room).catch(() => {}));
  const r = await list(room, u?.id ?? null);
  return NextResponse.json({ enabled: true, signedIn: Boolean(u), ...r }, { headers: H });
}

export async function POST(req: Request, ctx: Ctx) {
  const { league, id } = await ctx.params;
  const room = validRoom(league, id);
  if (!room) return NextResponse.json({ error: "No game." }, { status: 404, headers: H });
  if (!chatEnabled()) return NextResponse.json({ error: "Chat opens soon." }, { status: 503, headers: H });
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403, headers: H });
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Join to chat.", join: true }, { status: 401, headers: H });
  const b = (await req.json().catch(() => ({}))) as { text?: unknown; pick?: unknown; react?: { id?: unknown; emote?: unknown }; report?: { id?: unknown; reason?: unknown }; block?: { id?: unknown } };
  if (b.react) {
    const r = await react(room, u.id, String(b.react.id ?? ""), String(b.react.emote ?? ""));
    return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: H });
  }
  if (b.report) {
    const r = await report(room, u.id, String(b.report.id ?? ""), String(b.report.reason ?? "other"));
    return NextResponse.json(r, { status: r.ok ? 200 : 404, headers: H });
  }
  if (b.block) {
    const r = await blockAuthor(room, u.id, String(b.block.id ?? ""));
    return NextResponse.json(r, { status: r.ok ? 200 : 404, headers: H });
  }
  const r = await post(room, u.id, b);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status, headers: H });
  return NextResponse.json(r, { headers: H });
}
