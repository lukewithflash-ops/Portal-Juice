"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLiveHub, type PlayerMoment } from "@/components/LiveHub";
import { headshotFor } from "@/lib/faces";
import type { LiveSnap } from "@/lib/live";
import { legFromPick, TONE_COLOR, type Leg } from "@/lib/motivation";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { tagPlayers } from "@/lib/yourPlayers";

type Ctx = { names: string[]; moment: PlayerMoment | null };
const YP = createContext<Ctx>({ names: [], moment: null });
export const useYourPlayers = () => useContext(YP);

const FRESH_MS = 8000;

/** Logged legs for this game, read off the page's own live snapshot. */
function useGameLegs(gameId: string, snap: LiveSnap | null): Leg[] {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  return useMemo(() => {
    const out: Leg[] = [];
    const seen = new Set<string>();
    for (const p of picks) {
      if (p.status !== "open" || p.gameId !== gameId || !p.market) continue;
      const leg = legFromPick(p, snap);
      if (!leg || seen.has(leg.pickId)) continue;
      seen.add(leg.pickId);
      out.push(leg);
    }
    return out;
  }, [picks, gameId, snap]);
}

/** Wraps the live area so play rows can tag your players and light up on a moment. */
export function YourPlayersProvider({ league, gameId, snap, children }: { league: string; gameId: string; snap: LiveSnap | null; children: React.ReactNode }) {
  const legs = useGameLegs(gameId, snap);
  const { moments } = useLiveHub();
  const raw = moments[`${league}/${gameId}`] ?? null;
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!raw) return;
    const a = requestAnimationFrame(() => setNow(Date.now()));
    const t = setTimeout(() => setNow(Date.now()), FRESH_MS + 50);
    return () => {
      cancelAnimationFrame(a);
      clearTimeout(t);
    };
  }, [raw]);
  const moment = raw && now - raw.at < FRESH_MS ? raw : null;
  const names = useMemo(() => [...new Set(legs.map((l) => l.name))], [legs]);
  const value = useMemo(() => ({ names, moment }), [names, moment]);
  return (
    <YP.Provider value={value}>
      <Rail league={league} legs={legs} moment={moment} />
      {children}
    </YP.Provider>
  );
}

/** Pinned row of your players in this game: face, live number vs line, how far to hit. */
function Rail({ league, legs, moment }: { league: string; legs: Leg[]; moment: PlayerMoment | null }) {
  if (!legs.length) return null;
  return (
    <section
      aria-label="Your players"
      className="sticky top-[calc(6.6rem+env(safe-area-inset-top)+var(--live-h,0px))] z-20 -mx-4 mb-3 border-b border-[color:var(--gold)]/25 bg-[#030306]/92 px-4 py-2 backdrop-blur"
    >
      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] tone-gold">⭐ Your players</div>
      <ul className="flex gap-2 overflow-x-auto pb-0.5">
        {legs.map((l) => {
          const color = TONE_COLOR[l.tone];
          const face = headshotFor(league, l.athleteId);
          const hot = moment?.pickId === l.pickId;
          const toHit = l.value !== null ? Math.max(0, Math.round((l.line - l.value) * 10) / 10) : null;
          return (
            <li
              key={l.pickId}
              className={`flex w-[11.5rem] flex-none items-center gap-2 rounded-xl border bg-black/40 px-2 py-1.5 ${hot ? "your-player" : ""}`}
              style={{ borderColor: `color-mix(in srgb, ${color} 55%, transparent)` }}
            >
              <span className={`relative flex-none ${hot ? "your-player-ring" : ""}`}>
                {face ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={face} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" style={{ border: `1.5px solid ${color}` }} referrerPolicy="no-referrer" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[11px] font-black text-white" style={{ border: `1.5px solid ${color}` }}>
                    {l.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-bold text-[color:var(--flat)]">{l.name}</span>
                <span className="tabular block truncate text-[11px] font-black" style={{ color }}>
                  {l.value ?? "—"} of {l.line}
                  <span className="font-semibold text-zinc-400">
                    {" "}
                    {l.status === "cleared" ? "· Hit!" : l.status === "waiting" ? `· ${l.market}` : l.side === "Under" ? `· ${l.market} under` : toHit !== null ? `· ${toHit} to hit` : ""}
                  </span>
                </span>
                <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full" style={{ width: `${l.fill}%`, background: color, transition: "width 700ms ease" }} />
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Play text with your players tagged in gold. */
export function TaggedText({ text }: { text: string }) {
  const { names } = useYourPlayers();
  if (!names.length) return <>{text}</>;
  const parts = tagPlayers(text, names);
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <span key={i} className="yp-tag" title="Your player">
            ⭐{p.tag}
          </span>
        )
      )}
    </>
  );
}

/** Big moment over the hero: ring, face, gain, and how close to the line. */
export function MomentBadge() {
  const { moment } = useYourPlayers();
  if (!moment) return null;
  const face = headshotFor(moment.league, moment.athleteId);
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex justify-center" role="status" aria-live="polite">
      <div className="your-player play-in flex items-center gap-3 rounded-2xl border border-[color:var(--gold)] bg-black/85 px-3 py-2">
        <span className="your-player-ring relative flex-none">
          {face ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={face} alt="" width={48} height={48} className="h-12 w-12 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-xl">⭐</span>
          )}
        </span>
        <span>
          <span className="block text-[10px] font-black uppercase tracking-[0.25em] tone-gold">Your player</span>
          <span className="block text-base font-black text-white">
            {moment.name} <span className="tone-gold">+{moment.gain} toward the line</span>
          </span>
          <span className="block text-[12px] text-zinc-300">{moment.body}</span>
        </span>
      </div>
    </div>
  );
}
