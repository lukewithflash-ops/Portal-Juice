"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getPicks, getServerPicks, restorePicks, subscribe } from "@/lib/pickStore";
import { groupViews, legViews } from "@/lib/myLive";
import { slipKeyOf, TONE_COLOR } from "@/lib/motivation";
import { sideLine } from "@/lib/plusLegs";
import { isVipHandle, usePositions, type LivePosition, type PosLeg } from "@/lib/positionsClient";
import type { LiveSnap } from "@/lib/live";
import type { Pick, Sport } from "@/lib/types";
import { haptic } from "@/lib/native";

const asPick = (s: PosLeg, owner: string): Pick => ({
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
  plus: s.plus,
});

export function positionLabel(p: LivePosition): string {
  if (p.legs.length > 1) return `${p.legs.length}-leg parlay`;
  const l = p.legs[0];
  const side = l.selection ? sideLine({ selection: l.selection, line: l.line, plus: l.plus } as Pick) : String(l.line);
  return `${l.subject} ${side}${l.market ? " " + l.market : ""}`.trim();
}

/** Small pill next to a handle. Tap opens the read-only view. */
export function PosChip({ pos }: { pos: LivePosition }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="press inline-flex max-w-[11rem] items-center gap-1 rounded-full border border-[color:var(--plus)]/45 bg-[color:var(--plus)]/10 px-1.5 py-px align-middle text-[10px] font-bold text-white"
        aria-label={`Live position: ${positionLabel(pos)}. Open`}
        data-testid="pos-chip"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--plus)]" aria-hidden />
        <span className="truncate">{positionLabel(pos)}</span>
      </button>
      {open ? <PositionSheet pos={pos} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Handle-aware wrapper: renders the pill only when that handle has a live position. */
export function PosFor({ handle, map }: { handle: string; map: Record<string, LivePosition> }) {
  const p = map[handle.replace(/^@/, "").toLowerCase()];
  const vip = isVipHandle(handle);
  if (!p && !vip) return null;
  return (
    <>
      {vip ? (
        <span className="rounded bg-[color:var(--gold)] px-1 text-[9px] font-black leading-4 text-black" title="VIP member" data-testid="vip-mark">
          💎 VIP
        </span>
      ) : null}
      {p ? <PosChip pos={p} /> : null}
    </>
  );
}

export function PosChips({ handle }: { handle: string }) {
  const map = usePositions([handle]);
  return <PosFor handle={handle} map={map} />;
}

const STATE: Record<string, string> = { hit: "Hit", missed: "Missed", push: "Push", waiting: "Not started", alive: "Alive", behind: "Behind", "no-match": "" };

/** Live box snaps for a set of legs, refreshed every 20 s while visible. */
function useSnaps(legs: PosLeg[]) {
  const [snaps, setSnaps] = useState<Record<string, LiveSnap>>({});
  const key = [...new Set(legs.filter((l) => l.league && l.gameId).map((l) => `${l.league}:${l.gameId}`))].slice(0, 16).join(",");
  useEffect(() => {
    if (!key) return;
    let stop = false;
    const pull = () =>
      fetch(`/api/live/batch?g=${encodeURIComponent(key)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((s) => {
          if (stop) return;
          const m: Record<string, LiveSnap> = {};
          for (const [k, v] of Object.entries((s.snaps ?? {}) as Record<string, LiveSnap | null>)) if (v) m[k] = v;
          setSnaps(m);
        })
        .catch(() => {});
    pull();
    const t = setInterval(() => document.visibilityState === "visible" && pull(), 20000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [key]);
  return snaps;
}

/** One pick or parlay: leg meters, game links and Tail. Read-only. */
export function PositionGroup({ handle, legs: raw, snaps, onLeave, testid = "pos-group" }: { handle: string; legs: PosLeg[]; snaps: Record<string, LiveSnap>; onLeave?: () => void; testid?: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const mine = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const picks = raw.map((l) => asPick(l, handle));
  const legs = legViews(picks, snaps, [], slipKeyOf);
  const tailed = picks.every((p) => mine.some((m) => m.tailFrom === handle && m.subject === p.subject && m.line === p.line && (m.market ?? "") === (p.market ?? "")));
  async function doTail() {
    const r = await fetch("/api/friends/tail", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle, pickIds: raw.map((l) => l.id) }) });
    const j = (await r.json().catch(() => ({}))) as { legs?: PosLeg[]; error?: string };
    // Signed out, the tail still lands in your Log on this device; it just isn't counted for them.
    const rows = r.ok && j.legs ? j.legs : r.status === 401 ? raw : null;
    if (!rows) {
      setMsg(j.error ?? "Couldn't tail that.");
      return;
    }
    const sid = rows.length > 1 ? crypto.randomUUID() : undefined;
    const now = new Date().toISOString();
    const today = new Date().toLocaleDateString("en-CA");
    restorePicks(rows.map((s) => ({ ...asPick(s, handle), id: crypto.randomUUID(), book: `Tailed from @${handle}`, tailFrom: handle, status: "open", date: s.date || today, createdAt: now, slipId: sid })));
    setMsg(`${rows.length > 1 ? `${rows.length}-leg parlay` : rows[0].subject} is in your Log.`);
    haptic("success", 10);
  }
  return (
    <div data-testid={testid}>
      <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {picks.map((p) => {
          const l = legs.find((x) => x.pickId === p.id);
          const g = p.league && p.gameId ? snaps[`${p.league}:${p.gameId}`] : undefined;
          return (
            <li key={p.id} className="px-3 py-2.5" data-testid="pos-leg">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white">
                  {l?.name ?? p.subject} <span className="font-normal text-zinc-400">{l?.label ?? `${p.selection ? sideLine(p) : p.line} ${p.market ?? ""}`}</span>
                </span>
                {l ? <span className="tabular text-[13px] font-bold text-white">{l.valueText}/{l.lineText}</span> : null}
              </div>
              {l ? (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(3, Math.min(100, l.fill))}%`, background: TONE_COLOR[l.tone] }} />
                </div>
              ) : null}
              <div className="mt-1 flex items-center gap-2 text-[11px]">
                <span className={"font-bold " + (l?.state === "hit" ? "text-[color:var(--gold)]" : l?.state === "missed" ? "text-[color:var(--minus)]" : "text-zinc-400")}>{l ? STATE[l.state] : p.status === "open" ? "Open" : p.status.toUpperCase()}</span>
                {p.league && p.gameId ? (
                  <Link href={`/games/${p.league}/${p.gameId}`} className="ml-auto font-semibold text-purple-200" onClick={onLeave}>
                    {g ? `${g.awayAbbr} ${g.awayScore ?? ""} – ${g.homeScore ?? ""} ${g.homeAbbr}${g.state === "in" && g.detail ? " · " + g.detail : ""}` : "Game"} ›
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" disabled={tailed} onClick={doTail} className="press mt-2 w-full rounded-xl bg-[color:var(--plus)] py-2.5 text-[15px] font-bold text-black disabled:opacity-50" data-testid="pos-tail">
        {tailed ? "Tailed" : raw.length > 1 ? `Tail ${raw.length}-leg parlay` : "Tail"}
      </button>
      {msg ? <p className="mt-1.5 text-center text-[13px] font-semibold text-[color:var(--plus)]" role="status" data-testid="pos-msg">{msg}</p> : null}
    </div>
  );
}

/** Bottom sheet shell, portaled to <body> above the tab bar. Escape or the scrim closes it. */
export function Sheet({ label, onClose, children, testid }: { label: string; onClose: () => void; children: React.ReactNode; testid: string }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const body = (
    <div data-layer="">
      <div className="sheet-scrim" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label={label} className="sheet mx-auto max-w-lg" data-testid={testid}>
        {children}
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(body, document.body);
}

export function PositionSheet({ pos, onClose }: { pos: LivePosition; onClose: () => void }) {
  const snaps = useSnaps(pos.legs);
  const picks = pos.legs.map((l) => asPick(l, pos.handle));
  const legs = legViews(picks, snaps, [], slipKeyOf);
  const states: Record<string, "pre" | "in" | "post" | undefined> = {};
  for (const l of legs) states[l.key] = snaps[l.key]?.state;
  const slip = groupViews(legs, states)[0];
  return (
    <Sheet label={`@${pos.handle} live position`} onClose={onClose} testid="pos-sheet">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-bold text-white">@{pos.handle}</h2>
        <button type="button" onClick={onClose} className="press text-[13px] font-semibold text-zinc-400">Done</button>
      </div>
      <p className="mb-3 mt-0.5 text-[13px] text-zinc-400">
        Live position · {pos.legs.length > 1 ? `${pos.legs.length}-leg parlay` : "single"}
        {slip ? <span className="tabular"> · {slip.hit}/{slip.legs.length} hit</span> : null}
      </p>
      <PositionGroup handle={pos.handle} legs={pos.legs} snaps={snaps} onLeave={onClose} />
      <p className="mt-2 text-center text-[11px] text-zinc-500">Tail copies the legs into your Log to track. Nothing is placed.</p>
    </Sheet>
  );
}

type FriendView = { friend: boolean; handle: string; share?: boolean; picks?: PosLeg[]; position?: LivePosition | null };

/** Tap a name: friends see every open pick and parlay; anyone else sees only the one shared position. */
export function FriendSheet({ handle, onClose }: { handle: string; onClose: () => void }) {
  const [v, setV] = useState<FriendView | null>(null);
  useEffect(() => {
    let stop = false;
    fetch(`/api/friends/picks?h=${encodeURIComponent(handle)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: FriendView) => !stop && setV(j))
      .catch(() => !stop && setV({ friend: false, handle }));
    return () => {
      stop = true;
    };
  }, [handle]);
  const all = useMemo(() => (v?.friend && v.picks ? v.picks : v?.position?.legs ?? []), [v]);
  const snaps = useSnaps(all);
  const groups = useMemo(() => {
    const m = new Map<string, PosLeg[]>();
    for (const l of all) {
      const k = l.slipId ?? l.id;
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    return [...m.values()];
  }, [all]);
  return (
    <Sheet label={`@${handle}`} onClose={onClose} testid="friend-sheet">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-bold text-white">@{handle}</h2>
        <button type="button" onClick={onClose} className="press text-[13px] font-semibold text-zinc-400">Done</button>
      </div>
      {!v ? (
        <div className="mt-3 space-y-2">
          <div className="skel h-16" />
          <div className="skel h-16" />
        </div>
      ) : (
        <>
          <p className="tabular mb-3 mt-0.5 text-[13px] text-zinc-400" data-testid="friend-sheet-sub">
            {v.friend
              ? v.share === false
                ? "Friend · keeps open picks private"
                : `Friend · ${groups.length} open ${groups.length === 1 ? "position" : "positions"}`
              : v.position
                ? "Shared live position · only friends see every open pick"
                : "Only friends see open picks."}
          </p>
          {groups.length === 0 && v.friend && v.share !== false ? <p className="text-[13px] text-zinc-500">Nothing open right now.</p> : null}
          <div className="space-y-4">
            {groups.map((g) => (
              <PositionGroup key={g[0].slipId ?? g[0].id} handle={handle} legs={g} snaps={snaps} onLeave={onClose} testid="friend-group" />
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] text-zinc-500">W/L/P/open only, never stakes. Tail copies legs into your Log. Nothing is placed.</p>
        </>
      )}
    </Sheet>
  );
}

/** A handle you can tap to open their positions. */
export function FriendName({ handle, className = "" }: { handle: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={"press font-bold text-white underline-offset-2 hover:underline " + className} data-testid="friend-name">
        @{handle}
      </button>
      {open ? <FriendSheet handle={handle} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
