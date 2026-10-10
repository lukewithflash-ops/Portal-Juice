"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePrefs } from "@/components/Prefs";
import { POLL_ERROR_MS, usePoll } from "@/components/usePoll";
import { gameEvents, legEvents, type GameAlert } from "@/lib/alerts";
import { getAlertPrefs, getServerAlertPrefs, subscribeAlertPrefs } from "@/lib/alertPrefsStore";
import { getFollows, getServerFollows, subscribeFollows } from "@/lib/follows";
import { isBehind, type LiveSnap } from "@/lib/live";
import { groupSlips, legFromPick, type Leg, type SlipLive } from "@/lib/motivation";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { syncPush } from "@/lib/pushClient";
import { addToInbox } from "@/lib/inbox";
import { headshotFor } from "@/lib/faces";
import type { ScoreRow } from "@/lib/slate";

/** Banner, slips, and updates: 15s while one of your games is live, 60s otherwise. */
const HUB_LIVE_MS = 15_000;
const HUB_IDLE_MS = 60_000;
const MAX_GAMES = 8;
/** Basketball scores move every few seconds. One score update a minute per game. */
const SCORE_GAP_MS = 60_000;
const PLAYER_GAP_MS = 90_000;
const TICK_MS = 60_000;

export type HubReason = "props" | "follow" | "team";

export type HubGame = {
  key: string;
  league: string;
  id: string;
  fav: boolean;
  reasons: HubReason[];
  snap: LiveSnap | null;
  row: ScoreRow | null;
  legs: Leg[];
};

type Toast = GameAlert & { at: number };

export type PlayerMoment = NonNullable<GameAlert["player"]> & { at: number; body: string };

type Hub = {
  /** Latest "Your player" moment per game key (league/id). */
  moments: Record<string, PlayerMoment>;
  /** Live games that matter to you: your props first, then your team, then games you follow. */
  live: HubGame[];
  legs: Leg[];
  slips: SlipLive[];
  snaps: Record<string, LiveSnap>;
};

const Ctx = createContext<Hub>({ moments: {}, live: [], legs: [], slips: [], snaps: {} });
export const useLiveHub = () => useContext(Ctx);

const keyOf = (league: string, id: string) => `${league}/${id}`;

export function LiveHubProvider({ children }: { children: React.ReactNode }) {
  const { team } = usePrefs();
  const pathname = usePathname();
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const follows = useSyncExternalStore(subscribeFollows, getFollows, getServerFollows);
  const prefs = useSyncExternalStore(subscribeAlertPrefs, getAlertPrefs, getServerAlertPrefs);
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [snaps, setSnaps] = useState<Record<string, LiveSnap>>({});
  const [prevSnaps, setPrevSnaps] = useState<Record<string, LiveSnap>>({});
  const [party, setParty] = useState<{ id: string; leg: Leg } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [moments, setMoments] = useState<Record<string, PlayerMoment>>({});
  const fired = useRef<Set<string>>(new Set());
  const lastScore = useRef<Record<string, number>>({});
  const lastPlayer = useRef<Record<string, number>>({});

  const open = useMemo(
    () => picks.filter((p) => p.status === "open" && p.gameId && p.league && p.market),
    [picks]
  );

  const favRow = useMemo(() => {
    if (!team) return null;
    return (
      rows.find(
        (r) =>
          r.league === team.league &&
          (r.awayAbbr === team.abbr || r.homeAbbr === team.abbr || r.awayId === team.id || r.homeId === team.id)
      ) ?? null
    );
  }, [rows, team]);

  const state = useRef({ open, follows, snaps, prefs, pathname });
  useEffect(() => {
    state.current = { open, follows, snaps, prefs, pathname };
  });

  /** Queue updates that pass your settings. Each event fires once. */
  const push = useRef((alerts: GameAlert[]) => {
    const { prefs: on, pathname: here } = state.current;
    const now = Date.now();
    const out: Toast[] = [];
    for (const a of alerts) {
      if (!on[a.kind] || fired.current.has(a.key)) continue;
      fired.current.add(a.key);
      // The game page already shows its own scores and big plays.
      if ((a.kind === "score" || a.kind === "big") && here === a.url) continue;
      if (a.kind === "player" && a.player) {
        const last = lastPlayer.current[a.player.pickId] ?? 0;
        if (now - last < PLAYER_GAP_MS) continue;
        lastPlayer.current[a.player.pickId] = now;
      }
      if (a.kind === "score") {
        const last = lastScore.current[a.url] ?? 0;
        if (/\/(nba|wnba|ncaab)\//.test(a.url) && now - last < SCORE_GAP_MS) continue;
        lastScore.current[a.url] = now;
      }
      out.push({ ...a, at: now });
    }
    if (out.length) {
      const moments = out.filter((a) => a.kind === "player" && a.player);
      if (moments.length) {
        setMoments((m) => {
          const next = { ...m };
          for (const a of moments) {
            const k = a.url.replace(/^\/games\//, "");
            next[k] = { ...(a.player as NonNullable<GameAlert["player"]>), at: a.at, body: a.body };
          }
          return next;
        });
      }
      setToasts((t) => [...out, ...t].slice(0, 3));
      addToInbox(out.map((a) => ({ key: a.key, kind: a.kind, title: a.title, body: a.body, url: a.url, at: a.at })));
    }
  });

  const pickKey = open.map((p) => keyOf(p.league as string, p.gameId as string)).sort().join(",");
  const followKey = follows.map((f) => keyOf(f.league, f.id)).sort().join(",");

  usePoll(async (signal) => {
    const res = await fetch("/api/scores", { cache: "no-store", signal });
    let board: ScoreRow[] = [];
    if (res.ok) {
      board = ((await res.json()) as { scores: ScoreRow[] }).scores;
      setRows(board);
    }
    const { open: legsOpen, follows: starred, snaps: had } = state.current;
    const fav = team
      ? board.find(
          (r) =>
            r.league === team.league &&
            (r.awayAbbr === team.abbr || r.homeAbbr === team.abbr || r.awayId === team.id || r.homeId === team.id)
        )
      : null;
    const targets: { league: string; id: string }[] = [];
    const add = (league: string, id: string) => {
      if (targets.length >= MAX_GAMES || targets.some((t) => t.league === league && t.id === id)) return;
      const prior = had[keyOf(league, id)];
      const row = board.find((r) => r.id === id);
      // Finished games settle once; games not started are read once until the scoreboard says live.
      if (prior?.state === "post" && (!row || row.state === "post")) return;
      if (prior && prior.state === "pre" && (!row || row.state === "pre")) return;
      targets.push({ league, id });
    };
    for (const p of legsOpen) add(p.league as string, p.gameId as string);
    if (fav && fav.state !== "pre") add(fav.league, fav.id);
    for (const f of starred) add(f.league, f.id);
    const pulled = await Promise.all(
      targets.map(async (t) => {
        try {
          const r = await fetch(`/api/live/${t.league}/${t.id}`, { cache: "no-store", signal });
          return r.ok ? ([t, (await r.json()) as LiveSnap] as const) : null;
        } catch {
          return null;
        }
      })
    );
    const next = { ...had };
    const alerts: GameAlert[] = [];
    let changed = false;
    for (const item of pulled) {
      if (!item) continue;
      const [t, snap] = item;
      const k = keyOf(t.league, t.id);
      if (isBehind(snap, had[k] ?? null)) continue;
      alerts.push(...gameEvents(t.league, t.id, had[k] ?? null, snap));
      next[k] = snap;
      changed = true;
    }
    if (changed) {
      setPrevSnaps(had);
      setSnaps(next);
    }
    if (alerts.length) push.current(alerts);
    if (!res.ok) return POLL_ERROR_MS;
    const anyLive = Object.values(next).some((s) => s.state === "in") || fav?.state === "in";
    return anyLive ? HUB_LIVE_MS : HUB_IDLE_MS;
  }, "hub:" + (team ? team.league + team.abbr : "") + "|" + pickKey + "|" + followKey);

  const legs = useMemo(() => {
    const out: Leg[] = [];
    for (const p of open) {
      const k = keyOf(p.league as string, p.gameId as string);
      const before = prevSnaps[k] ? legFromPick(p, prevSnaps[k])?.value ?? null : null;
      const leg = legFromPick(p, snaps[k] ?? null, before);
      if (leg) out.push(leg);
    }
    return out;
  }, [open, snaps, prevSnaps]);

  // Leg updates: close calls and clears, only on a change we watched happen.
  const lastLegs = useRef<Record<string, Leg>>({});
  useEffect(() => {
    const alerts: GameAlert[] = [];
    let cleared: Leg | null = null;
    for (const l of legs) {
      const was = lastLegs.current[l.pickId] ?? null;
      lastLegs.current[l.pickId] = l;
      const ev = legEvents(was, l);
      alerts.push(...ev);
      if (ev.some((e) => e.kind === "cleared")) cleared = l;
    }
    const { prefs: on } = state.current;
    const raf = requestAnimationFrame(() => {
      if (cleared && on.cleared) setParty({ id: cleared.pickId + Date.now(), leg: cleared });
      if (alerts.length) push.current(alerts.filter((a) => a.kind !== "cleared"));
      for (const a of alerts)
        if (a.kind === "cleared" && !fired.current.has(a.key)) {
          fired.current.add(a.key);
          addToInbox([{ key: a.key, kind: a.kind, title: a.title, body: a.body, url: a.url, at: Date.now() }]);
        }
    });
    return () => cancelAnimationFrame(raf);
  }, [legs]);

  useEffect(() => {
    if (!party) return;
    const t = setTimeout(() => setParty(null), 4300);
    return () => clearTimeout(t);
  }, [party]);

  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => setToasts((list) => list.filter((x) => Date.now() - x.at < 5500)), 6000);
    return () => clearTimeout(t);
  }, [toasts]);

  // Keep closed-app push in step with what you track.
  const teamKey = team ? `${team.league}:${team.abbr}` : "";
  useEffect(() => {
    const t = setTimeout(() => {
      syncPush().catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [pickKey, followKey, teamKey, prefs]);

  const live = useMemo(() => {
    const out: HubGame[] = [];
    const add = (league: string, id: string, reason: HubReason) => {
      const k = keyOf(league, id);
      const have = out.find((g) => g.key === k);
      if (have) {
        if (!have.reasons.includes(reason)) have.reasons.push(reason);
        if (reason === "team") have.fav = true;
        return;
      }
      const snap = snaps[k] ?? null;
      const row = rows.find((r) => r.id === id) ?? null;
      const st = snap?.state ?? row?.state;
      if (st !== "in") return;
      out.push({ key: k, league, id, fav: reason === "team", reasons: [reason], snap, row, legs: legs.filter((l) => l.league === league && l.gameId === id) });
    };
    for (const l of legs) add(l.league, l.gameId, "props");
    if (favRow) add(favRow.league, favRow.id, "team");
    for (const f of follows) add(f.league, f.id, "follow");
    return out;
  }, [favRow, legs, rows, snaps, follows]);

  const slips = useMemo(() => groupSlips(legs), [legs]);
  const value = useMemo<Hub>(() => ({ moments, live, legs, slips, snaps }), [moments, live, legs, slips, snaps]);

  // Closed-app push needs a server check. While the app is open, nudge it (the server throttles to one a minute).
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/push/tick", { method: "POST", keepalive: true }).catch(() => {});
    };
    const first = setTimeout(tick, 5000);
    const id = setInterval(tick, TICK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  return (
    <Ctx.Provider value={value}>
      {children}
      {party ? <ClearedParty key={party.id} leg={party.leg} /> : null}
      {toasts.length ? (
        <div className="pointer-events-none fixed inset-x-3 bottom-4 z-[55] mx-auto max-w-md space-y-2" aria-live="polite">
          {toasts.map((t) =>
            t.kind === "player" && t.player ? (
              <PlayerToast key={t.key} t={t} />
            ) : (
            <a
              key={t.key}
              href={t.url}
              className="portal-toast play-in pointer-events-auto flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm text-[color:var(--flat)]"
              style={{
                ["--glow" as string]: t.kind === "close" || t.kind === "cleared" ? "var(--gold)" : t.kind === "lead" || t.kind === "big" ? "var(--plus)" : "#a855f7",
                borderColor: t.kind === "close" || t.kind === "cleared" ? "var(--gold)" : t.kind === "lead" || t.kind === "big" ? "var(--plus)" : "rgba(255,255,255,0.2)",
              }}
            >
              <span className="portal-ring" aria-hidden />
              <span className="min-w-0">
                <span className="block font-black" style={{ color: t.kind === "close" || t.kind === "cleared" ? "var(--gold)" : undefined }}>
                  {ICON[t.kind]} {t.title}
                </span>
                <span className="block text-xs text-zinc-300">{t.body}</span>
              </span>
            </a>
            )
          )}
        </div>
      ) : null}
    </Ctx.Provider>
  );
}

const ICON: Record<GameAlert["kind"], string> = { score: "🔢", lead: "🔁", big: "💥", close: "🔥", cleared: "🟡", final: "🏁", player: "⭐" };

/** "Your player" moment: gold ring around the face, the gain, and how close to the line. */
function PlayerToast({ t }: { t: Toast }) {
  const p = t.player!;
  const face = headshotFor(p.league, p.athleteId);
  return (
    <a
      href={t.url}
      className="your-player play-in pointer-events-auto flex items-center gap-3 rounded-2xl border px-3 py-2 text-sm text-[color:var(--flat)] shadow-lg"
      style={{ background: "rgba(14,10,4,0.97)", borderColor: "var(--gold)" }}
    >
      <span className="your-player-ring relative flex-none">
        {face ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={face} alt={p.name} width={44} height={44} className="h-11 w-11 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black text-lg">⭐</span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-black uppercase tracking-[0.2em] tone-gold">Your player</span>
        <span className="block truncate font-black">
          {p.name} <span className="tone-gold">+{p.gain}</span>
        </span>
        <span className="block truncate text-[12px] text-zinc-300">{t.body}</span>
      </span>
    </a>
  );
}

const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2;
  const r = 90 + (i % 3) * 30;
  return { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r), rot: i * 47, delay: (i % 4) * 40 };
});

/** Full-width cleared moment. Reuses the big-play cinema look. */
function ClearedParty({ leg }: { leg: Leg }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-3 top-[calc(7rem+env(safe-area-inset-top))] z-[60] mx-auto h-44 max-w-xl overflow-hidden rounded-2xl"
      role="status"
      aria-live="polite"
    >
      <div className="cinema" style={{ ["--team" as string]: "#b8860b" } as React.CSSProperties}>
        <div className="cinema-wipe" />
        {SPARKS.map((s, i) => (
          <span
            key={i}
            className="spark"
            style={
              {
                background: i % 2 ? "#f5c542" : "#fff",
                ["--dx" as string]: s.dx + "px",
                ["--dy" as string]: s.dy + "px",
                ["--rot" as string]: s.rot + "deg",
                animationDelay: 200 + s.delay + "ms",
              } as React.CSSProperties
            }
          />
        ))}
        <div className="cinema-copy">
          <div className="text-[11px] font-black uppercase tracking-[0.3em] text-white/85">🏆 Leg cleared</div>
          <div className="cinema-name">{leg.name}</div>
          <p className="mt-1 text-sm font-semibold text-white/90">
            {leg.side} {leg.line} {leg.market} · {leg.value ?? ""}
          </p>
          <span className="cinema-stamp">Hit!</span>
        </div>
      </div>
    </div>
  );
}
