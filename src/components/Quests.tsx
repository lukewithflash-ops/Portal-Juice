"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getNotes, subscribeNotes } from "@/lib/noteStore";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { BADGES, doneToday, fullDays, questsFor, QUESTS, questStreak, unlockedEmotes, EMOTES, type QuestState } from "@/lib/questsCore";
import { getQuests, getServerQuests, localDay, questDone, scanQuests, subscribeQuests } from "@/lib/questStore";

export function useQuests(): { s: QuestState; day: string; ready: boolean } {
  const s = useSyncExternalStore(subscribeQuests, getQuests, getServerQuests);
  const ready = useSyncExternalStore(() => () => {}, () => true, () => false);
  return { s, day: ready ? localDay() : "", ready };
}

/** Watches for quest progress anywhere in the app, lights the header, and toasts a finished quest. */
export function QuestAgent() {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const notes = useSyncExternalStore(subscribeNotes, getNotes, () => []);
  const path = usePathname();
  const params = useSearchParams();
  const { s, day, ready } = useQuests();
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (ready) scanQuests();
  }, [picks, notes, ready]);
  useEffect(() => {
    if (!ready) return;
    if (path === "/live") questDone("live");
    if (path === "/props") {
      const t = setTimeout(() => questDone("props"), 4000);
      return () => clearTimeout(t);
    }
    if (path === "/check" && [...params.keys()].length) questDone("breakdown");
  }, [path, params, ready]);
  const n = ready ? doneToday(s, day).length : 0;
  useEffect(() => {
    const el = document.documentElement;
    if (n) el.dataset.quest = String(n);
    else delete el.dataset.quest;
  }, [n]);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const on = (e: Event) => {
      setToast(String((e as CustomEvent).detail));
      if (t) clearTimeout(t);
      t = setTimeout(() => setToast(null), 3200);
    };
    window.addEventListener("pj-quest", on);
    return () => window.removeEventListener("pj-quest", on);
  }, []);
  if (!toast) return null;
  return (
    <Link href="/quests" data-layer="" style={{ position: "fixed", zIndex: 1001 }} className="quest-toast portal-toast fixed left-1/2 top-[calc(4.5rem+env(safe-area-inset-top))] -translate-x-1/2 rounded-full px-4 py-2 text-sm font-black text-white" role="status" data-testid="quest-toast">
      ✨ Quest done: {toast} · {n}/3
    </Link>
  );
}

/** Three dots for today's quests, for My Live and My stats. */
export function QuestStrip() {
  const { s, day, ready } = useQuests();
  if (!ready) return null;
  const want = questsFor(day);
  const done = doneToday(s, day);
  const streak = questStreak(s, day);
  return (
    <Link href="/quests" className="quest-strip mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-bold text-zinc-200" data-testid="quest-strip">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-200">Daily quests</span>
      <span className="flex gap-1" aria-hidden>
        {want.map((q) => (
          <span key={q} className={"quest-dot " + (done.includes(q) ? "quest-dot-on" : "")} />
        ))}
      </span>
      <span>{done.length}/3</span>
      {streak ? <span className="ml-auto text-[color:var(--plus)]">✨ {streak}-day streak</span> : <span className="ml-auto text-zinc-500">→</span>}
    </Link>
  );
}

/** The /quests page. */
export default function QuestsPage() {
  const { s, day, ready } = useQuests();
  const full = useMemo(() => fullDays(s), [s]);
  if (!ready) return null;
  const want = questsFor(day);
  const done = doneToday(s, day);
  const streak = questStreak(s, day);
  const emotes = unlockedEmotes(full);
  return (
    <div className="space-y-5">
      <section className="quest-panel rounded-2xl p-4" data-testid="quest-panel">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-black text-white">Today · {done.length}/3</h2>
          <span className="text-[12px] font-bold text-[color:var(--plus)]">{streak ? `✨ ${streak}-day quest streak` : "Finish all 3 to start a streak"}</span>
        </div>
        <ul className="mt-3 space-y-2">
          {want.map((q) => {
            const on = done.includes(q);
            return (
              <li key={q} className={"quest-item flex items-center gap-3 rounded-xl px-3 py-2.5 " + (on ? "quest-item-on" : "")} data-testid="quest-item" data-done={on ? "1" : "0"}>
                <span className={"quest-check " + (on ? "quest-check-on" : "")} aria-hidden>{on ? "✓" : ""}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-white">{QUESTS[q].label}</span>
                  <span className="block text-[11px] text-zinc-400">{QUESTS[q].hint}</span>
                </span>
                {!on ? (
                  <Link href={QUESTS[q].href} className="rounded-lg border border-purple-400/50 px-2 py-1 text-[11px] font-black text-purple-100">
                    Go
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-zinc-500">New quests every day at midnight your time. Each full day lights the header and counts toward badges and emotes. Saved on this device and synced when you sign in.</p>
      </section>
      <section>
        <h2 className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-purple-200/80">Badges · {full} full day{full === 1 ? "" : "s"}</h2>
        <ul className="grid grid-cols-5 gap-2">
          {BADGES.map((b) => (
            <li key={b.id} className={"quest-badge flex flex-col items-center rounded-xl px-1 py-2 text-center " + (full >= b.at ? "quest-badge-on" : "")} data-testid="quest-badge" data-on={full >= b.at ? "1" : "0"}>
              <span className="text-2xl" aria-hidden>{full >= b.at ? b.icon : "🔒"}</span>
              <span className="mt-1 text-[10px] font-black leading-tight text-white">{b.label}</span>
              <span className="text-[9px] text-zinc-500">{b.at} day{b.at === 1 ? "" : "s"}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-purple-200/80">Neon emotes · {emotes.length}/{EMOTES.length}</h2>
        <ul className="flex flex-wrap gap-2">
          {EMOTES.map((e) => (
            <li key={e.id} className={"quest-emote rounded-full px-3 py-1.5 text-sm font-bold " + (full >= e.at ? "quest-emote-on" : "")} title={full >= e.at ? e.label : `Unlocks at ${e.at} full days`}>
              {full >= e.at ? e.icon : "🔒"} {e.label}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-zinc-500">Use them in game threads and on friends&apos; legs.</p>
      </section>
    </div>
  );
}
