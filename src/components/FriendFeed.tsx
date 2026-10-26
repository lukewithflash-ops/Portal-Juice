"use client";

import { dnbHeadsUp } from "@/lib/dnbStore";
import { FriendName } from "@/components/LivePosition";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { alreadyInLog } from "@/lib/copyGuard";
import { confirmAgain } from "@/lib/confirmAgain";
import { getPicks, getServerPicks, restorePicks, subscribe } from "@/lib/pickStore";
import { groupViews, legViews, type LegView, type SlipView } from "@/lib/myLive";
import { slipKeyOf, TONE_COLOR } from "@/lib/motivation";
import { emoteIcon, fullDays, unlockedEmotes } from "@/lib/questsCore";
import { getQuests, questDone } from "@/lib/questStore";
import type { LiveSnap } from "@/lib/live";
import type { Pick, Sport } from "@/lib/types";

type Slim = { id: string; subject: string; line: number; market: string | null; selection: "Over" | "Under" | null; league: string | null; gameId: string | null; status: string; date: string; slipId: string | null; createdAt: string; sport?: string };
type Friend = { handle: string; picks: Slim[]; reactions: Record<string, Record<string, number>>; tails: Record<string, number> };
type Feed = { signedIn: boolean; friends: Friend[]; mine?: { tails: Record<string, number>; log: { from: string; emote: string; subject: string; ts: number; kind: "react" | "tail" }[] } };

const asPick = (s: Slim, owner: string): Pick => ({
  id: `${owner}:${s.id}`,
  sport: (s.sport ?? (s.league ?? "nba").toUpperCase()) as Sport,
  subject: s.subject,
  line: s.line,
  odds: 0,
  stake: 0,
  book: "@" + owner,
  date: s.date,
  status: s.status as Pick["status"],
  createdAt: s.createdAt,
  league: s.league ?? undefined,
  gameId: s.gameId ?? undefined,
  market: s.market ?? undefined,
  selection: s.selection,
  slipId: s.slipId ? `${owner}:${s.slipId}` : undefined,
});

const STATUS: Record<string, string> = { win: "W", loss: "L", push: "P", open: "open" };

/** Friends' picks with live meters, reactions and Tail. Signed-in only. */
export default function FriendFeed({ compact = false }: { compact?: boolean }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [snaps, setSnaps] = useState<Record<string, LiveSnap>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const mine = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const busyTail = useRef(new Set<string>());
  const pull = useCallback(async () => {
    try {
      const r = await fetch("/api/friends/feed", { cache: "no-store" });
      const j = (await r.json()) as Feed;
      setFeed(j);
      const games = [...new Set(j.friends.flatMap((f) => f.picks.filter((p) => p.status === "open" && p.league && p.gameId).map((p) => `${p.league}:${p.gameId}`)))].slice(0, 16);
      if (games.length) {
        const s = await fetch(`/api/live/batch?g=${encodeURIComponent(games.join(","))}`, { cache: "no-store" }).then((x) => x.json());
        const m: Record<string, LiveSnap> = {};
        for (const [k, v] of Object.entries((s.snaps ?? {}) as Record<string, LiveSnap | null>)) if (v) m[k] = v;
        setSnaps(m);
      }
    } catch {
      /* offline */
    }
  }, []);
  useEffect(() => {
    const first = setTimeout(pull, 0);
    const t = setInterval(() => document.visibilityState === "visible" && pull(), 30000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [pull]);

  const views = useMemo(() => {
    if (!feed?.friends) return [];
    return feed.friends.map((f) => {
      const ps = f.picks.map((s) => asPick(s, f.handle));
      const legs = legViews(ps, snaps, [], slipKeyOf);
      const states: Record<string, "pre" | "in" | "post" | undefined> = {};
      for (const l of legs) states[l.key] = snaps[l.key]?.state;
      const slips = groupViews(legs, states);
      const loose = ps.filter((p) => !p.league || !p.gameId);
      return { f, ps, slips, loose };
    });
  }, [feed, snaps]);

  if (!feed) return null;
  if (!feed.signedIn) {
    return compact ? null : (
      <p className="panel rounded-xl p-4 text-sm text-zinc-300">
        <Link href="/account" className="font-black text-white underline">Sign in</Link> to add friends and see their picks live.
      </p>
    );
  }
  const emotes = unlockedEmotes(fullDays(getQuests()));

  async function sendReact(handle: string, pickId: string, emote: string) {
    const r = await fetch("/api/friends/react", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle, pickId, emote }) });
    if (r.ok) {
      questDone("react");
      setMsg(`${emoteIcon(emote)} sent to @${handle}`);
      setTimeout(() => setMsg(null), 2500);
      pull();
    }
  }
  async function doTail(handle: string, picks: Pick[]) {
    const k = picks.map((p) => p.id).join(",");
    if (busyTail.current.has(k)) return;
    busyTail.current.add(k);
    setTimeout(() => busyTail.current.delete(k), 1500);
    if (alreadyInLog(getPicks(), picks, handle) && !(await confirmAgain())) return;
    if (!(await dnbHeadsUp(picks))) return;
    const ids = picks.map((p) => p.id.slice(handle.length + 1));
    const r = await fetch("/api/friends/tail", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle, pickIds: ids }) });
    const j = (await r.json()) as { legs?: Slim[]; error?: string };
    if (!r.ok || !j.legs) {
      setMsg(j.error ?? "Couldn't tail that.");
      return;
    }
    const slip = j.legs.length > 1 ? crypto.randomUUID() : undefined;
    const now = new Date().toISOString();
    const today = new Date().toLocaleDateString("en-CA");
    restorePicks(
      j.legs.map((s) => ({ ...asPick(s, handle), id: crypto.randomUUID(), book: `Tailed from @${handle}`, tailFrom: handle, status: "open", date: s.date || today, createdAt: now, slipId: slip }))
    );
    setMsg(`Tailed @${handle}: ${j.legs.length > 1 ? `${j.legs.length}-leg parlay` : j.legs[0].subject} is in your Log.`);
    setTimeout(() => setMsg(null), 3500);
    pull();
  }
  const tailedAlready = (handle: string, picks: Pick[]) => alreadyInLog(mine, picks, handle);

  const legRow = (f: Friend, l: LegView) => {
    const rawId = l.pickId.slice(f.handle.length + 1);
    const rx = f.reactions[rawId] ?? {};
    return (
      <li key={l.pickId} className="px-3 py-2" data-testid="friend-leg">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-white">{l.name} <span className="font-medium text-zinc-400">{l.label}</span></span>
          <span className="tabular text-[12px] font-black text-white">{l.valueText}/{l.lineText}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.min(100, l.fill))}%`, background: TONE_COLOR[l.tone] }} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
          <span className={"font-black " + (l.state === "hit" ? "text-[color:var(--gold)]" : l.state === "missed" ? "text-[color:var(--minus)]" : "text-zinc-400")}>{l.state === "hit" ? "Hit" : l.state === "missed" ? "Missed" : l.state === "push" ? "Push" : l.state === "waiting" ? "Not started" : l.state === "alive" ? "Alive" : l.state === "behind" ? "Behind" : ""}</span>
          {Object.entries(rx).map(([e, n]) => (
            <span key={e} className="rounded-full bg-white/10 px-1.5">{emoteIcon(e)} {n}</span>
          ))}
          {l.state === "hit" || l.state === "alive" ? (
            <span className="ml-auto flex gap-0.5" role="group" aria-label="React">
              {emotes.map((e) => (
                <button key={e.id} type="button" onClick={() => sendReact(f.handle, rawId, e.id)} className="emote-btn rounded-full px-1 text-base" aria-label={`React ${e.label}`} data-testid="friend-react">
                  {e.icon}
                </button>
              ))}
            </span>
          ) : null}
        </div>
      </li>
    );
  };

  const slipBox = (f: Friend, s: SlipView, ps: Pick[]) => {
    const picks = ps.filter((p) => s.legs.some((l) => l.pickId === p.id));
    const allOpen = picks.every((p) => p.status === "open") && s.legs.every((l) => l.state === "waiting" || l.state === "alive" || l.state === "behind");
    const raw = picks[0]?.slipId ? picks[0].slipId.slice(f.handle.length + 1) : picks[0]?.id.slice(f.handle.length + 1);
    const tails = raw ? f.tails[raw] ?? 0 : 0;
    const done = tailedAlready(f.handle, picks);
    return (
      <div key={s.key} className="friend-slip rounded-xl border border-white/10 bg-black/40" data-testid="friend-slip">
        <div className="flex items-center gap-2 px-3 pt-2 text-[11px] font-black uppercase tracking-wider text-purple-200">
          {s.total > 1 ? `Parlay · ${s.total} legs · ${s.hit} hit` : "Single"}
          {tails ? <span className="text-zinc-400 normal-case">· 🔁 {tails} tail{tails === 1 ? "" : "s"}</span> : null}
          {allOpen ? (
            <button type="button" onClick={() => doTail(f.handle, picks)} className="ml-auto rounded-lg border border-[color:var(--plus)]/60 px-2 py-0.5 text-[11px] font-black normal-case tracking-normal text-white disabled:opacity-50" data-testid="tail-btn">
              {done ? "In your log ✓" : "🔁 Tail"}
            </button>
          ) : null}
        </div>
        <ul className="divide-y divide-white/10">{s.legs.map((l) => legRow(f, l))}</ul>
      </div>
    );
  };

  return (
    <section className="mt-4" aria-label="Friends" data-testid="friend-feed">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-sm font-black uppercase tracking-[0.18em] text-purple-200">Friends</h2>
        <Link href="/friends" className="text-[11px] font-bold text-purple-200/80">Manage →</Link>
      </div>
      {feed.mine?.log?.length ? (
        <ul className="mb-2 space-y-1 text-[12px] text-zinc-300" data-testid="friend-log">
          {feed.mine.log.slice(0, compact ? 3 : 8).map((x, i) => (
            <li key={i}>
              <b className="text-white">@{x.from}</b> {x.kind === "tail" ? `🔁 tailed your ${x.subject}` : `${emoteIcon(x.emote) ?? ""} on your ${x.subject} leg`}
            </li>
          ))}
        </ul>
      ) : null}
      {!feed.friends.length ? (
        <p className="panel rounded-xl p-3 text-[13px] text-zinc-400">
          No friends yet. <Link href="/friends" className="font-black text-white underline">Add one by handle, link or QR</Link>.
        </p>
      ) : (
        <div className="space-y-3">
          {views.map(({ f, ps, slips, loose }) => (
            <div key={f.handle} data-testid="friend-block">
              <p className="mb-1 text-[12px]"><FriendName handle={f.handle} /></p>
              {slips.length || loose.length ? (
                <div className="space-y-2">
                  {slips.slice(0, compact ? 2 : 10).map((s) => slipBox(f, s, ps))}
                  {loose.slice(0, compact ? 2 : 6).map((p) => (
                    <div key={p.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[13px]">
                      <span className="min-w-0 flex-1 truncate font-bold text-white">{p.subject} <span className="text-zinc-400">{p.selection ?? ""} {p.line} {p.market ?? ""}</span></span>
                      <span className="text-[11px] font-black text-zinc-300">{STATUS[p.status]}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-zinc-500">No open picks right now.</p>
              )}
            </div>
          ))}
        </div>
      )}
      {msg ? <p className="mt-2 text-[12px] font-bold text-[color:var(--plus)]" role="status" data-testid="friend-msg">{msg}</p> : null}
      <p className="mt-2 text-[11px] text-zinc-500">Friends see all your open picks, W/L/P/open only, never stakes. Turn it off in Account.</p>
    </section>
  );
}
