import "server-only";
import { redis } from "@/lib/chat";
import { readDoc } from "@/lib/cloud";
import { listOf } from "@/lib/syncCore";
import { getProfile, positionOf } from "@/lib/social";
import { isVipUid } from "@/lib/vipAccess";
import {
  BOXES, CHALLENGES, COIN_PACKS, DEFAULT_EQUIP, ITEMS, MAX_LIST, MIN_LIST, SLOTS, boxItems, boxOf, itemOf, LAUNCH_ENDS, laDay, laMonth, laWeek, marketFee, weekDays,
  type Item, type Look, type Rarity, type Slot,
} from "@/lib/coinsCore";

/**
 * Server-authoritative coin ledger, inventory, boxes and resale. Every balance change runs in one Lua script
 * (Upstash EVAL is atomic) and is keyed by an idempotency id, so retries never double-spend or double-credit.
 * The client never sends amounts it can mint; it only names actions.
 */

/** Feature flag: everything is dark unless PJ_COINS=1 (server env). */
export const coinsOn = () => process.env.PJ_COINS === "1";

const K = {
  bal: (u: string) => `pj:coin:bal:${u}`,
  log: (u: string) => `pj:coin:log:${u}`,
  gift: (u: string) => `pj:coin:gift:${u}`,
  once: (k: string) => `pj:coin:once:${k}`,
  inv: (u: string) => `pj:coin:inv:${u}`,
  inst: (id: string) => `pj:coin:inst:${id}`,
  eq: (u: string) => `pj:coin:eq:${u}`,
  sold: (item: string) => `pj:coin:sold:${item}`,
  mkt: (id: string) => `pj:coin:mkt:${id}`,
  mktAll: "pj:coin:mkt:all",
  loginDays: (u: string, w: string) => `pj:login:${u}:${w}`,
  act: (u: string, day: string, what: string) => `pj:act:${u}:${day}:${what}`,
  claimDays: (u: string, week: string) => `pj:coin:cdays:${u}:${week}`,
};

export type Instance = { id: string; item: string; serial: number | null; owner: string; history: { ev: string; to: string; from?: string; price?: number; ts: number }[] };
export type LogRow = { ts: number; delta: number; why: string; bal: number; note?: string; from?: string };
export type GiftNote = { from: string; note: string; coins: number; ts: number };

/** Atomic: idempotent balance change. ARGV delta (negative = spend), log json, once ttl. Returns new balance, -1 short, -2 duplicate. */
const MOVE = `
if KEYS[2] ~= '' and redis.call('EXISTS', KEYS[2]) == 1 then return -2 end
local bal = tonumber(redis.call('GET', KEYS[1]) or '0')
local d = tonumber(ARGV[1])
if bal + d < 0 then return -1 end
bal = redis.call('INCRBY', KEYS[1], d)
if KEYS[2] ~= '' then redis.call('SET', KEYS[2], '1', 'EX', tonumber(ARGV[3])) end
local row = cjson.decode(ARGV[2]); row['bal'] = bal
redis.call('LPUSH', KEYS[3], cjson.encode(row)); redis.call('LTRIM', KEYS[3], 0, 99)
return bal`;

/** Atomic limited-edition mint: next serial or 0 when sold out. */
const MINT = `
local n = redis.call('INCR', KEYS[1])
if n > tonumber(ARGV[1]) then redis.call('DECR', KEYS[1]); return 0 end
return n`;

/** Atomic escrow buy. KEYS: listing, buyerBal, sellerBal, buyerInv, inst, mktAll, buyerLog, sellerLog. ARGV: buyer, ts, buyerHandle, sellerHandle. */
const BUY = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {-3} end
local l = cjson.decode(raw)
if l['seller'] == ARGV[1] then return {-4} end
local bal = tonumber(redis.call('GET', KEYS[2]) or '0')
if bal < l['price'] then return {-1} end
local ts = tonumber(ARGV[2])
local b = redis.call('DECRBY', KEYS[2], l['price'])
local s = redis.call('INCRBY', KEYS[3], l['price'] - l['fee'])
local inst = cjson.decode(redis.call('GET', KEYS[5]))
inst['owner'] = ARGV[1]
table.insert(inst['history'], {ev='sold', from=ARGV[4], to=ARGV[3], price=l['price'], ts=ts})
redis.call('SET', KEYS[5], cjson.encode(inst))
redis.call('SADD', KEYS[4], inst['id'])
redis.call('DEL', KEYS[1]); redis.call('ZREM', KEYS[6], l['id'])
redis.call('LPUSH', KEYS[7], cjson.encode({ts=ts, delta=-l['price'], why='Bought '..l['name']..' from resale', bal=b})); redis.call('LTRIM', KEYS[7], 0, 99)
redis.call('LPUSH', KEYS[8], cjson.encode({ts=ts, delta=l['price']-l['fee'], why='Sold '..l['name']..' (fee '..l['fee']..')', bal=s})); redis.call('LTRIM', KEYS[8], 0, 99)
return {b, l['seller']}`;

async function move(uid: string, delta: number, why: string, onceKey: string | null, ttl = 400 * 86400, extra?: { note: string; from: string }): Promise<number> {
  return Number(await redis(["EVAL", MOVE, 3, K.bal(uid), onceKey ? K.once(onceKey) : "", K.log(uid), delta, JSON.stringify({ ts: Date.now(), delta, why, ...(extra ?? {}) }), ttl]));
}

const handle = async (uid: string) => (await getProfile(uid))?.handle ?? "someone";
const json = <T,>(raw: unknown): T | null => {
  try {
    return raw ? (JSON.parse(String(raw)) as T) : null;
  } catch {
    return null;
  }
};

export async function balance(uid: string) {
  return Number(await redis(["GET", K.bal(uid)])) || 0;
}

async function grant(uid: string, item: Item, ev: string): Promise<Instance | null> {
  let serial: number | null = null;
  if (item.cap) {
    serial = Number(await redis(["EVAL", MINT, 1, K.sold(item.id), item.cap]));
    if (!serial) return null;
  }
  const inst: Instance = { id: crypto.randomUUID(), item: item.id, serial, owner: uid, history: [{ ev, to: await handle(uid), ts: Date.now() }] };
  await redis(["SET", K.inst(inst.id), JSON.stringify(inst)]);
  await redis(["SADD", K.inv(uid), inst.id]);
  return inst;
}

export async function inventory(uid: string): Promise<Instance[]> {
  const ids = ((await redis(["SMEMBERS", K.inv(uid)])) as string[] | null) ?? [];
  const out = await Promise.all(ids.map(async (id) => json<Instance>(await redis(["GET", K.inst(id)]))));
  return out.filter((x): x is Instance => !!x && x.owner === uid);
}
const ownsItem = (inv: Instance[], itemId: string) => itemOf(itemId)?.price === 0 || inv.some((i) => i.item === itemId);

export async function lookOf(uid: string): Promise<Look> {
  const raw = ((await redis(["HGETALL", K.eq(uid)])) as string[] | null) ?? [];
  const out: Look = { ...DEFAULT_EQUIP };
  for (let i = 0; i < raw.length; i += 2) if ((SLOTS as readonly string[]).includes(raw[i])) out[raw[i] as Slot] = raw[i + 1] || undefined;
  return out;
}
/** Owned non-free emotes (free set is always usable). */
export async function emotesOf(uid: string): Promise<string[]> {
  return [...new Set((await inventory(uid)).map((i) => i.item).filter((id) => itemOf(id)?.kind === "emote"))];
}

/** Server-side activity marks (set by squad chat; picks and positions are read from their stores). */
export async function markActivity(uid: string, what: "chat" | "react" | "gchat" | "call" | "callhit" | "pickem" | "watch", period: "day" | "week" = "day") {
  const k = K.act(uid, period === "day" ? laDay() : laWeek(), what);
  await redis(["SET", k, "1", "EX", 9 * 86400]);
}

async function challengeDone(uid: string, id: string): Promise<boolean> {
  const day = laDay();
  switch (id) {
    case "d-pick": {
      const picks = listOf("picks", await readDoc(uid)) as { createdAt?: string }[];
      return picks.some((p) => p?.createdAt && laDay(new Date(p.createdAt)) === day);
    }
    case "d-position": {
      const p = await positionOf(uid).catch(() => null);
      return !!p && laDay(new Date(p.setAt)) === day;
    }
    case "d-chat":
    case "d-react":
      return Number(await redis(["EXISTS", K.act(uid, day, id === "d-chat" ? "chat" : "react")])) === 1;
    case "d-login":
      return true;
    case "d-watch":
      return Number(await redis(["EXISTS", K.act(uid, day, "watch")])) === 1;
    case "d-gamechat":
    case "d-call":
    case "d-callhit":
      return Number(await redis(["EXISTS", K.act(uid, day, id === "d-gamechat" ? "gchat" : id === "d-call" ? "call" : "callhit")])) === 1;
    case "d-picks3": {
      const picks = listOf("picks", await readDoc(uid)) as { createdAt?: string }[];
      return picks.filter((p) => p?.createdAt && laDay(new Date(p.createdAt)) === day).length >= 3;
    }
    case "w-login":
      return (((await redis(["SMEMBERS", K.loginDays(uid, laWeek())])) as string[] | null) ?? []).length >= 5;
    case "w-pickem":
      return Number(await redis(["EXISTS", K.act(uid, laWeek(), "pickem")])) === 1;
    case "x-launch":
      return Date.now() < LAUNCH_ENDS;
    case "m-vip":
      return isVipUid(uid).catch(() => false);
    case "w-streak":
      return (((await redis(["SMEMBERS", K.claimDays(uid, laWeek())])) as string[] | null) ?? []).length >= 5;
    case "w-squad": {
      const days = weekDays(laWeek());
      const hits = await Promise.all(days.map((d) => redis(["EXISTS", K.act(uid, d, "chat")])));
      return hits.filter((h) => Number(h) === 1).length >= 3;
    }
  }
  return false;
}

const periodKey = (c: { period: "day" | "week" | "month" }) => (c.period === "day" ? laDay() : c.period === "week" ? laWeek() : laMonth());

export async function challenges(uid: string) {
  return Promise.all(
    CHALLENGES.map(async (c) => {
      const claimed = Number(await redis(["EXISTS", K.once(`ch:${uid}:${c.id}:${periodKey(c)}`)])) === 1;
      return { ...c, claimed, done: claimed || (await challengeDone(uid, c.id)) };
    })
  );
}

export async function claim(uid: string, id: string): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  const c = CHALLENGES.find((x) => x.id === id);
  if (!c) return { ok: false, error: "Unknown challenge." };
  if (!(await challengeDone(uid, id))) return { ok: false, error: "Not done yet." };
  const r = await move(uid, c.reward, `Challenge: ${c.label}`, `ch:${uid}:${c.id}:${periodKey(c)}`, 40 * 86400);
  if (r === -2) return { ok: false, error: "Already claimed." };
  if (c.id === "m-vip" && !(await inventory(uid)).some((i) => i.item === "g-vip")) {
    const tag = itemOf("g-vip");
    if (tag) await grant(uid, tag, "vip").catch(() => null);
  }
  if (c.id === "x-launch") {
    const tag = itemOf("g-launch");
    if (tag) await grant(uid, tag, "launch-week").catch(() => null);
  }
  if (c.id === "d-login") {
    await redis(["SADD", K.loginDays(uid, laWeek()), laDay()]);
    await redis(["EXPIRE", K.loginDays(uid, laWeek()), 10 * 86400]);
  }
  if (c.period === "day") {
    await redis(["SADD", K.claimDays(uid, laWeek()), laDay()]);
    await redis(["EXPIRE", K.claimDays(uid, laWeek()), 10 * 86400]);
  }
  return { ok: true, balance: r };
}

export async function buyItem(uid: string, itemId: string, reqId: string) {
  const item = itemOf(itemId);
  if (!item || !item.price) return { ok: false as const, error: "Not in the shop." };
  const r = await move(uid, -item.price, `Shop: ${item.name}`, `buy:${uid}:${reqId}`);
  if (r === -1) return { ok: false as const, error: "Not enough coins." };
  if (r === -2) return { ok: false as const, error: "Already done." };
  const inst = await grant(uid, item, "shop");
  return { ok: true as const, balance: r, inst };
}

function roll(odds: Record<Rarity, number>): Rarity {
  const x = (crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * 100;
  let acc = 0;
  for (const r of ["legendary", "epic", "rare", "common"] as Rarity[]) {
    acc += odds[r];
    if (x < acc) return r;
  }
  return "common";
}
const pick = <T,>(a: T[]) => a[crypto.getRandomValues(new Uint32Array(1))[0] % a.length];

/** Coins only, published odds, item rolled on the server. Limited legendaries fall back to an epic when sold out (rule shown on the box). */
export async function openBox(uid: string, boxId: string, reqId: string) {
  const box = boxOf(boxId);
  if (!box) return { ok: false as const, error: "Unknown box." };
  const r = await move(uid, -box.price, `Opened ${box.name}`, `box:${uid}:${reqId}`);
  if (r === -1) return { ok: false as const, error: "Not enough coins." };
  if (r === -2) return { ok: false as const, error: "Already opened." };
  const pool = boxItems(box);
  const tier = roll(box.odds);
  let inst: Instance | null = null;
  if (tier === "legendary") {
    for (const it of pool.filter((i) => i.rarity === "legendary")) if (!inst) inst = await grant(uid, it, `box:${box.id}`);
  }
  if (!inst) inst = await grant(uid, pick(pool.filter((i) => i.rarity === (tier === "legendary" ? "epic" : tier))), `box:${box.id}`);
  return { ok: true as const, balance: r, inst, rolled: tier };
}

export async function equip(uid: string, slot: Slot, itemId: string | null) {
  if (!(SLOTS as readonly string[]).includes(slot)) return { ok: false as const, error: "Bad slot." };
  if (itemId) {
    const it = itemOf(itemId);
    if (!it || it.kind !== slot) return { ok: false as const, error: "That doesn't go there." };
    if (!ownsItem(await inventory(uid), itemId)) return { ok: false as const, error: "You don't own that." };
    await redis(["HSET", K.eq(uid), slot, itemId]);
  } else await redis(["HSET", K.eq(uid), slot, ""]);
  return { ok: true as const };
}

export type Listing = { id: string; inst: string; item: string; name: string; serial: number | null; seller: string; sellerHandle: string; price: number; fee: number; ts: number };

export async function listItem(uid: string, instId: string, price: number) {
  const p = Math.floor(Number(price));
  if (!(p >= MIN_LIST && p <= MAX_LIST)) return { ok: false as const, error: `Price ${MIN_LIST}–${MAX_LIST} coins.` };
  const inst = json<Instance>(await redis(["GET", K.inst(instId)]));
  const it = inst && itemOf(inst.item);
  if (!inst || !it || inst.owner !== uid) return { ok: false as const, error: "You don't own that." };
  if (Number(await redis(["SREM", K.inv(uid), instId])) !== 1) return { ok: false as const, error: "Already listed." };
  const eq = await lookOf(uid);
  const slot = it.kind as Slot;
  if (eq[slot] === it.id && !(await inventory(uid)).some((i) => i.item === it.id)) await redis(["HSET", K.eq(uid), slot, ""]);
  const l: Listing = { id: crypto.randomUUID(), inst: instId, item: it.id, name: it.name, serial: inst.serial, seller: uid, sellerHandle: await handle(uid), price: p, fee: marketFee(p), ts: Date.now() };
  inst.owner = `escrow:${l.id}`;
  await redis(["SET", K.inst(instId), JSON.stringify(inst)]);
  await redis(["SET", K.mkt(l.id), JSON.stringify(l)]);
  await redis(["ZADD", K.mktAll, l.ts, l.id]);
  return { ok: true as const, listing: l };
}

export async function unlist(uid: string, id: string) {
  const l = json<Listing>(await redis(["GET", K.mkt(id)]));
  if (!l || l.seller !== uid) return { ok: false as const, error: "Not your listing." };
  if (Number(await redis(["DEL", K.mkt(id)])) !== 1) return { ok: false as const, error: "Already gone." };
  await redis(["ZREM", K.mktAll, id]);
  const inst = json<Instance>(await redis(["GET", K.inst(l.inst)]));
  if (inst) {
    inst.owner = uid;
    await redis(["SET", K.inst(l.inst), JSON.stringify(inst)]);
  }
  await redis(["SADD", K.inv(uid), l.inst]);
  return { ok: true as const };
}

export async function buyListing(uid: string, id: string) {
  const l = json<Listing>(await redis(["GET", K.mkt(id)]));
  if (!l) return { ok: false as const, error: "That listing is gone." };
  const r = (await redis(["EVAL", BUY, 8, K.mkt(id), K.bal(uid), K.bal(l.seller), K.inv(uid), K.inst(l.inst), K.mktAll, K.log(uid), K.log(l.seller), uid, Date.now(), await handle(uid), l.sellerHandle])) as (number | string)[];
  const code = Number(r[0]);
  if (code === -1) return { ok: false as const, error: "Not enough coins." };
  if (code === -3) return { ok: false as const, error: "That listing is gone." };
  if (code === -4) return { ok: false as const, error: "That's your listing." };
  return { ok: true as const, balance: code };
}

export async function market(): Promise<Listing[]> {
  const ids = ((await redis(["ZREVRANGE", K.mktAll, 0, 59])) as string[] | null) ?? [];
  const ls = await Promise.all(ids.map(async (id) => json<Listing>(await redis(["GET", K.mkt(id)]))));
  return ls.filter((l): l is Listing => !!l).map((l) => ({ ...l, seller: "" }));
}

export async function supply() {
  const lim = ITEMS.filter((i) => i.cap);
  const n = await Promise.all(lim.map((i) => redis(["GET", K.sold(i.id)])));
  return Object.fromEntries(lim.map((i, k) => [i.id, { minted: Number(n[k]) || 0, cap: i.cap! }]));
}

export async function state(uid: string) {
  const [bal, inv, look, ch, log, mkt, sup, gift] = await Promise.all([balance(uid), inventory(uid), lookOf(uid), challenges(uid), redis(["LRANGE", K.log(uid), 0, 29]), market(), supply(), redis(["GET", K.gift(uid)])]);
  const ids = ((await redis(["ZREVRANGE", K.mktAll, 0, 199])) as string[] | null) ?? [];
  const mine = await Promise.all(ids.map(async (id) => json<Listing>(await redis(["GET", K.mkt(id)]))));
  return {
    balance: bal,
    inventory: inv.map((i) => ({ ...i, owner: undefined })),
    look,
    challenges: ch,
    log: ((log as string[] | null) ?? []).map((r) => json<LogRow>(r)).filter(Boolean),
    market: mkt,
    myListings: mine.filter((l): l is Listing => !!l && l.seller === uid).map((l) => ({ ...l, seller: "" })),
    supply: sup,
    boxes: BOXES,
    gift: json<GiftNote>(gift as string | null),
    packs: process.env.IAP_ENABLED === "1" ? COIN_PACKS : [],
  };
}

/** One-time credit for a verified App Store transaction. */
export async function creditPurchase(uid: string, transactionId: string, productId: string): Promise<{ ok: true; balance: number; dup: boolean } | { ok: false; error: string }> {
  const bundle = COIN_PACKS.find((p) => p.id === productId);
  if (!bundle) return { ok: false, error: "Unknown product." };
  const r = await move(uid, bundle.coins, `Bought ${bundle.name}`, `iap:${transactionId}`, 3650 * 86400);
  if (r === -2) return { ok: true, balance: await balance(uid), dup: true };
  return { ok: true, balance: r, dup: false };
}

/** Delete-account cleanup. */
export async function dropCoins(uid: string) {
  for (const l of await (async () => ((await redis(["ZREVRANGE", K.mktAll, 0, 999])) as string[] | null) ?? [])()) {
    const x = json<Listing>(await redis(["GET", K.mkt(l)]));
    if (x?.seller === uid) {
      await redis(["DEL", K.mkt(l)]);
      await redis(["ZREM", K.mktAll, l]);
    }
  }
  await redis(["DEL", K.bal(uid), K.log(uid), K.inv(uid), K.eq(uid)]);
}

/** One-time house award (prizes, head-to-head wins). Never moves coins between users. */
export async function award(uid: string, coins: number, why: string, onceKey: string, itemId?: string): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  const r = await move(uid, coins, why, onceKey, 60 * 86400);
  if (r === -2) return { ok: false, error: "Already claimed." };
  if (itemId) {
    const it = itemOf(itemId);
    if (it && !(await inventory(uid)).some((i) => i.item === itemId)) await grant(uid, it, "prize").catch(() => null);
  }
  return { ok: true, balance: r };
}

/** House gift with a note: one ledger row carrying the note, plus a one-time popup until seen. onceKey makes it single-use. */
export async function giftWithNote(uid: string, coins: number, from: string, note: string, onceKey: string): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  const n = note.trim().slice(0, 280);
  const f = from.replace(/^@/, "").slice(0, 40);
  if (!n || !f || !(coins > 0)) return { ok: false, error: "Bad gift." };
  const r = await move(uid, Math.round(coins), `Gift from @${f}`, `gift:${onceKey}`, 3650 * 86400, { note: n, from: f });
  if (r === -2) return { ok: false, error: "Already sent." };
  await redis(["SET", K.gift(uid), JSON.stringify({ from: f, note: n, coins: Math.round(coins), ts: Date.now() } satisfies GiftNote), "EX", 180 * 86400]);
  return { ok: true, balance: r };
}

/** The popup was seen: never show it again. The ledger row keeps the note. */
export async function giftSeen(uid: string): Promise<{ ok: true }> {
  await redis(["DEL", K.gift(uid)]);
  return { ok: true };
}
