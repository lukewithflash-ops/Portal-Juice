import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { researchPlayer } from "@/lib/research";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Item = { league: string; athleteId: string; stat: string; line: number };

const last10 = (league: string, athleteId: string, stat: string) =>
  unstable_cache(
    async () => {
      const r = await researchPlayer(league, athleteId, stat).catch(() => null);
      return r ? r.games.slice(0, 10).map((g) => ({ v: g.value, d: g.date, o: g.opp })) : null;
    },
    ["pj-last10", league, athleteId, stat],
    { revalidate: 1800 }
  )();

/** POST { items } → hit rate over the last 10 games from real ESPN game logs. */
export async function POST(req: Request) {
  let body: { items?: Item[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const items = (Array.isArray(body.items) ? body.items : []).filter((x) => x && /^\d+$/.test(String(x.athleteId)) && typeof x.stat === "string" && Number.isFinite(Number(x.line))).slice(0, 30);
  const results = await Promise.all(
    items.map(async (x) => {
      const games = await last10(String(x.league), String(x.athleteId), x.stat);
      if (!games) return null;
      const line = Number(x.line);
      return { hits: games.filter((g) => g.v > line).length, n: games.length, games };
    })
  );
  return NextResponse.json({ results }, { headers: { "cache-control": "private, max-age=300" } });
}
