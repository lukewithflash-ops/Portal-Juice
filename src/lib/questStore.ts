"use client";

import { getPicks } from "@/lib/pickStore";
import { getNotes } from "@/lib/noteStore";
import { complete, EMPTY_QUESTS, questsFor, QUESTS, type QuestId, type QuestState } from "@/lib/questsCore";

/** Daily quests on this device; synced with the account as a single value when signed in. */
export const QUEST_KEY = "pj-quests-v1";
let raw0: string | null = null;
let cache: QuestState = EMPTY_QUESTS;
const listeners = new Set<() => void>();

export const localDay = () => new Date().toLocaleDateString("en-CA");

export function getQuests(): QuestState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(QUEST_KEY);
  } catch {
    return EMPTY_QUESTS;
  }
  if (raw !== raw0) {
    raw0 = raw;
    try {
      const v = raw ? JSON.parse(raw) : null;
      cache = v && typeof v === "object" && v.days ? (v as QuestState) : EMPTY_QUESTS;
    } catch {
      cache = EMPTY_QUESTS;
    }
  }
  return cache;
}
export const getServerQuests = () => EMPTY_QUESTS;
export function subscribeQuests(cb: () => void) {
  listeners.add(cb);
  const on = (e: StorageEvent) => (e.key === null || e.key === QUEST_KEY) && cb();
  window.addEventListener("storage", on);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", on);
  };
}

/** Mark a quest done today (only counts if it is one of today's three). */
export function questDone(id: QuestId) {
  const day = localDay();
  if (!questsFor(day).includes(id)) return;
  const s = getQuests();
  const next = complete(s, day, id);
  if (next === s) return;
  try {
    localStorage.setItem(QUEST_KEY, JSON.stringify(next));
  } catch {
    return;
  }
  listeners.forEach((l) => l());
  window.dispatchEvent(new CustomEvent("pj-quest", { detail: QUESTS[id].label }));
}

/** Quests that show in your data: a pick, a parlay or a note made today. */
export function scanQuests() {
  const day = localDay();
  const today = (iso: string | undefined) => !!iso && new Date(iso).toLocaleDateString("en-CA") === day;
  const picks = getPicks().filter((p) => today(p.createdAt));
  if (picks.length) questDone("log");
  const slips = new Map<string, number>();
  for (const p of picks) if (p.slipId) slips.set(p.slipId, (slips.get(p.slipId) ?? 0) + 1);
  if ([...slips.values()].some((n) => n >= 2)) questDone("parlay");
  if (getNotes().some((n) => today(n.createdAt))) questDone("note");
}
