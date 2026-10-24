import { NextResponse } from "next/server";
import { currentUser, rateOk, sameOrigin } from "@/lib/auth";
import { redis } from "@/lib/chat";
import { coinsOn, markActivity } from "@/lib/coins";
import { laDay, laWeek } from "@/lib/coinsCore";
import { getScores } from "@/lib/espn";
import { ensureProfile } from "@/lib/social";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store" };
/** Game Day Pick-em: pick winners of today's real games before they start. Bragging rights + coins challenge. No money, no wagering. */
const K = {
  picks: (day: string, uid: string) => `pj:pe:${day}:${uid}`,
  who: (day: string) => `pj:pe:who:${day}`,
  week: (w: string) => `pj:pe:wk:${w}`,
};
const TTL = 15 * 86400;

async function board(day: string, finals: Map<string, "away" | "home" | null>) {
  const uids = (((await redis(["SMEMBERS", K.who(day)])) as string[] | null) ?? []).slice(0, 300);
  const rows = await Promise.all(uids.map(async (uid) => {
    const raw = ((await redis(["HGETALL", K.picks(day, uid)])) as string[] | null) ?? [];
    let right = 0, graded = 0, made = 0;
    for (let i = 0; i < raw.length; i += 2) {
      if (raw[i] === "_h") continue;
      made++;
      const w = finals.get(raw[i]);
      if (w === undefined) continue;
      graded++;
      if (w === raw[i + 1]) right++;
    }
    const h = raw[raw.indexOf("_h") + 1];
    return { uid, handle: raw.includes("_h") ? h : "player", right, graded, made };
  }));
  rows.sort((a, b) => b.right - a.right || a.graded - b.graded);
  await Promise.all(rows.map((r) => redis(["ZADD", K.week(laWeek()), r.right, `${day}|${r.uid}|${r.handle}`])));
  await redis(["EXPIRE", K.week(laWeek()), TTL]);
  return rows.slice(0, 25).map(({ uid, ...r }) => ({ ...r, uidTail: uid.slice(-4) }));
}

async function weekBoard() {
  const raw = ((await redis(["ZRANGE", K.week(laWeek()), 0, -1, "WITHSCORES"])) as string[] | null) ?? [];
  const tot = new Map<string, number>();
  for (let i = 0; i < raw.length; i += 2) {
    const [, , handle] = raw[i].split("|");
    tot.set(handle, (tot.get(handle) ?? 0) + Number(raw[i + 1]));
  }
  return [...tot].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([handle, right]) => ({ handle, right }));
}

export async function GET() {
  const day = laDay();
  const { scores } = await getScores();
  const games = scores.filter((g) => ["nfl", "nba", "nhl", "mlb", "ncaaf", "ncaam", "wnba", "ncaaw"].includes(g.league)).slice(0, 40);
  const finals = new Map<string, "away" | "home" | null>();
  for (const g of games) if (g.state === "post") {
    const a = Number(g.awayScore), h = Number(g.homeScore);
    finals.set(g.id, a > h ? "away" : h > a ? "home" : null);
  }
  const u = await currentUser().catch(() => null);
  const mineRaw = u ? (((await redis(["HGETALL", K.picks(day, u.id)])) as string[] | null) ?? []) : [];
  const mine: Record<string, string> = {};
  for (let i = 0; i < mineRaw.length; i += 2) if (mineRaw[i] !== "_h") mine[mineRaw[i]] = mineRaw[i + 1];
  return NextResponse.json({
    signedIn: !!u,
    day,
    games: games.map((g) => ({ id: g.id, league: g.league, state: g.state, detail: g.detail, awayAbbr: g.awayAbbr, homeAbbr: g.homeAbbr, awayScore: g.awayScore, homeScore: g.homeScore, winner: finals.get(g.id) ?? null })),
    mine,
    board: await board(day, finals),
    week: await weekBoard(),
  }, { headers: H });
}

export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign in to play." }, { status: 401 });
  if (!(await rateOk(`pickem:${u.id}`, 60, 60))) return NextResponse.json({ error: "Slow down a little." }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; side?: string };
  if (!/^\d{4,14}$/.test(String(b.id)) || (b.side !== "away" && b.side !== "home")) return NextResponse.json({ error: "Bad pick." }, { status: 400 });
  const g = (await getScores()).scores.find((x) => x.id === b.id);
  if (!g) return NextResponse.json({ error: "Not on today's slate." }, { status: 400 });
  if (g.state !== "pre") return NextResponse.json({ error: "Locked. That game already started." }, { status: 400 });
  const day = laDay();
  const prof = await ensureProfile(u.id);
  await redis(["HSET", K.picks(day, u.id), String(b.id), b.side, "_h", prof.handle]);
  await redis(["EXPIRE", K.picks(day, u.id), TTL]);
  await redis(["SADD", K.who(day), u.id]);
  await redis(["EXPIRE", K.who(day), TTL]);
  if (coinsOn()) await markActivity(u.id, "pickem", "week").catch(() => {});
  return NextResponse.json({ ok: true }, { headers: H });
}
