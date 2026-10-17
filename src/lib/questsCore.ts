/** Daily streak quests. Pure: which 3 quests today, progress, badges and emote unlocks. */

export type QuestId = "log" | "note" | "watch" | "breakdown" | "parlay" | "props" | "live" | "react";
export const QUESTS: Record<QuestId, { label: string; hint: string; href: string }> = {
  log: { label: "Log a pick", hint: "Any pick, any league.", href: "/lines/portfolio" },
  note: { label: "Write a note", hint: "On a pick, a parlay, or a live game.", href: "/notes" },
  watch: { label: "Watch a live game 5 min", hint: "Keep a live game page open for five minutes.", href: "/games" },
  breakdown: { label: "Check a breakdown", hint: "Run any slip through Breakdown.", href: "/check" },
  parlay: { label: "Log a parlay", hint: "Two or more legs on one slip.", href: "/lines/portfolio" },
  props: { label: "Scan the heat map", hint: "Open Props and look at the hit rates.", href: "/props" },
  live: { label: "Check My Live", hint: "See your legs move.", href: "/live" },
  react: { label: "Drop an emote", hint: "React in a game thread or on a friend's leg.", href: "/games" },
};
const POOL = Object.keys(QUESTS) as QuestId[];

export type QuestState = { days: Record<string, QuestId[]>; v: 1 };
export const EMPTY_QUESTS: QuestState = { days: {}, v: 1 };

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Same three quests for everyone on a given day, always including one easy one. */
export function questsFor(day: string): QuestId[] {
  const out: QuestId[] = [];
  let h = hash("pj-q:" + day);
  const pool = [...POOL];
  while (out.length < 3 && pool.length) {
    const i = h % pool.length;
    out.push(pool.splice(i, 1)[0]);
    h = hash(String(h));
  }
  if (!out.some((q) => q === "log" || q === "live")) out[2] = "live";
  return out;
}

export function doneToday(s: QuestState, day: string): QuestId[] {
  const want = questsFor(day);
  return (s.days[day] ?? []).filter((q) => want.includes(q));
}

export function complete(s: QuestState, day: string, id: QuestId): QuestState {
  const have = s.days[day] ?? [];
  if (have.includes(id)) return s;
  const days = { ...s.days, [day]: [...have, id] };
  // Keep 60 days.
  const keys = Object.keys(days).sort().slice(-60);
  return { v: 1, days: Object.fromEntries(keys.map((k) => [k, days[k]])) };
}

const allDone = (s: QuestState, day: string) => doneToday(s, day).length >= 3;
const prevDay = (day: string) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** Days in a row with all three quests done (today counts once it is done; yesterday keeps it alive). */
export function questStreak(s: QuestState, today: string): number {
  let d = allDone(s, today) ? today : prevDay(today);
  let n = 0;
  while (allDone(s, d)) {
    n++;
    d = prevDay(d);
  }
  return n;
}

export function fullDays(s: QuestState): number {
  return Object.keys(s.days).filter((d) => allDone(s, d)).length;
}

export const BADGES: { at: number; id: string; label: string; icon: string }[] = [
  { at: 1, id: "first-light", label: "First Light", icon: "🌟" },
  { at: 3, id: "triple-glow", label: "Triple Glow", icon: "💫" },
  { at: 7, id: "portal-regular", label: "Portal Regular", icon: "🌀" },
  { at: 14, id: "neon-veteran", label: "Neon Veteran", icon: "💜" },
  { at: 30, id: "juice-legend", label: "Juice Legend", icon: "👑" },
];

/** Portal emotes for threads and friend reactions. Base ones are always on; the rest unlock with full quest days. */
export const EMOTES: { id: string; icon: string; label: string; at: number }[] = [
  { id: "fire", icon: "🔥", label: "Fire", at: 0 },
  { id: "heart", icon: "💓", label: "Sweat", at: 0 },
  { id: "target", icon: "🎯", label: "Called it", at: 0 },
  { id: "cry", icon: "😭", label: "Pain", at: 0 },
  { id: "volt", icon: "⚡", label: "Volt", at: 2 },
  { id: "portal", icon: "🌀", label: "Portal", at: 5 },
  { id: "crown", icon: "👑", label: "Crown", at: 10 },
  { id: "ufo", icon: "🛸", label: "Abduction", at: 20 },
];
export const emoteIcon = (id: string) => EMOTES.find((e) => e.id === id)?.icon ?? null;
export function unlockedEmotes(full: number) {
  return EMOTES.filter((e) => full >= e.at);
}

/** Two devices' quest logs, joined day by day (JSON strings in and out). */
export function mergeQuestJson(a: string | null, b: string | null): string | null {
  const parse = (x: string | null): QuestState | null => {
    try {
      const v = x ? JSON.parse(x) : null;
      return v && v.days ? v : null;
    } catch {
      return null;
    }
  };
  const x = parse(a);
  const y = parse(b);
  if (!x) return b;
  if (!y) return a;
  const days: Record<string, QuestId[]> = { ...x.days };
  for (const [d, qs] of Object.entries(y.days)) days[d] = [...new Set([...(days[d] ?? []), ...qs])];
  const keys = Object.keys(days).sort().slice(-60);
  return JSON.stringify({ v: 1, days: Object.fromEntries(keys.map((k) => [k, days[k]])) });
}
