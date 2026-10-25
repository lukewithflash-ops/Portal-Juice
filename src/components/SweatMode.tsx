"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useLiveHub } from "@/components/LiveHub";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { slipKeyOf } from "@/lib/motivation";
import { groupViews, legViews } from "@/lib/myLive";
import { beatSeconds, needed, statShort, sweats, type Sweat } from "@/lib/sweat";
import { gameRoute } from "@/lib/gameRoute";

const DISMISS = "pj-sweat-dismissed";
const SPORT: Record<string, string> = { nhl: "nhl", nba: "nba", wnba: "wnba", nfl: "nfl", mlb: "mlb", ncaaf: "college-football", ncaam: "mens-college-basketball" };

function dismissed(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(DISMISS) || "{}");
  } catch {
    return {};
  }
}

/** Live sweats from your Log and the live hub. */
export function useSweats(): Sweat[] {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const { snaps, legs: hubLegs } = useLiveHub();
  return useMemo(() => {
    const mine = picks.filter((p) => p.slipId && (p.status === "open" || p.status === "win" || p.status === "push"));
    const legs = legViews(mine, snaps, hubLegs, slipKeyOf);
    const states: Record<string, "pre" | "in" | "post" | undefined> = {};
    for (const l of legs) states[l.key] = snaps[l.key]?.state;
    return sweats(groupViews(legs, states)).filter((s) => states[s.leg.key] === "in");
  }, [picks, snaps, hubLegs]);
}

export function openSweat(pickId: string) {
  window.dispatchEvent(new CustomEvent("pj-sweat", { detail: pickId }));
}

/**
 * Opens Sweat mode on My Live and on that leg's game page when a parlay is down to one live leg,
 * once per leg (dismiss sticks for the session), from a push (?sweat=<pickId>) or a Sweat button.
 */
export default function SweatWatch() {
  const list = useSweats();
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => setOpen(String((e as CustomEvent).detail));
    window.addEventListener("pj-sweat", on);
    return () => window.removeEventListener("pj-sweat", on);
  }, []);
  const want = params.get("sweat");
  useEffect(() => {
    if (open) return;
    const d = dismissed();
    const pick = want ? list.find((s) => s.leg.pickId === want) : list.find((s) => !d[s.leg.pickId] && (path === "/live" || path === `/games/${s.leg.league}/${s.leg.gameId}`));
    if (pick) {
      const id = requestAnimationFrame(() => setOpen(pick.leg.pickId));
      return () => cancelAnimationFrame(id);
    }
  }, [list, path, want, open]);
  const s = list.find((x) => x.leg.pickId === open);
  if (!open || !s) return null;
  return (
    <SweatView
      s={s}
      onClose={() => {
        try {
          sessionStorage.setItem(DISMISS, JSON.stringify({ ...dismissed(), [s.leg.pickId]: Date.now() }));
        } catch {
          /* private mode */
        }
        setOpen(null);
        if (want) router.replace(path);
      }}
    />
  );
}

function SweatView({ s, onClose }: { s: Sweat; onClose: () => void }) {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const { snaps } = useLiveHub();
  const pick = picks.find((p) => p.id === s.leg.pickId);
  const snap = snaps[s.leg.key];
  const over = (pick?.selection ?? "Over") === "Over";
  const need = needed(pick?.line ?? null, s.leg.value, over);
  const short = statShort(pick?.market ?? s.leg.label);
  const beat = beatSeconds(s.leg.fill);
  const sport = SPORT[s.leg.league];
  const img = s.leg.athleteId && sport ? `https://a.espncdn.com/i/headshots/${sport}/players/full/${s.leg.athleteId}.png` : null;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div data-layer="" style={{ position: "fixed", inset: 0, zIndex: 1000 }} className="sweat-stage fixed inset-0 flex flex-col items-center justify-center px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-center" role="dialog" aria-modal="true" aria-label="Sweat mode" data-testid="sweat-mode">
      <button type="button" onClick={onClose} className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] rounded-full border border-white/30 bg-black/50 px-3 py-1 text-sm font-black text-white" data-testid="sweat-close">
        ✕ Close
      </button>
      <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[color:var(--plus)]">Last leg alive · {s.hit}/{s.total} hit</p>
      <div className="sweat-heart relative mt-6" style={{ "--beat": `${beat}s` } as React.CSSProperties} data-beat={beat}>
        <div className="sweat-ring absolute inset-0 rounded-full" aria-hidden />
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="relative h-40 w-40 rounded-full border-4 border-[color:var(--plus)] bg-black/60 object-cover" />
        ) : (
          <div className="relative flex h-40 w-40 items-center justify-center rounded-full border-4 border-[color:var(--plus)] bg-black/60 text-5xl font-black text-white">{s.leg.name.slice(0, 1)}</div>
        )}
      </div>
      <h2 className="font-display mt-5 text-3xl font-black text-white">{s.leg.name}</h2>
      <p className="mt-1 text-base font-bold text-zinc-300">{s.leg.label}</p>
      <div className="tabular mt-5 text-7xl font-black text-white" data-testid="sweat-value">
        {s.leg.valueText}
        {s.leg.lineText ? <span className="text-3xl text-zinc-400">/{s.leg.lineText}</span> : null}
      </div>
      <div className="mt-4 h-4 w-full max-w-sm overflow-hidden rounded-full bg-white/10">
        <div className="sweat-fill h-full rounded-full" style={{ width: `${Math.round(Math.max(3, Math.min(100, s.leg.fill > 1 ? s.leg.fill : s.leg.fill * 100)))}%` }} />
      </div>
      <p className="mt-3 text-lg font-black text-[color:var(--plus)]" data-testid="sweat-need">
        {need != null ? `Needs ${need} more ${short}` : s.leg.note || (s.leg.state === "alive" ? "On track" : "Behind")}
      </p>
      <p className="tabular mt-4 text-sm font-bold text-zinc-300" data-testid="sweat-clock">
        {snap ? `${snap.awayAbbr} ${snap.awayScore ?? ""} – ${snap.homeScore ?? ""} ${snap.homeAbbr} · ${snap.detail || snap.clock || "Live"}` : "Live"}
      </p>
      {s.leg.chance != null ? <p className="mt-1 text-[11px] text-zinc-500">Pace estimate {Math.round(s.leg.chance)}%. Not a guarantee.</p> : null}
      <Link href={gameRoute(s.leg.league, s.leg.gameId)} onClick={onClose} className="mt-6 rounded-xl border border-purple-400/60 px-4 py-2 text-sm font-black text-purple-100">
        Open the game
      </Link>
    </div>,
    document.body
  );
}

/** Game page: a pill when one of your parlays is down to its last leg in this game. */
export function SweatPill({ league, id }: { league: string; id: string }) {
  const s = useSweats().find((x) => x.leg.league === league && x.leg.gameId === id);
  if (!s) return null;
  return (
    <button type="button" onClick={() => openSweat(s.leg.pickId)} className="sweat-btn mb-2 w-full rounded-xl px-3 py-2 text-left text-sm font-black text-white" data-testid="sweat-pill">
      💓 Last leg alive: {s.leg.kind === "team" ? s.leg.label : s.leg.name}
      {s.leg.kind === "team" ? (s.leg.value != null ? ` · now ${s.leg.valueText}` : "") : s.leg.value != null && s.leg.lineText ? ` · ${s.leg.valueText} of ${s.leg.lineText}` : s.leg.label ? ` · ${s.leg.label}` : ""}
      {" · Sweat it"}
    </button>
  );
}
