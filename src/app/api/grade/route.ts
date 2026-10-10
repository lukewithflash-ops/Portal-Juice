import { NextResponse } from "next/server";
import { getLive } from "@/lib/espn";
import { gradePick } from "@/lib/grade";
import type { Pick } from "@/lib/types";

export const dynamic = "force-dynamic";

/** POST { picks } → { grades: { [id]: "win"|"loss"|"push" } } for picks whose game is final. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { picks?: Pick[] } | null;
  const picks = (body?.picks ?? []).filter((p) => p && p.status === "open" && p.league && p.gameId && /^\d+$/.test(p.gameId)).slice(0, 60);
  const games = new Map<string, ReturnType<typeof getLive>>();
  for (const p of picks) {
    const k = `${p.league}:${p.gameId}`;
    if (!games.has(k)) games.set(k, getLive(p.league!, p.gameId!).catch(() => null));
  }
  const grades: Record<string, string> = {};
  for (const p of picks) {
    const snap = await games.get(`${p.league}:${p.gameId}`)!;
    const g = gradePick(p, snap);
    if (g) grades[p.id] = g;
  }
  return NextResponse.json({ grades });
}
