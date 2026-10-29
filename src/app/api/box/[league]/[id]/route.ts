import { NextResponse } from "next/server";
import { leagueById } from "@/lib/slate";
import { sportLeague } from "@/lib/sports";
import { parseBoxScore } from "@/lib/boxScore";

export const dynamic = "force-dynamic";

/** Full ESPN box score for one game. Real ESPN numbers only; an empty box means ESPN has none. */
export async function GET(_req: Request, ctx: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await ctx.params;
  const l = leagueById(league);
  const x = l ? null : sportLeague(league);
  const path = l ? `${l.sport}/${l.slug}` : x?.path;
  if (!path || !/^\d+$/.test(id)) return NextResponse.json({ error: "Unknown game." }, { status: 404 });
  try {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${id}`, { next: { revalidate: 8 } });
    if (!r.ok) throw new Error(String(r.status));
    const box = parseBoxScore(await r.json(), path);
    return NextResponse.json(box ?? { state: "pre", teams: [], teamStats: [] }, { headers: { "Cache-Control": "public, max-age=5, s-maxage=10, stale-while-revalidate=30", "CDN-Cache-Control": "public, s-maxage=10, stale-while-revalidate=30", "Vercel-CDN-Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" } });
  } catch {
    return NextResponse.json({ error: "ESPN box score unavailable." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
