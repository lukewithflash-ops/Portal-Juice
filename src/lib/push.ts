import "server-only";
import webpush from "web-push";
import { gameEvents, legEvents, readAlertPrefs, type AlertPrefs, type GameAlert } from "@/lib/alerts";
import { chatEnabled, redis } from "@/lib/chat";
import { getLive, getScores } from "@/lib/espn";
import type { LiveSnap } from "@/lib/live";
import { legFromPick, type Leg } from "@/lib/motivation";
import type { Pick as LogPick } from "@/lib/types";

export type PushProp = {
  id: string;
  league: string;
  gameId: string;
  subject: string;
  market: string;
  line: number;
  selection: "Over" | "Under" | null;
};

type PushGame = { league: string; id: string };
type PushTeam = { league: string; abbr: string; id: string };

const SUBS = "pj:push:subs";
const GAMES = "pj:push:games";
const LEGS = "pj:push:legs";
const LEAGUES = new Set(["nfl", "nba", "mlb", "nhl", "ncaaf"]);

export function vapidPublic(): string | null {
  const key = process.env.VAPID_PUBLIC_KEY?.trim();
  return key && key.length > 20 ? key : null;
}

function vapidReady(): boolean {
  return Boolean(vapidPublic() && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_PRIVATE_KEY.length > 20);
}

type Stored = {
  endpoint: string;
  sub: webpush.PushSubscription;
  props: PushProp[];
  games?: PushGame[];
  team?: PushTeam | null;
  prefs?: AlertPrefs;
};

function cleanProp(raw: unknown): PushProp | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as PushProp;
  if (typeof p.id !== "string" || typeof p.league !== "string" || typeof p.gameId !== "string") return null;
  if (!/^\d+$/.test(p.gameId) || typeof p.subject !== "string" || typeof p.market !== "string") return null;
  if (!Number.isFinite(p.line) || p.line <= 0) return null;
  const selection = p.selection === "Over" || p.selection === "Under" ? p.selection : null;
  return { id: p.id.slice(0, 40), league: p.league.slice(0, 12), gameId: p.gameId, subject: p.subject.slice(0, 80), market: p.market.slice(0, 40), line: p.line, selection };
}

function cleanGame(raw: unknown): PushGame | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as PushGame;
  if (typeof g.league !== "string" || !LEAGUES.has(g.league) || typeof g.id !== "string" || !/^\d+$/.test(g.id)) return null;
  return { league: g.league, id: g.id };
}

function cleanTeam(raw: unknown): PushTeam | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as PushTeam;
  if (typeof t.league !== "string" || !LEAGUES.has(t.league) || typeof t.abbr !== "string" || !/^[A-Za-z0-9]{1,6}$/.test(t.abbr)) return null;
  return { league: t.league, abbr: t.abbr.toUpperCase(), id: typeof t.id === "string" ? t.id.slice(0, 12) : "" };
}

export async function saveSubscription(
  sub: webpush.PushSubscription,
  props: unknown[],
  extra: { games?: unknown; team?: unknown; prefs?: unknown } = {}
): Promise<void> {
  if (!chatEnabled()) throw new Error("no-store");
  const cleaned = props.map(cleanProp).filter((p): p is PushProp => p !== null).slice(0, 20);
  const games = (Array.isArray(extra.games) ? extra.games : []).map(cleanGame).filter((g): g is PushGame => g !== null).slice(0, 30);
  const row: Stored = { endpoint: sub.endpoint, sub, props: cleaned, games, team: cleanTeam(extra.team), prefs: readAlertPrefs(extra.prefs) };
  await redis(["HSET", SUBS, sub.endpoint, JSON.stringify(row)]);
}

/** Slim copy of a game kept between cron runs so the next run can tell what changed. */
type SlimGame = Pick<LiveSnap, "state" | "awayScore" | "homeScore" | "awayAbbr" | "homeAbbr" | "detail"> & { playIds: string[] };

function slim(s: LiveSnap): SlimGame {
  return { state: s.state, awayScore: s.awayScore, homeScore: s.homeScore, awayAbbr: s.awayAbbr, homeAbbr: s.homeAbbr, detail: s.detail, playIds: s.plays.map((p) => p.id) };
}

function unslim(g: SlimGame): LiveSnap {
  return { ...g, plays: g.playIds.map((id) => ({ id })) } as unknown as LiveSnap;
}

function asPick(p: PushProp): LogPick {
  return {
    id: p.id, sport: "NBA", subject: p.subject, line: p.line, odds: 0, stake: 0, book: "", date: "", status: "open",
    createdAt: "", league: p.league, gameId: p.gameId, market: p.market, selection: p.selection, slipId: "push",
  };
}

/**
 * Cron: compare each tracked game and leg to the last run and push what changed.
 * Same events and wording as the in-app updates. No-op until Redis and VAPID keys exist.
 */
export async function checkPush(): Promise<{ enabled: boolean; subs: number; games: number; sent: number }> {
  if (!chatEnabled() || !vapidReady()) return { enabled: false, subs: 0, games: 0, sent: 0 };
  webpush.setVapidDetails("mailto:juice@portaljuice.app", vapidPublic() as string, process.env.VAPID_PRIVATE_KEY as string);
  const flat = (await redis(["HGETALL", SUBS])) as string[] | null;
  if (!Array.isArray(flat) || !flat.length) return { enabled: true, subs: 0, games: 0, sent: 0 };
  const rows: Stored[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    try {
      rows.push(JSON.parse(String(flat[i + 1])) as Stored);
    } catch {
      /* skip a bad row */
    }
  }

  const board = rows.some((r) => r.team) ? (await getScores().catch(() => ({ scores: [] }))).scores : [];
  const favGame = (t: PushTeam | null | undefined): PushGame | null => {
    if (!t) return null;
    const r = board.find((x) => x.league === t.league && (x.awayAbbr === t.abbr || x.homeAbbr === t.abbr || (t.id && (x.awayId === t.id || x.homeId === t.id))));
    return r && r.state !== "pre" ? { league: r.league, id: r.id } : null;
  };

  // Every game anyone tracks, read once.
  const wanted = new Map<string, PushGame>();
  const gamesFor = rows.map((r) => {
    const list: PushGame[] = [];
    const add = (g: PushGame | null) => {
      if (!g) return;
      const k = `${g.league}/${g.id}`;
      if (!list.some((x) => `${x.league}/${x.id}` === k)) list.push(g);
      wanted.set(k, g);
    };
    for (const p of r.props ?? []) add({ league: p.league, id: p.gameId });
    for (const g of r.games ?? []) add(g);
    add(favGame(r.team));
    return list;
  });

  const snaps = new Map<string, LiveSnap | null>();
  const events = new Map<string, GameAlert[]>();
  await Promise.all(
    [...wanted.entries()].map(async ([k, g]) => {
      const snap = await getLive(g.league, g.id).catch(() => null);
      snaps.set(k, snap);
      if (!snap) return;
      const before = (await redis(["HGET", GAMES, k])) as string | null;
      let prev: LiveSnap | null = null;
      try {
        prev = before ? unslim(JSON.parse(before) as SlimGame) : null;
      } catch {
        prev = null;
      }
      events.set(k, gameEvents(g.league, g.id, prev, snap));
      await redis(["HSET", GAMES, k, JSON.stringify(slim(snap))]);
    })
  );

  let sent = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const prefs = readAlertPrefs(row.prefs);
    const tail = row.endpoint.slice(-24);
    const out: GameAlert[] = [];
    for (const g of gamesFor[i]) out.push(...(events.get(`${g.league}/${g.id}`) ?? []));
    for (const p of row.props ?? []) {
      const snap = snaps.get(`${p.league}/${p.gameId}`);
      if (!snap) continue;
      const key = `${tail}:${p.id}`;
      const raw = (await redis(["HGET", LEGS, key])) as string | null;
      let prevLeg: Leg | null = null;
      try {
        prevLeg = raw ? (JSON.parse(raw) as Leg) : null;
      } catch {
        prevLeg = null;
      }
      const leg = legFromPick(asPick(p), snap, prevLeg?.value ?? null);
      if (!leg) continue;
      out.push(...legEvents(prevLeg, leg));
      await redis(["HSET", LEGS, key, JSON.stringify({ status: leg.status, value: leg.value, line: leg.line })]);
    }
    for (const a of out) {
      if (!prefs[a.kind]) continue;
      const once = await redis(["SET", `pj:push:sent:${tail}:${a.key}`, "1", "EX", 172800, "NX"]);
      if (once !== "OK") continue;
      try {
        await webpush.sendNotification(row.sub, JSON.stringify({ title: a.title, body: a.body, url: a.url, tag: a.key }));
        sent += 1;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await redis(["HDEL", SUBS, row.endpoint]);
          break;
        }
      }
    }
  }
  return { enabled: true, subs: rows.length, games: wanted.size, sent };
}
