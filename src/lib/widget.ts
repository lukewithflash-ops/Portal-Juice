import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { redis } from "@/lib/chat";
import { readDoc } from "@/lib/cloud";
import { getLive } from "@/lib/espn";
import type { LiveSnap } from "@/lib/live";
import { slipKeyOf } from "@/lib/motivation";
import { gameKey, groupViews, legViews } from "@/lib/myLive";
import { listOf } from "@/lib/syncCore";
import type { Pick } from "@/lib/types";

/** Device tokens for home-screen widgets: one per account, only its hash is stored. */
const K = { tok: (h: string) => `pj:wtok:${h}`, of: (u: string) => `pj:wtokof:${u}` };
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function mintWidgetToken(uid: string): Promise<string> {
  await revokeWidgetToken(uid);
  const t = "pjw_" + randomBytes(24).toString("base64url");
  await redis(["SET", K.tok(hash(t)), uid]);
  await redis(["SET", K.of(uid), hash(t)]);
  return t;
}
export async function revokeWidgetToken(uid: string): Promise<void> {
  const old = (await redis(["GET", K.of(uid)])) as string | null;
  if (old) await redis(["DEL", K.tok(old)]);
  await redis(["DEL", K.of(uid)]);
}
export async function hasWidgetToken(uid: string): Promise<boolean> {
  return Boolean(await redis(["GET", K.of(uid)]));
}
export async function uidFromWidgetToken(t: string | null): Promise<string | null> {
  if (!t || !/^pjw_[A-Za-z0-9_-]{20,64}$/.test(t)) return null;
  return ((await redis(["GET", K.tok(hash(t))])) as string | null) ?? null;
}

export type WidgetLeg = { name: string; label: string; value: string; note: string; fill: number; state: string; league: string };
export type WidgetSlip = { title: string; total: number; hit: number; missed: number; alive: number; state: string; live: boolean; legs: WidgetLeg[] };
export type WidgetData = { updatedAt: string; open: number; slips: WidgetSlip[] };

/** Compact live progress for open picks: parlays first, then singles. W/L/P/open only. */
export async function widgetData(uid: string): Promise<WidgetData> {
  const doc = await readDoc(uid);
  const cutoff = Date.now() - 7 * 86400_000;
  const picks = (listOf("picks", doc) as Pick[]).filter(
    (p) => p && p.status === "open" && p.league && p.gameId && Date.parse(p.createdAt || p.date || "") > cutoff
  );
  const games = [...new Set(picks.map((p) => `${p.league}|${p.gameId}`))].slice(0, 16);
  const snaps: Record<string, LiveSnap> = {};
  await Promise.all(
    games.map(async (g) => {
      const [league, id] = g.split("|");
      const s = await getLive(league, id).catch(() => null);
      if (s) snaps[gameKey(league, id)] = s;
    })
  );
  const used = picks.filter((p) => snaps[gameKey(p.league!, p.gameId!)]);
  const legs = legViews(used, snaps, [], slipKeyOf);
  const states = Object.fromEntries(Object.entries(snaps).map(([k, s]) => [k, s.state]));
  const slips = groupViews(legs, states)
    .filter((s) => s.rank < 2 || s.legs.some((l) => states[l.key] === "in"))
    .sort((a, b) => a.rank - b.rank || b.total - a.total)
    .slice(0, 4)
    .map((s): WidgetSlip => ({
      title: s.total > 1 ? `${s.total}-leg parlay` : s.legs[0]?.name ?? "Pick",
      total: s.total,
      hit: s.hit,
      missed: s.missed,
      alive: s.alive,
      state: s.state,
      live: s.legs.some((l) => states[l.key] === "in"),
      legs: s.legs.slice(0, 6).map((l) => ({ name: l.name, label: l.label, value: l.valueText, note: l.note, fill: Math.round(l.fill), state: l.state, league: l.league })),
    }));
  return { updatedAt: new Date().toISOString(), open: picks.length, slips };
}
