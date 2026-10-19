import { NextResponse } from "next/server";
import { getLive } from "@/lib/espn";
import { gradePick } from "@/lib/grade";
import { gradeRacePick, isRacing, raceSession, type RaceEvent } from "@/lib/racing";
import { getSeason } from "@/lib/racingFetch";
import type { Pick } from "@/lib/types";

export const dynamic = "force-dynamic";

/** POST { picks } → { grades: { [id]: "win"|"loss"|"push" } } for picks whose game is final. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { picks?: Pick[] } | null;
  const picks = (body?.picks ?? []).filter((p) => p && p.status === "open" && p.league && p.gameId && /^\d+$/.test(p.gameId)).slice(0, 60);
  const games = new Map<string, ReturnType<typeof getLive>>();
  const seasons = new Map<string, Promise<RaceEvent[]>>();
  const year = new Date().getUTCFullYear();
  for (const p of picks) {
    if (isRacing(p.league)) {
      for (const y of [year, year - 1]) {
        const k = `${p.league}:${y}`;
        if (!seasons.has(k)) seasons.set(k, getSeason(p.league!, y).catch(() => []));
      }
      continue;
    }
    const k = `${p.league}:${p.gameId}`;
    if (!games.has(k)) games.set(k, getLive(p.league!, p.gameId!).catch(() => null));
  }
  const grades: Record<string, string> = {};
  for (const p of picks) {
    if (isRacing(p.league)) {
      // Racing: graded from ESPN's final race order (winner, top N, head to head).
      const evs = [...(await seasons.get(`${p.league}:${year}`)!), ...(await seasons.get(`${p.league}:${year - 1}`)!)];
      const ev = evs.find((e) => e.id === p.gameId);
      const g = ev ? gradeRacePick(p, raceSession(ev)) : null;
      if (g) grades[p.id] = g;
      continue;
    }
    const snap = await games.get(`${p.league}:${p.gameId}`)!;
    const g = gradePick(p, snap);
    if (g) grades[p.id] = g;
  }
  return NextResponse.json({ grades });
}
