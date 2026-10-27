import "server-only";
import { chatEnabled, redis } from "@/lib/chat";
import { getLive } from "@/lib/espn";
import { gradeOwnerPick, ownerRecord, type OwnerPick, type OwnerRecord, type OwnerSlot } from "@/lib/ownerPick";

const KEY = (s: OwnerSlot) => `pj:ownerpick:${s}`;

async function all(slot: OwnerSlot): Promise<OwnerPick[]> {
  const raw = (await redis(["HGETALL", KEY(slot)])) as string[] | null;
  const out: OwnerPick[] = [];
  for (let i = 1; raw && i < raw.length; i += 2) {
    try { out.push(JSON.parse(raw[i]) as OwnerPick); } catch { /* skip */ }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

async function settle(slot: OwnerSlot, picks: OwnerPick[]) {
  for (const [i, p] of picks.entries()) {
    if (p.result) continue;
    const snap = await getLive(p.league, p.gameId).catch(() => null);
    if (!snap || snap.state !== "post") continue;
    const a = snap.awayScore === null ? null : Number(snap.awayScore), h = snap.homeScore === null ? null : Number(snap.homeScore);
    const result = gradeOwnerPick(p, a, h);
    if (!result) continue;
    picks[i] = { ...p, result, final: `${p.awayAbbr} ${a} – ${p.homeAbbr} ${h}` };
    await redis(["HSET", KEY(slot), p.date, JSON.stringify(picks[i])]);
  }
}

export type OwnerSlotView = { pick: OwnerPick | null; record: OwnerRecord; history: OwnerPick[] };

export async function ownerSlot(slot: OwnerSlot, date: string): Promise<OwnerSlotView> {
  const empty = { pick: null, record: ownerRecord([]), history: [] };
  if (!chatEnabled()) return empty;
  try {
    const picks = await all(slot);
    await settle(slot, picks);
    return { pick: picks.find((p) => p.date === date) ?? null, record: ownerRecord(picks), history: picks.slice(0, 10) };
  } catch {
    return empty;
  }
}

/** Save today's pick for a slot. Replacing is allowed until the current pick's game starts. */
export async function saveOwnerPick(p: OwnerPick): Promise<string | null> {
  if (!chatEnabled()) return "Store not connected.";
  const cur = (await redis(["HGET", KEY(p.slot), p.date])) as string | null;
  if (cur) {
    const c = JSON.parse(cur) as OwnerPick;
    if (Date.parse(c.start) <= Date.now()) return "Today's pick is locked: its game already started.";
  }
  await redis(["HSET", KEY(p.slot), p.date, JSON.stringify(p)]);
  return null;
}
