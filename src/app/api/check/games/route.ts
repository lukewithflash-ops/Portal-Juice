import { NextResponse } from "next/server";
import { getSlateFor } from "@/lib/espn";
import { sportsDate } from "@/lib/slate";

export const dynamic = "force-dynamic";

function addDays(day: string, n: number): string {
  const d = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)) + n));
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Today plus the next three days (covers an NFL Sunday from Thursday), so there is always something to check. */
export async function GET() {
  const today = sportsDate();
  const days = [today, addDays(today, 1), addDays(today, 2), addDays(today, 3)];
  const slates = await Promise.all(days.map((d) => getSlateFor(d)));
  const games = slates.flatMap((s) =>
    s.games.map((g) => ({
      id: g.id,
      league: g.league,
      leagueLabel: g.leagueLabel,
      start: g.start,
      state: g.state,
      detail: g.detail,
      day: s.dayLabel,
      away: { abbr: g.away.abbr, name: g.away.name, logo: g.away.logo },
      home: { abbr: g.home.abbr, name: g.home.name, logo: g.home.logo },
      price: g.price,
    }))
  );
  return NextResponse.json({ games }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" } });
}
