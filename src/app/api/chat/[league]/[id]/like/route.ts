import { NextResponse } from "next/server";
import { chatEnabled, likeNote } from "@/lib/chat";
import { leagueById } from "@/lib/slate";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await ctx.params;
  if (!leagueById(league) || !/^\d+$/.test(id)) return NextResponse.json({ error: "No game." }, { status: 404 });
  if (!chatEnabled()) return NextResponse.json({ enabled: false, error: "Chat opens soon." }, { status: 503 });
  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad note." }, { status: 400 });
  }
  if (typeof body.id !== "string" || !/^[a-z0-9-]{8,40}$/i.test(body.id)) {
    return NextResponse.json({ error: "Bad note." }, { status: 400 });
  }
  try {
    const likes = await likeNote(league, id, body.id);
    return NextResponse.json({ likes });
  } catch {
    return NextResponse.json({ error: "Chat opens soon." }, { status: 503 });
  }
}
