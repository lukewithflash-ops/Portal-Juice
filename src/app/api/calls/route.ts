import { NextResponse } from "next/server";
import { currentUser, rateOk, sameOrigin } from "@/lib/auth";
import { redis } from "@/lib/chat";
import { coinsOn, markActivity } from "@/lib/coins";
import { liveSnapAny } from "@/lib/liveAny";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store" };
type Stored = { side: "away" | "home"; away: number; home: number; ts: number; result: "open" | "hit" | "miss" | "void" };
const key = (u: string, league: string, id: string) => `pj:call:${u}:${league}:${id}`;
const ok = (league: string, id: string) => /^[a-z0-9.-]{2,24}$/.test(league) && /^\d{4,14}$/.test(id);

/** Settle an open call against the real score: the first side whose score moves. Both moving at once = void. */
async function settle(uid: string, league: string, id: string, c: Stored | null): Promise<Stored | null> {
  if (!c || c.result !== "open") return c;
  const s = await liveSnapAny(league, id);
  if (!s) return c;
  const a = Number(s.awayScore ?? 0), h = Number(s.homeScore ?? 0);
  if (a === c.away && h === c.home) return s.state === "post" ? { ...c, result: "void" } : c;
  const who = a > c.away && h > c.home ? null : a > c.away ? "away" : h > c.home ? "home" : null;
  const next: Stored = { ...c, result: who === null ? "void" : who === c.side ? "hit" : "miss" };
  await redis(["SET", key(uid, league, id), JSON.stringify(next), "EX", 86400]);
  if (next.result === "hit" && coinsOn()) await markActivity(uid, "callhit").catch(() => {});
  return next;
}

export async function GET(req: Request) {
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.json({ signedIn: false, call: null }, { headers: H });
  const q = new URL(req.url).searchParams;
  const league = q.get("league") ?? "", id = q.get("id") ?? "";
  if (!ok(league, id)) return NextResponse.json({ error: "Bad game." }, { status: 400, headers: H });
  const raw = (await redis(["GET", key(u.id, league, id)])) as string | null;
  const c = await settle(u.id, league, id, raw ? (JSON.parse(raw) as Stored) : null);
  return NextResponse.json({ call: c ? { side: c.side, result: c.result } : null }, { headers: H });
}

export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign in to make calls." }, { status: 401 });
  if (!(await rateOk(`calls:${u.id}`, 12, 60))) return NextResponse.json({ error: "Slow down a little." }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { league?: string; id?: string; side?: string };
  const league = String(b.league ?? ""), id = String(b.id ?? "");
  if (!ok(league, id) || (b.side !== "away" && b.side !== "home")) return NextResponse.json({ error: "Bad call." }, { status: 400 });
  const raw = (await redis(["GET", key(u.id, league, id)])) as string | null;
  const prev = await settle(u.id, league, id, raw ? (JSON.parse(raw) as Stored) : null);
  if (prev?.result === "open") return NextResponse.json({ error: "You already have a call open in this game." }, { status: 400 });
  const s = await liveSnapAny(league, id);
  if (!s || s.state !== "in") return NextResponse.json({ error: "Calls open while the game is live." }, { status: 400 });
  // Anti-abuse: at most 30 calls a day per account.
  const dayKey = `pj:calls-day:${u.id}:${new Date().toISOString().slice(0, 10)}`;
  const n = Number(await redis(["INCR", dayKey]));
  await redis(["EXPIRE", dayKey, 2 * 86400]);
  if (n > 30) return NextResponse.json({ error: "30 calls a day max." }, { status: 429 });
  const c: Stored = { side: b.side, away: Number(s.awayScore ?? 0), home: Number(s.homeScore ?? 0), ts: Date.now(), result: "open" };
  await redis(["SET", key(u.id, league, id), JSON.stringify(c), "EX", 86400]);
  if (coinsOn()) await markActivity(u.id, "call").catch(() => {});
  return NextResponse.json({ call: { side: c.side, result: c.result } }, { headers: H });
}
