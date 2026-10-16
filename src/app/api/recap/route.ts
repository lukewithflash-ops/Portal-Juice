import { NextResponse } from "next/server";
import { buildRecap, recapKey } from "@/lib/recap";
import { chatEnabled, redis } from "@/lib/chat";
import type { Pick } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { pick?: Pick; reset?: Pick[] } | null;
  // Reset stats: drop the server copies of this device's recaps (keyed by the pick itself).
  if (Array.isArray(body?.reset)) {
    const keys = body.reset
      .filter((p) => p && typeof p.subject === "string" && Number.isFinite(Number(p.line)))
      .slice(0, 500)
      .map((p) => recapKey({ ...p, subject: p.subject.slice(0, 80), market: (p.market ?? "").slice(0, 60), line: Number(p.line) }));
    if (keys.length && chatEnabled()) await redis(["DEL", ...keys]).catch(() => null);
    return NextResponse.json({ cleared: keys.length });
  }
  const p = body?.pick;
  if (!p || typeof p.subject !== "string" || !Number.isFinite(Number(p.line))) return NextResponse.json({ error: "Bad pick." }, { status: 400 });
  const pick: Pick = { ...p, subject: p.subject.slice(0, 80), market: (p.market ?? "").slice(0, 60), line: Number(p.line) };
  const r = await buildRecap(pick);
  return NextResponse.json(r, { status: "error" in r ? 200 : 200 });
}
