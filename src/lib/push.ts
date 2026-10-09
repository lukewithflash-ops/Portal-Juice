import "server-only";
import webpush from "web-push";
import { chatEnabled, redis } from "@/lib/chat";
import { getLive } from "@/lib/espn";
import { playerByName, trackProps } from "@/lib/tracker";

export type PushProp = {
  id: string;
  league: string;
  gameId: string;
  subject: string;
  market: string;
  line: number;
  selection: "Over" | "Under" | null;
};

const SUBS = "pj:push:subs";
const TONES = "pj:push:tones";

export function vapidPublic(): string | null {
  const key = process.env.VAPID_PUBLIC_KEY?.trim();
  return key && key.length > 20 ? key : null;
}

function vapidReady(): boolean {
  return Boolean(vapidPublic() && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_PRIVATE_KEY.length > 20);
}

type Stored = { endpoint: string; sub: webpush.PushSubscription; props: PushProp[] };

function cleanProp(raw: unknown): PushProp | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as PushProp;
  if (typeof p.id !== "string" || typeof p.league !== "string" || typeof p.gameId !== "string") return null;
  if (!/^\d+$/.test(p.gameId) || typeof p.subject !== "string" || typeof p.market !== "string") return null;
  if (!Number.isFinite(p.line) || p.line <= 0) return null;
  const selection = p.selection === "Over" || p.selection === "Under" ? p.selection : null;
  return { id: p.id.slice(0, 40), league: p.league.slice(0, 12), gameId: p.gameId, subject: p.subject.slice(0, 80), market: p.market.slice(0, 40), line: p.line, selection };
}

export async function saveSubscription(sub: webpush.PushSubscription, props: unknown[]): Promise<void> {
  if (!chatEnabled()) throw new Error("no-store");
  const cleaned = props.map(cleanProp).filter((p): p is PushProp => p !== null).slice(0, 20);
  const row: Stored = { endpoint: sub.endpoint, sub, props: cleaned };
  await redis(["HSET", SUBS, sub.endpoint, JSON.stringify(row)]);
}

/** Compare stored lines to the live box. No-op until Redis and VAPID keys exist. */
export async function checkPush(): Promise<{ enabled: boolean; sent: number }> {
  if (!chatEnabled() || !vapidReady()) return { enabled: false, sent: 0 };
  webpush.setVapidDetails(
    "mailto:juice@portaljuice.app",
    vapidPublic() as string,
    process.env.VAPID_PRIVATE_KEY as string
  );
  const flat = (await redis(["HGETALL", SUBS])) as string[] | null;
  if (!Array.isArray(flat)) return { enabled: true, sent: 0 };
  let sent = 0;
  const snaps = new Map<string, Awaited<ReturnType<typeof getLive>>>();
  for (let i = 0; i < flat.length; i += 2) {
    const endpoint = String(flat[i]);
    let row: Stored;
    try {
      row = JSON.parse(String(flat[i + 1])) as Stored;
    } catch {
      continue;
    }
    for (const prop of row.props ?? []) {
      const key = `${endpoint.slice(-24)}:${prop.id}`;
      const cacheKey = `${prop.league}:${prop.gameId}`;
      if (!snaps.has(cacheKey)) snaps.set(cacheKey, await getLive(prop.league, prop.gameId));
      const snap = snaps.get(cacheKey);
      if (!snap) continue;
      const player = playerByName(snap.boxes, prop.subject);
      if (!player || !prop.market) continue;
      const tracked = trackProps(
        [{ athleteId: player.id, name: prop.subject, team: "", headshot: null, market: prop.market, line: String(prop.line) }],
        snap,
        prop.league
      )[0];
      if (!tracked || tracked.value === null) continue;
      const tone = tracked.tone;
      const prev = await redis(["HGET", TONES, key]);
      if (prev == null || prev === "") {
        await redis(["HSET", TONES, key, tone]);
        continue;
      }
      if (prev === tone || tone === "flat") continue;
      const title = tone === "gold" ? "Line cleared" : tone === "green" ? "On pace" : "Behind the line";
      const body = `${prop.subject} ${tracked.value} / ${prop.line} ${prop.market}.`;
      try {
        await webpush.sendNotification(
          row.sub,
          JSON.stringify({ title, body, url: `/games/${prop.league}/${prop.gameId}` })
        );
        sent += 1;
        await redis(["HSET", TONES, key, tone]);
      } catch {
        /* drop a dead endpoint on the next failure */
      }
    }
  }
  return { enabled: true, sent };
}
