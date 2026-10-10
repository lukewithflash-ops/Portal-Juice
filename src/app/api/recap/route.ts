import { NextResponse } from "next/server";
import { buildRecap } from "@/lib/recap";
import type { Pick } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { pick?: Pick } | null;
  const p = body?.pick;
  if (!p || typeof p.subject !== "string" || !Number.isFinite(Number(p.line))) return NextResponse.json({ error: "Bad pick." }, { status: 400 });
  const pick: Pick = { ...p, subject: p.subject.slice(0, 80), market: (p.market ?? "").slice(0, 60), line: Number(p.line) };
  const r = await buildRecap(pick);
  return NextResponse.json(r, { status: "error" in r ? 200 : 200 });
}
