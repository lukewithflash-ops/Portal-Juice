"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { asPick, Sheet, useSnaps } from "@/components/LivePosition";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { gameKey, legViews } from "@/lib/myLive";
import { slipKeyOf, TONE_COLOR } from "@/lib/motivation";
import { sideLine } from "@/lib/plusLegs";
import type { PosLeg } from "@/lib/positionsClient";
import type { SharedPos } from "@/lib/sharePos";
import type { Pick } from "@/lib/types";
import { haptic } from "@/lib/native";

const toLeg = (p: Pick): PosLeg => ({ id: p.id.slice(0, 40), subject: p.subject, line: p.line, market: p.market ?? null, selection: p.selection ?? null, league: p.league ?? null, gameId: p.gameId ?? null, status: p.status, date: p.date, slipId: null, createdAt: p.createdAt, sport: p.sport, plus: p.plus });
const legText = (l: PosLeg) => `${l.selection ? sideLine({ selection: l.selection, line: l.line, plus: l.plus } as Pick) : l.line}${l.market ? ` ${l.market}` : ""}`;
const FINAL: Record<string, { t: string; c: string }> = { win: { t: "Hit", c: "var(--gold)" }, loss: { t: "Miss", c: "var(--minus)" }, push: { t: "Push", c: "#a1a1aa" } };
const LIVE: Record<string, string> = { hit: "Hit", missed: "Miss", push: "Push", waiting: "Not started", alive: "Live", behind: "Live", "no-match": "Open" };

/** The user's own open picks and parlays, grouped by slip. Game-tied ones float first. */
function useOpenGroups(league?: string, gameId?: string) {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  return useMemo(() => {
    const open = picks.filter((p) => p.status === "open");
    const m = new Map<string, Pick[]>();
    for (const p of open) {
      const k = p.slipId ?? p.id;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    const here = (g: Pick[]) => (gameId ? g.some((p) => p.gameId === gameId && (!league || !p.league || p.league === league)) : false);
    return [...m.entries()].map(([k, legs]) => ({ k, legs: legs.slice(0, 8), here: here(legs) })).sort((a, b) => Number(b.here) - Number(a.here) || (b.legs[0].createdAt > a.legs[0].createdAt ? 1 : -1)).slice(0, 30);
  }, [picks, league, gameId]);
}

/** One-tap "+" beside a composer. */
export function SharePosButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={() => { haptic("light"); onClick(); }} className="sp-plus press" aria-label="Share a position" data-testid="sharepos-open">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
    </button>
  );
}

export function SharePosSheet({ league, gameId, onShare, onClose }: { league?: string; gameId?: string; onShare: (p: SharedPos) => void; onClose: () => void }) {
  const groups = useOpenGroups(league, gameId);
  const snaps = useSnaps(groups.flatMap((g) => g.legs.map(toLeg)));
  return (
    <Sheet label="Share a position" onClose={onClose} testid="sharepos-sheet">
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-[17px] font-bold text-white">Share a position</h2>
        <button type="button" onClick={onClose} className="text-[13px] font-semibold text-zinc-400">Cancel</button>
      </div>
      <p className="pb-2 text-[12px] text-zinc-400">Only the one you tap gets posted. It updates live for everyone in the chat.</p>
      {!groups.length ? (
        <div className="py-8 text-center text-[13px] text-zinc-400" data-testid="sharepos-empty">
          <p className="text-[15px] font-bold text-white">No open picks</p>
          <p className="mt-1">Add a slip in your Log and it shows up here.</p>
          <Link href="/log" className="sp-chip mt-3 inline-block" onClick={onClose}>Open Log</Link>
        </div>
      ) : (
        <ul className="max-h-[56dvh] space-y-2 overflow-y-auto overscroll-contain" data-testid="sharepos-list">
          {groups.map((g) => {
            const s = g.legs[0].league && g.legs[0].gameId ? snaps[gameKey(g.legs[0].league, g.legs[0].gameId)] : undefined;
            return (
              <li key={g.k}>
                <button type="button" onClick={() => { haptic("success", 10); onShare({ legs: g.legs.map(toLeg) }); }} className="sp-row press w-full text-left" data-testid="sharepos-item">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {g.here ? <span className="sp-tag">This game</span> : null}
                      {s?.state === "in" ? <span className="sp-live">LIVE</span> : null}
                      <b className="truncate text-[14px] text-white">{g.legs.length > 1 ? `${g.legs.length}-leg parlay` : g.legs[0].subject}</b>
                    </span>
                    <span className="block truncate text-[12px] text-zinc-400">{g.legs.length > 1 ? g.legs.map((l) => l.subject).join(" · ") : legText(toLeg(g.legs[0]))}</span>
                  </span>
                  <span className="sp-chip">Share</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}

/** Rich chat bubble for a shared position, live from the box score. Tap a leg to open its game. */
export function PosBubble({ pos, handle, mine }: { pos: SharedPos; handle: string; mine?: boolean }) {
  const snaps = useSnaps(pos.legs);
  const picks = pos.legs.map((l) => asPick(l, handle));
  const views = legViews(picks, snaps, [], slipKeyOf);
  return (
    <div className={`sp-bubble ${mine ? "mine" : ""}`} data-testid="sharepos-bubble">
      <div className="sp-head">
        <span className="sp-dot" aria-hidden />
        {pos.legs.length > 1 ? `${pos.legs.length}-leg parlay` : "Live position"}
      </div>
      <ul className="space-y-2">
        {pos.legs.map((l, i) => {
          const p = picks[i];
          const v = views.find((x) => x.pickId === p.id);
          const g = l.league && l.gameId ? snaps[gameKey(l.league, l.gameId)] : undefined;
          const fin = FINAL[l.status];
          const st = fin ?? (v ? { t: LIVE[v.state] ?? "Open", c: v.state === "hit" ? "var(--gold)" : v.state === "missed" ? "var(--minus)" : "var(--portal-green)" } : { t: "Open", c: "#a1a1aa" });
          const body = (
            <>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-white">{v?.name ?? l.subject} <span className="font-normal text-zinc-300">{v?.label ?? legText(l)}</span></span>
                {v ? <span className="tabular text-[13px] font-black text-white">{v.valueText}/{v.lineText}</span> : null}
              </div>
              {v ? (
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(3, Math.min(100, v.fill))}%`, background: TONE_COLOR[v.tone] }} />
                </div>
              ) : null}
              <div className="mt-1 flex items-center gap-2 text-[11px]">
                <span className="font-black" style={{ color: st.c }}>{st.t}</span>
                {g ? <span className="tabular ml-auto text-zinc-300">{g.awayAbbr} {g.awayScore ?? ""}–{g.homeScore ?? ""} {g.homeAbbr}{g.state === "in" && g.detail ? ` · ${g.detail}` : g.state === "post" ? " · Final" : ""} ›</span> : null}
              </div>
            </>
          );
          return <li key={`${l.id}-${i}`}>{l.league && l.gameId ? <Link href={`/games/${l.league}/${l.gameId}`} className="block">{body}</Link> : body}</li>;
        })}
      </ul>
    </div>
  );
}
