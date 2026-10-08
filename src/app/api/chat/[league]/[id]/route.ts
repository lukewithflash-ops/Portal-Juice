import { NextResponse } from "next/server";
import { chatEnabled, cleanHandle, cleanText, listNotes, postNote } from "@/lib/chat";
import { leagueById } from "@/lib/slate";

export const dynamic = "force-dynamic";

function okGame(league: string, id: string) {
  return Boolean(leagueById(league) && /^\d+$/.test(id));
}

export async function GET(_req: Request, ctx: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await ctx.params;
  if (!okGame(league, id)) return NextResponse.json({ error: "No game." }, { status: 404 });
  if (!chatEnabled()) return NextResponse.json({ enabled: false, messages: [] });
  try {
    const messages = await listNotes(league, id);
    return NextResponse.json({ enabled: true, messages });
  } catch {
    return NextResponse.json({ enabled: false, messages: [], error: "Chat opens soon." });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await ctx.params;
  if (!okGame(league, id)) return NextResponse.json({ error: "No game." }, { status: 404 });
  if (!chatEnabled()) return NextResponse.json({ enabled: false, error: "Chat opens soon." }, { status: 503 });
  let body: { handle?: unknown; text?: unknown; parentId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad note." }, { status: 400 });
  }
  const handle = cleanHandle(body.handle);
  const text = cleanText(body.text);
  if (!handle) return NextResponse.json({ error: "Handle is 2–16 letters or numbers." }, { status: 400 });
  if (!text.ok) return NextResponse.json({ error: text.error }, { status: 400 });
  const parentId = typeof body.parentId === "string" && /^[a-z0-9-]{8,40}$/i.test(body.parentId) ? body.parentId : null;
  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0]!.trim().slice(0, 64);
  const rateKey = `pj:rl:${league}:${id}:${ip}:${handle.toLowerCase()}`;
  try {
    const saved = await postNote(
      league,
      id,
      { id: crypto.randomUUID(), handle, text: text.text, ts: Date.now(), parentId },
      rateKey
    );
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ enabled: false, error: "Chat opens soon." }, { status: 503 });
  }
}
