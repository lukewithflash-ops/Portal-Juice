import "server-only";
import { chatEnabled, redis } from "@/lib/chat";
import { getLive } from "@/lib/espn";
import { choosePortalPick, gradePortalPick, portalRecord, type PortalPick, type PortalRecord } from "@/lib/portalPick";
import type { Game } from "@/lib/slate";

const KEY = "pj:portalpick";

async function all(): Promise<PortalPick[]> {
  const raw = (await redis(["HGETALL", KEY])) as string[] | null;
  const out: PortalPick[] = [];
  for (let i = 1; raw && i < raw.length; i += 2) {
    try {
      out.push(JSON.parse(raw[i]) as PortalPick);
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Grade any stored pick whose game is final on ESPN. */
export async function settlePortalPicks(): Promise<number> {
  if (!chatEnabled()) return 0;
  let n = 0;
  for (const p of await all()) {
    if (p.result) continue;
    const snap = await getLive(p.league, p.gameId).catch(() => null);
    if (!snap || snap.state !== "post") continue;
    const away = snap.awayScore === null ? null : Number(snap.awayScore);
    const home = snap.homeScore === null ? null : Number(snap.homeScore);
    const result = gradePortalPick(p, away, home);
    if (!result) continue;
    const done: PortalPick = { ...p, result, final: `${p.awayAbbr} ${away} – ${p.homeAbbr} ${home}` };
    await redis(["HSET", KEY, p.date, JSON.stringify(done)]);
    n++;
  }
  return n;
}

/**
 * Today's pick (locked on first choose with HSETNX so it never changes after it is set),
 * plus the record from graded history. Without the store, today's pick still shows but is not tracked.
 */
export async function portalPickToday(games: Game[], date: string): Promise<{ pick: PortalPick | null; record: PortalRecord; tracked: boolean; history: PortalPick[] }> {
  const empty = portalRecord([]);
  if (!chatEnabled()) return { pick: choosePortalPick(games, date), record: empty, tracked: false, history: [] };
  try {
    await settlePortalPicks();
    let stored = (await redis(["HGET", KEY, date])) as string | null;
    if (!stored) {
      const fresh = choosePortalPick(games, date);
      if (fresh) {
        await redis(["HSETNX", KEY, date, JSON.stringify(fresh)]);
        stored = (await redis(["HGET", KEY, date])) as string | null;
      }
    }
    const pick = stored ? (JSON.parse(stored) as PortalPick) : null;
    const history = await all();
    return { pick, record: portalRecord(history), tracked: true, history: history.slice(0, 10) };
  } catch {
    return { pick: choosePortalPick(games, date), record: empty, tracked: false, history: [] };
  }
}
