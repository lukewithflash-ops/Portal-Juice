import "server-only";
import { getLive } from "@/lib/espn";
import { markSystem, postSystem, redis, seenSystem } from "@/lib/chat";
import { emoteOf } from "@/lib/emotes";
import type { LivePlay, LiveSnap } from "@/lib/live";
import { sportLeague } from "@/lib/sports";

/** A play worth a line in the game thread: scores that matter, not every bucket. */
export function bigPlay(league: string, p: LivePlay): string | null {
  const kind = emoteOf(league, p);
  const soccer = sportLeague(league)?.kind === "soccer";
  if (league === "nfl" || league === "ncaaf") {
    if (kind === "td") return "🏈 Touchdown";
    if (kind === "fg") return "🥅 Field goal";
    if (p.scoring && /safety/i.test(p.text)) return "🛡️ Safety";
    return null;
  }
  if (league === "nhl") return kind === "goal" ? "🚨 Goal" : null;
  if (league === "mlb") return kind === "hr" ? "💥 Home run" : p.scoring ? "⚾ Run scores" : null;
  if (soccer) return p.scoring || /goal/i.test(p.typeText) && !/kick|attempt|saved|miss/i.test(p.typeText) ? "⚽ Goal" : null;
  // Basketball scores constantly: mark period ends instead.
  if (/end of (the )?(\d|1st|2nd|3rd|4th|first|second|third|fourth|half|quarter|period)/i.test(p.text) || /end period|end of period/i.test(p.typeText)) return "⏱️";
  return null;
}

function lineOf(league: string, snap: LiveSnap, p: LivePlay, tag: string): string {
  const score = p.awayScore != null && p.homeScore != null ? `${snap.awayAbbr} ${p.awayScore}–${p.homeScore} ${snap.homeAbbr}` : "";
  const when = [p.clock, p.period].filter(Boolean).join(" ");
  const text = p.text.replace(/\s+/g, " ").trim().slice(0, 140);
  if (tag === "⏱️") return `⏱️ ${text}${score ? ` · ${score}` : ""}`;
  return `${tag}${score ? ` · ${score}` : ""}${when ? ` · ${when}` : ""} · ${text}`;
}

/** Bring the thread's play-by-play lines up to date. Runs at most every 20s per game. */
export async function syncThreadPlays(league: string, id: string): Promise<void> {
  const lock = await redis(["SET", `pj:chat:syslock:${league}:${id}`, "1", "NX", "EX", 20]);
  if (lock !== "OK") return;
  const snap = await getLive(league, id).catch(() => null);
  if (!snap || snap.state === "pre") return;
  const big = [...(snap.keyPlays ?? []), ...snap.plays].map((p) => ({ p, tag: bigPlay(league, p) })).filter((x): x is { p: LivePlay; tag: string } => Boolean(x.tag && x.p.id));
  if (!big.length) return;
  const first = (await seenSystem(league, id)) === 0;
  // A thread opened mid-game gets only the latest few, not the whole game at once.
  const fresh = first ? big.slice(-3) : big;
  if (first) await markSystem(league, id, big.slice(0, -3).map((x) => x.p.id));
  for (const { p, tag } of fresh) await postSystem(league, id, p.id, lineOf(league, snap, p, tag));
  if (snap.state === "post") await postSystem(league, id, "final", `🏁 Final · ${snap.awayAbbr} ${snap.awayScore ?? ""}–${snap.homeScore ?? ""} ${snap.homeAbbr}`);
}
