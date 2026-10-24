import { NextResponse } from "next/server";
import { currentUser, rateOk, sameOrigin } from "@/lib/auth";
import { redis } from "@/lib/chat";
import { award, coinsOn, markActivity } from "@/lib/coins";
import { laDay, laWeek } from "@/lib/coinsCore";
import { getScores } from "@/lib/espn";
import { areFriends, ensureProfile, getSquad, uidOf } from "@/lib/social";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store" };
/** Game Day Pick-em: pick winners of today's real games before they start. Bragging rights + coins challenge. No money, no wagering. */
const K = {
  picks: (day: string, uid: string) => `pj:pe:${day}:${uid}`,
  who: (day: string) => `pj:pe:who:${day}`,
  week: (w: string) => `pj:pe:wk:${w}`,
  fin: (day: string) => `pj:pe:fin:${day}`,
  h2h: (day: string) => `pj:pe:h2h:${day}`,
};
const PRIZES = [100, 60, 30];
const H2H_WIN = 25;
const yday = () => laDay(new Date(Date.now() - 86400_000));

async function storedFinals(day: string) {
  const raw = ((await redis(["HGETALL", K.fin(day)])) as string[] | null) ?? [];
  const m = new Map<string, "away" | "home" | null>();
  for (let i = 0; i < raw.length; i += 2) m.set(raw[i], raw[i + 1] === "tie" ? null : (raw[i + 1] as "away" | "home"));
  return m;
}
const TTL = 15 * 86400;

async function rows(day: string, finals: Map<string, "away" | "home" | null>, only?: string[]) {
  const all = ((await redis(["SMEMBERS", K.who(day)])) as string[] | null) ?? [];
  const uids = (only ? all.filter((x) => only.includes(x)) : all).slice(0, 300);
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
  return rows;
}

async function board(day: string, finals: Map<string, "away" | "home" | null>, only?: string[]) {
  const r = await rows(day, finals, only);
  if (!only) {
    await Promise.all(r.map((x) => redis(["ZADD", K.week(laWeek()), x.right, `${day}|${x.uid}|${x.handle}`])));
    await redis(["EXPIRE", K.week(laWeek()), TTL]);
  }
  return r.slice(0, 25).map(({ uid, ...x }) => ({ ...x, uidTail: uid.slice(-4) }));
}

/** Yesterday's top three (3+ graded picks, no ties broken by luck: ties share the place). */
async function prizeFor(uid: string) {
  const day = yday();
  const r = (await rows(day, await storedFinals(day))).filter((x) => x.graded >= 3);
  const me = r.find((x) => x.uid === uid);
  if (!me) return null;
  const place = new Set(r.filter((x) => x.right > me.right).map((x) => x.right)).size; // dense rank, 0-based
  return place < PRIZES.length ? { day, place: place + 1, coins: PRIZES[place], item: place === 0 ? "g-champ" : undefined } : null;
}

async function myH2h(uid: string, day: string) {
  const raw = ((await redis(["HGETALL", K.h2h(day)])) as string[] | null) ?? [];
  const out: { key: string; a: string; b: string; status: string }[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const [a, b] = raw[i].split("|");
    if (a === uid || b === uid) out.push({ key: raw[i], a, b, status: raw[i + 1] });
  }
  return out;
}

async function h2hView(uid: string, day: string) {
  const list = await myH2h(uid, day);
  if (!list.length) return [];
  const r = await rows(day, day === laDay() ? new Map() : await storedFinals(day), [...new Set(list.flatMap((x) => [x.a, x.b]))]);
  const fin = day === laDay() ? null : true;
  return Promise.all(list.map(async (x) => {
    const other = x.a === uid ? x.b : x.a;
    const me = r.find((y) => y.uid === uid), op = r.find((y) => y.uid === other);
    const oh = op?.handle ?? (await ensureProfile(other).catch(() => null))?.handle ?? "player";
    return { day, with: oh, incoming: x.b === uid && x.status === "pending", status: x.status, me: me?.right ?? 0, them: op?.right ?? 0, final: !!fin, won: !!fin && x.status === "on" && (me?.right ?? 0) > (op?.right ?? 0) && (me?.graded ?? 0) > 0 };
  }));
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

export async function GET(req: Request) {
  const squadId = new URL(req.url).searchParams.get("squad");
  const day = laDay();
  const { scores } = await getScores();
  const games = scores.filter((g) => ["nfl", "nba", "nhl", "mlb", "ncaaf", "ncaam", "wnba", "ncaaw"].includes(g.league)).slice(0, 40);
  const finals = new Map<string, "away" | "home" | null>();
  for (const g of games) if (g.state === "post") {
    const a = Number(g.awayScore), h = Number(g.homeScore);
    finals.set(g.id, a > h ? "away" : h > a ? "home" : null);
  }
  if (finals.size) {
    await redis(["HSET", K.fin(day), ...[...finals].flatMap(([k, v]) => [k, v ?? "tie"])]);
    await redis(["EXPIRE", K.fin(day), TTL]);
  }
  const u = await currentUser().catch(() => null);
  const mineRaw = u ? (((await redis(["HGETALL", K.picks(day, u.id)])) as string[] | null) ?? []) : [];
  const mine: Record<string, string> = {};
  for (let i = 0; i < mineRaw.length; i += 2) if (mineRaw[i] !== "_h") mine[mineRaw[i]] = mineRaw[i + 1];
  let only: string[] | undefined;
  let squad: { id: string; name: string } | null = null;
  if (squadId && u) {
    const sq = await getSquad(squadId).catch(() => null);
    if (sq && sq.members.includes(u.id)) { only = sq.members; squad = { id: sq.id, name: sq.name }; }
  }
  const h2h = u ? [...(await h2hView(u.id, day)), ...(await h2hView(u.id, yday()))] : [];
  const prize = u && coinsOn() ? await prizeFor(u.id) : null;
  return NextResponse.json({
    signedIn: !!u,
    squad,
    h2h,
    prize,
    prizes: PRIZES,
    day,
    games: games.map((g) => ({ id: g.id, league: g.league, state: g.state, detail: g.detail, awayAbbr: g.awayAbbr, homeAbbr: g.homeAbbr, awayScore: g.awayScore, homeScore: g.homeScore, winner: finals.get(g.id) ?? null })),
    mine,
    board: await board(day, finals, only),
    week: await weekBoard(),
  }, { headers: H });
}

export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign in to play." }, { status: 401 });
  if (!(await rateOk(`pickem:${u.id}`, 60, 60))) return NextResponse.json({ error: "Slow down a little." }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; side?: string; action?: string; handle?: string };
  if (b.action) return act(u.id, b);
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

/** Head-to-head and prize actions. Coins and cosmetics come from the house; nobody puts anything up. */
async function act(uid: string, b: { action?: string; handle?: string }) {
  const day = laDay();
  if (b.action === "prize") {
    if (!coinsOn()) return NextResponse.json({ error: "Coins are off." }, { status: 400 });
    const p = await prizeFor(uid);
    if (!p) return NextResponse.json({ error: "No prize from yesterday." }, { status: 400 });
    const r = await award(uid, p.coins, `pick-em #${p.place} ${p.day}`, `pe:prize:${p.day}:${uid}`, p.item);
    return r.ok ? NextResponse.json({ ok: true, balance: r.balance, coins: p.coins }) : NextResponse.json({ error: r.error }, { status: 400 });
  }
  const other = b.handle ? await uidOf(String(b.handle).replace(/^@/, "").slice(0, 24)) : null;
  if (!other || other === uid) return NextResponse.json({ error: "Pick a friend." }, { status: 400 });
  if (b.action === "h2h") {
    if (!(await areFriends(uid, other))) return NextResponse.json({ error: "You can only challenge friends." }, { status: 400 });
    const list = await myH2h(uid, day);
    if (list.length >= 5) return NextResponse.json({ error: "Five head-to-heads a day." }, { status: 400 });
    if (list.some((x) => x.a === other || x.b === other)) return NextResponse.json({ error: "Already set for today." }, { status: 400 });
    await redis(["HSET", K.h2h(day), `${uid}|${other}`, "pending"]);
    await redis(["EXPIRE", K.h2h(day), TTL]);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "h2h-accept" || b.action === "h2h-decline") {
    const key = `${other}|${uid}`;
    if ((await redis(["HGET", K.h2h(day), key])) !== "pending") return NextResponse.json({ error: "Nothing to answer." }, { status: 400 });
    if (b.action === "h2h-accept") await redis(["HSET", K.h2h(day), key, "on"]);
    else await redis(["HDEL", K.h2h(day), key]);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "h2h-claim") {
    if (!coinsOn()) return NextResponse.json({ error: "Coins are off." }, { status: 400 });
    const v = (await h2hView(uid, yday())).find((x) => x.won && x.with.toLowerCase() === String(b.handle).replace(/^@/, "").toLowerCase());
    if (!v) return NextResponse.json({ error: "No win to claim." }, { status: 400 });
    const r = await award(uid, H2H_WIN, `h2h win vs ${v.with}`, `pe:h2h:${yday()}:${uid}:${other}`, "g-rival");
    return r.ok ? NextResponse.json({ ok: true, balance: r.balance, coins: H2H_WIN }) : NextResponse.json({ error: r.error }, { status: 400 });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
