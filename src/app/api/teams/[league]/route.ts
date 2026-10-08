import { NextResponse } from "next/server";
import { leagueById } from "@/lib/slate";
import { parseTeamList } from "@/lib/team";

export const revalidate = 86400;

export async function GET(_req: Request, ctx: { params: Promise<{ league: string }> }) {
  const { league } = await ctx.params;
  const known = leagueById(league);
  if (!known) return NextResponse.json({ error: "No league." }, { status: 404 });
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/${known.sport}/${known.slug}/teams?limit=200`,
    { next: { revalidate: 86400 } }
  );
  if (!res.ok) return NextResponse.json({ teams: [] }, { status: 200 });
  const teams = parseTeamList(await res.json());
  return NextResponse.json({ teams });
}
