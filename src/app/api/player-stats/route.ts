import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { researchPlayer } from "@/lib/research";
import { statFromMarket } from "@/lib/breakdown";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const load = (league: string, id: string, stat: string, before: string) =>
  unstable_cache(
    async () => {
      const r = await researchPlayer(league, id, stat, before || undefined).catch(() => null);
      if (!r || !r.games.length) return null;
      const g = r.games;
      const avg = Math.round((g.reduce((s, x) => s + x.value, 0) / g.length) * 10) / 10;
      return { avg, n: g.length, last5: g.slice(0, 5).map((x) => ({ v: x.value, opp: x.opp, home: x.home, date: x.date.slice(0, 10) })) };
    },
    ["pj-player-stats", league, id, stat, before.slice(0, 10)],
    { revalidate: 3600 }
  )();

/** GET ?league&athleteId&market&before → this season's average and last 5 for the leg's stat, from ESPN's game log. Null when ESPN has none. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const league = String(q.get("league") || "").slice(0, 24);
  const id = String(q.get("athleteId") || "");
  const market = String(q.get("market") || "").slice(0, 80);
  if (!/^\d+$/.test(id) || !league) return NextResponse.json({ log: null }, { status: 400 });
  const stat = statFromMarket(league, market);
  if (!stat) return NextResponse.json({ log: null });
  const log = await load(league, id, stat, String(q.get("before") || "")).catch(() => null);
  return NextResponse.json({ log }, { headers: { "cache-control": "private, max-age=600" } });
}
