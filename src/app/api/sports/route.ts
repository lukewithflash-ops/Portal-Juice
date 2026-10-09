import { NextResponse } from "next/server";
import { SPORT_LEAGUES, type SportSlate } from "@/lib/sports";
import { getSportSlate } from "@/lib/sportsFetch";

export const revalidate = 15;

/** Every extra league at once. A league that fails is left out, not faked. */
export async function GET() {
  const slates = await Promise.all(SPORT_LEAGUES.map((l) => getSportSlate(l.id).catch(() => null)));
  const ok = slates.filter((s): s is SportSlate => !!s);
  return NextResponse.json(
    { fetchedAt: new Date().toISOString(), slates: ok, missing: SPORT_LEAGUES.filter((l) => !ok.some((s) => s.league.id === l.id)).map((l) => l.label) },
    { headers: { "Cache-Control": "s-maxage=15, stale-while-revalidate=30" } }
  );
}
