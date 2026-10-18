"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLiveHub } from "@/components/LiveHub";
import FollowStar from "@/components/FollowStar";
import { LiveNotes, NoteSnippet, NoteTag, ParlayNotes } from "@/components/Notes";
import { matchupKey } from "@/lib/notesCore";
import AllLive, { useAllLive } from "@/components/AllLive";
import { gameRoute } from "@/lib/gameRoute";
import { getFollows, getServerFollows, subscribeFollows } from "@/lib/follows";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { PickActions } from "@/components/PickEdit";
import { openSweat } from "@/components/SweatMode";
import { QuestStrip } from "@/components/Quests";
import FriendFeed from "@/components/FriendFeed";
import { sweatOf } from "@/lib/sweat";
import { slipKeyOf, TONE_COLOR } from "@/lib/motivation";
import { fieldGeom } from "@/lib/fieldGeom";
import { mentions, shortName } from "@/lib/yourPlayers";
import type { LiveSnap } from "@/lib/live";
import type { ScoreRow } from "@/lib/slate";
import {
  buildFeed,
  buildGames,
  fmtStart,
  groupViews,
  legViews,
  type FeedItem,
  type GameView,
  type LegState,
  type LegView,
  type SlipView,
} from "@/lib/myLive";

const VIEW_KEY = "pj-mylive-view";
const TAB_KEY = "pj-mylive-tab";
const FOOTBALL = new Set(["nfl", "ncaaf"]);
const noop = () => () => {};

const STAMP: Record<LegState, string> = {
  hit: "Hit!",
  missed: "Missed",
  push: "Push",
  alive: "Alive",
  behind: "Behind",
  waiting: "Not started",
  "no-match": "No match",
};
const STATE_COLOR: Record<LegState, string> = {
  hit: "var(--gold)",
  missed: "var(--minus)",
  push: "#a1a1aa",
  alive: "var(--plus)",
  behind: "var(--minus)",
  waiting: "#a1a1aa",
  "no-match": "#a1a1aa",
};
const WLP: Partial<Record<LegState, string>> = { hit: "W", missed: "L", push: "P" };

/** Lift very dark team colors so they read on black. */
function lift(hex: string | null | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return "#7c3aed";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 >= 0.2) return "#" + m[1];
  const f = (c: number) => Math.round(c + (255 - c) * 0.5);
  return "#" + ((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1);
}

type Teams = { awayAbbr: string; homeAbbr: string; awayScore: string; homeScore: string; awayColor: string; homeColor: string; detail: string };

function teamsOf(snap: LiveSnap | null, row: ScoreRow | null): Teams {
  return {
    awayAbbr: snap?.awayAbbr ?? row?.awayAbbr ?? "AWAY",
    homeAbbr: snap?.homeAbbr ?? row?.homeAbbr ?? "HOME",
    awayScore: snap?.awayScore ?? row?.awayScore ?? "0",
    homeScore: snap?.homeScore ?? row?.homeScore ?? "0",
    awayColor: lift(snap?.awayColor),
    homeColor: lift(snap?.homeColor),
    detail: snap?.detail || row?.detail || "",
  };
}

function statusText(g: GameView | undefined, now: Date): string {
  if (!g) return "";
  const t = teamsOf(g.snap, g.row);
  if (g.state === "pre") return fmtStart(g.start, now);
  if (g.state === "post") return /final/i.test(t.detail) ? t.detail : "Final";
  return t.detail || "Live";
}

export default function MyLive() {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const follows = useSyncExternalStore(subscribeFollows, getFollows, getServerFollows);
  const { snaps, legs: hubLegs, rows, favRow, pulledAt } = useLiveHub();
  const [compact, setCompact] = useState(false);
  const [seen, setSeen] = useState<Record<string, number>>({});
  const [tab, setTabState] = useState<"mine" | "all">("mine");
  const all = useAllLive(tab === "all");
  const setTab = (t: "mine" | "all") => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
      history.replaceState(null, "", t === "all" ? "#all" : location.pathname);
    } catch {
      /* private mode */
    }
  };

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        setCompact(localStorage.getItem(VIEW_KEY) === "compact");
        setTabState(location.hash === "#all" ? "all" : location.hash === "#mine" ? "mine" : localStorage.getItem(TAB_KEY) === "all" ? "all" : "mine");
      } catch {
        /* private mode */
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);
  const setView = (c: boolean) => {
    setCompact(c);
    try {
      localStorage.setItem(VIEW_KEY, c ? "compact" : "full");
    } catch {
      /* private mode */
    }
  };

  // The clock only matters for "today" and start times; it moves with each pull.
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setClock(Date.now()));
    return () => cancelAnimationFrame(id);
  }, []);
  const now = useMemo(() => new Date(Math.max(pulledAt, clock)), [pulledAt, clock]);

  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const mine = useMemo(() => picks.filter((p) => p.status === "open" || p.date === today), [picks, today]);
  const unlinked = useMemo(() => picks.filter((p) => p.status === "open" && !(p.gameId && p.league)).length, [picks]);

  const legs = useMemo(() => legViews(mine, snaps, hubLegs, slipKeyOf), [mine, snaps, hubLegs]);
  const games = useMemo(() => buildGames({ picks: mine, follows, favRow, rows, snaps, legs, now }), [mine, follows, favRow, rows, snaps, legs, now]);
  const byKey = useMemo(() => {
    const m: Record<string, GameView> = {};
    for (const g of [...games.live, ...games.later, ...games.final]) m[g.key] = g;
    return m;
  }, [games]);
  const states = useMemo(() => {
    const m: Record<string, "pre" | "in" | "post" | undefined> = {};
    for (const l of legs) m[l.key] = byKey[l.key]?.state ?? snaps[l.key]?.state;
    return m;
  }, [legs, byKey, snaps]);
  const slips = useMemo(() => groupViews(legs, states), [legs, states]);
  const openSlips = slips.filter((s) => s.rank < 2);
  const doneSlips = slips.filter((s) => s.rank === 2);
  const feedRaw = useMemo(() => buildFeed([...games.live, ...games.final]), [games]);

  // First time each play shows up, so the feed reads newest first across games.
  useEffect(() => {
    const fresh = feedRaw.filter((f) => !(f.id in seen));
    if (!fresh.length) return;
    const id = requestAnimationFrame(() => {
      const t = Date.now();
      setSeen((s) => {
        const next = { ...s };
        for (const f of fresh) if (!(f.id in next)) next[f.id] = t;
        return next;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [feedRaw, seen]);
  const feed = useMemo(
    () => [...feedRaw].sort((a, b) => (seen[b.id] ?? Infinity) - (seen[a.id] ?? Infinity) || Number(b.mine) - Number(a.mine) || b.order - a.order).slice(0, 14),
    [feedRaw, seen]
  );

  const liveLegs = legs.filter((l) => states[l.key] === "in" && (l.state === "alive" || l.state === "behind" || l.state === "waiting")).length;
  const empty = !games.live.length && !games.later.length && !games.final.length && !slips.length;

  if (!ready || !clock) {
    return <div className="mt-4 h-40 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" aria-hidden />;
  }

  const tabs = (
    <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/50 p-1" role="tablist" aria-label="My Live views">
      <button type="button" role="tab" aria-selected={tab === "mine"} onClick={() => setTab("mine")} className={"rounded-lg py-1.5 text-[13px] font-black " + (tab === "mine" ? "bg-purple-500/30 text-white shadow-[inset_0_-2px_0_var(--plus)]" : "text-zinc-400")}>
        My games{games.live.length ? <span className="tabular ml-1 text-[color:var(--plus)]">{games.live.length}</span> : null}
      </button>
      <button type="button" role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")} className={"rounded-lg py-1.5 text-[13px] font-black " + (tab === "all" ? "bg-purple-500/30 text-white shadow-[inset_0_-2px_0_var(--plus)]" : "text-zinc-400")} data-testid="tab-all">
        All live{all ? <span className="tabular ml-1 text-[color:var(--plus)]">{all.games.length}</span> : null}
      </button>
    </div>
  );

  if (tab === "all") {
    return (
      <div className="my-live" data-testid="my-live">
        {tabs}
        <AllLive data={all} />
      </div>
    );
  }

  return (
    <div className="my-live" data-testid="my-live">
      <QuestStrip />
      {tabs}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Stat n={games.live.length} label="live" color="var(--plus)" dot />
        <Stat n={games.later.length} label="later" color="#c084fc" />
        <Stat n={games.final.length} label="final" color="#a1a1aa" />
        {legs.length ? <Stat n={liveLegs} label={liveLegs === 1 ? "leg in play" : "legs in play"} color="var(--gold)" /> : null}
        <div className="ml-auto flex shrink-0 overflow-hidden rounded-lg border border-white/15 text-[11px] font-black" role="group" aria-label="Layout">
          <button type="button" aria-pressed={!compact} onClick={() => setView(false)} className={"px-2.5 py-1 " + (!compact ? "bg-purple-500/30 text-white" : "text-zinc-400")}>
            Full
          </button>
          <button type="button" aria-pressed={compact} onClick={() => setView(true)} className={"px-2.5 py-1 " + (compact ? "bg-purple-500/30 text-white" : "text-zinc-400")}>
            Compact
          </button>
        </div>
      </div>

      {empty ? (
        <EmptyState unlinked={unlinked} />
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-5">
          <div className="lg:col-start-1 lg:row-start-1">
            {games.live.length ? (
              <Section title="Live now" count={games.live.length} live>
                <div className={compact ? "grid grid-cols-2 gap-1.5 sm:grid-cols-3" : "grid gap-2 sm:grid-cols-2"}>
                  {games.live.map((g) => (
                    <LiveTile key={g.key} g={g} compact={compact} now={now} />
                  ))}
                </div>
              </Section>
            ) : (
              <p className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-400">
                None of your games are live right now.{games.later.length ? " Next up below." : ""}
              </p>
            )}
          </div>

          <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
            {openSlips.length ? (
              <Section title="Your picks" count={openSlips.reduce((n, s) => n + s.total, 0)} sub="Open legs from your Log, live against the line">
                <div className="space-y-2">
                  {openSlips.map((s) => (
                    <SlipBox key={s.key} slip={s} byKey={byKey} now={now} compact={compact} />
                  ))}
                </div>
              </Section>
            ) : null}
            {unlinked ? (
              <p className="mb-4 text-[11px] text-zinc-500">
                {unlinked} open {unlinked === 1 ? "pick isn't" : "picks aren't"} tied to a game, so {unlinked === 1 ? "it" : "they"} can&apos;t track live.{" "}
                <Link href="/lines/portfolio" className="font-bold text-[color:var(--gold)]">
                  Log →
                </Link>
              </p>
            ) : null}
            <Section title="Live feed" sub="Your players, plus big plays in games you follow">
              {feed.length ? (
                <ul className="space-y-1.5">
                  {feed.map((f) => (
                    <FeedRow key={f.id} f={f} snap={snaps[f.gameKey] ?? null} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-zinc-400">
                  Quiet so far. Plays by players on your picks, and touchdowns, goals, turnovers and home runs in games you follow, land here.
                </p>
              )}
            </Section>
            <FriendFeed compact />
          </div>

          <div className="lg:col-start-1 lg:row-start-2">
            {games.later.length ? (
              <Section title="Coming up" count={games.later.length} sub="Start times in your time zone">
                <div className={compact ? "grid grid-cols-2 gap-1.5 sm:grid-cols-3" : "grid gap-2 sm:grid-cols-2"}>
                  {games.later.map((g) => (
                    <LiveTile key={g.key} g={g} compact={compact} now={now} />
                  ))}
                </div>
              </Section>
            ) : null}
            {games.final.length ? (
              <Section title="Final today" count={games.final.length} sub="Graded from the final box score">
                <div className={compact ? "grid grid-cols-2 gap-1.5 sm:grid-cols-3" : "grid gap-2 sm:grid-cols-2"}>
                  {games.final.map((g) => (
                    <LiveTile key={g.key} g={g} compact={compact} now={now} />
                  ))}
                </div>
              </Section>
            ) : null}
            {doneSlips.length ? (
              <Section title="Settled picks" count={doneSlips.reduce((n, s) => n + s.total, 0)}>
                <div className="space-y-2">
                  {doneSlips.map((s) => (
                    <SlipBox key={s.key} slip={s} byKey={byKey} now={now} compact />
                  ))}
                </div>
              </Section>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ n, label, color, dot = false }: { n: number; label: string; color: string; dot?: boolean }) {
  return (
    <span className="tabular inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[12px] font-black" style={{ color }}>
      {dot && n > 0 ? <span className="tv-live-dot" aria-hidden /> : null}
      {n} <span className="font-semibold text-zinc-400">{label}</span>
    </span>
  );
}

function Section({ title, count, sub, live = false, children }: { title: string; count?: number; sub?: string; live?: boolean; children: React.ReactNode }) {
  return (
    <section className="mb-5" aria-label={title}>
      <div className="mb-1.5 flex items-baseline gap-2">
        <h2 className="font-display shrink-0 whitespace-nowrap text-[13px] font-black uppercase tracking-[0.18em] text-white">
          {live ? <span className="tv-live-dot mr-1.5 inline-block align-middle" aria-hidden /> : null}
          {title}
        </h2>
        {count != null ? <span className="tabular text-[12px] font-black text-[color:var(--gold)]">{count}</span> : null}
        {sub ? <span className="min-w-0 truncate text-[11px] text-zinc-500">{sub}</span> : null}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ unlinked }: { unlinked: number }) {
  return (
    <div className="ml-empty rounded-2xl border border-purple-500/30 bg-black/50 px-4 py-6 text-center">
      <div className="text-3xl" aria-hidden>
        📡
      </div>
      <p className="mt-2 font-display text-lg font-black text-white">Nothing to watch yet</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-400">
        Log a pick tied to a game, star a game, or pick your team. Live scores, your legs and the plays that matter to you all show up here.
      </p>
      {unlinked ? <p className="mt-1 text-[12px] text-zinc-500">{unlinked} open picks in your Log aren&apos;t tied to a game.</p> : null}
      <div className="mt-4 flex justify-center gap-2">
        <Link href="/lines/portfolio" className="rounded-xl border border-[color:var(--gold)] px-4 py-2 text-sm font-black text-[color:var(--gold)]">
          Log a pick
        </Link>
        <Link href="/games" className="rounded-xl border border-[color:var(--plus)] px-4 py-2 text-sm font-black text-[color:var(--plus)]">
          Games
        </Link>
      </div>
    </div>
  );
}

function LiveTile({ g, compact, now }: { g: GameView; compact: boolean; now: Date }) {
  const [noting, setNoting] = useState(false);
  const s = g.snap;
  const t = teamsOf(s, g.row);
  const href = gameRoute(g.league, g.id);
  const live = g.state === "in";
  const final = g.state === "post";
  const a = Number(t.awayScore) || 0;
  const h = Number(t.homeScore) || 0;
  const football = FOOTBALL.has(g.league);
  const offense = live && s ? (football ? s.situation?.teamId ?? null : g.league === "mlb" && s.bug?.half ? (s.bug.half === "top" ? s.awayId : s.homeId) : null) : null;
  const awayBall = !!offense && offense === s?.awayId;
  const homeBall = !!offense && offense === s?.homeId;
  const homeWin = live && s?.homeWin != null ? Math.round(s.homeWin) : null;
  const last = live && s?.plays.length ? s.plays[s.plays.length - 1] : null;
  const hit = g.legs.filter((l) => l.state === "hit").length;
  // A logged player is in the latest play: the tile gets the gold portal glow.
  const mineLeg = last?.text ? g.legs.find((l) => mentions(last.text!, l.name)) ?? null : null;
  const followed = g.reasons.includes("follow");
  const label = `${t.awayAbbr} at ${t.homeAbbr}`;

  return (
    <div
      className={"ml-tile relative overflow-hidden rounded-xl border text-white " + (final ? "opacity-90" : "") + (mineLeg ? " mylive-mine" : "")}
      style={{
        borderColor: live ? t.homeColor : "rgba(255,255,255,0.14)",
        background: live
          ? `linear-gradient(110deg, color-mix(in srgb, ${t.awayColor} 26%, #06050c) 0%, #06050c 50%, color-mix(in srgb, ${t.homeColor} 26%, #06050c) 100%)`
          : "rgba(8,7,14,0.9)",
        boxShadow: live ? `0 6px 20px -10px ${t.homeColor}` : undefined,
      }}
      data-testid="ml-tile"
      data-state={g.state}
      data-mine={mineLeg ? "1" : undefined}
    >
      <Link href={href} className="block px-2.5 pb-2 pt-1.5" aria-label={`Open ${label}`}>
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
          <span className="rounded bg-white/10 px-1 py-px text-zinc-300">{g.league}</span>
          {live ? <span className="tv-live-dot shrink-0" aria-hidden /> : null}
          <span className={"tabular min-w-0 truncate " + (live ? "text-white" : final ? "text-zinc-400" : "text-purple-300")}>{statusText(g, now)}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1 pr-6">
            <NoteTag matchup={matchupKey(g.league, t.awayAbbr, t.homeAbbr)} label={`${t.awayAbbr} vs ${t.homeAbbr}`} />
            {g.reasons.includes("team") ? <span className="text-white/80">Team</span> : null}
            {g.legs.length ? (
              <span className="rounded-full bg-black/40 px-1.5 py-px" style={{ color: hit ? "var(--gold)" : "#fff" }}>
                {g.state === "pre" ? `${g.legs.length} ${g.legs.length === 1 ? "pick" : "picks"}` : final ? `${hit}/${g.legs.length}` : `${hit}/${g.legs.length} hit`}
              </span>
            ) : null}
          </span>
        </div>
        <div className={"tabular mt-1 grid grid-cols-[1fr_auto] items-center gap-x-2 " + (compact ? "text-[14px]" : "text-[17px]")}>
          <TeamLine abbr={t.awayAbbr} color={t.awayColor} ball={awayBall} football={football} lead={g.state !== "pre" && a > h} />
          <span className={"text-right font-black " + (g.state !== "pre" && a < h && final ? "text-zinc-500" : "")}>{g.state === "pre" ? "" : t.awayScore}</span>
          <TeamLine abbr={t.homeAbbr} color={t.homeColor} ball={homeBall} football={football} lead={g.state !== "pre" && h > a} />
          <span className={"text-right font-black " + (g.state !== "pre" && h < a && final ? "text-zinc-500" : "")}>{g.state === "pre" ? "" : t.homeScore}</span>
        </div>
        {live && s ? <Situation g={g} snap={s} compact={compact} /> : null}
        {homeWin != null ? <WinBar away={t.awayAbbr} home={t.homeAbbr} awayColor={t.awayColor} homeColor={t.homeColor} homeWin={homeWin} compact={compact} /> : null}
        {mineLeg && compact ? (
          <p className="mt-1 truncate text-[10px] font-black" style={{ color: "var(--gold)" }} data-testid="ml-mine">
            ◎ {shortName(mineLeg.name)} in the last play · {mineLeg.valueText}
            {mineLeg.lineText ? `/${mineLeg.lineText}` : ""}
          </p>
        ) : null}
        {!compact && last?.text ? (
          <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-snug" style={{ color: mineLeg ? "var(--gold)" : "rgba(255,255,255,0.85)" }} data-testid={mineLeg ? "ml-mine" : undefined}>
            {last.text.trim()}
          </p>
        ) : null}
        {g.legs.length ? <TileLegs legs={g.legs} compact={compact} final={final} /> : null}
      </Link>
      <div className="absolute right-1.5 top-1">
        {followed || !g.reasons.includes("picks") ? <FollowStar league={g.league} id={g.id} label={label} /> : null}
      </div>
      {!compact && g.state !== "post" ? (
        <div className="border-t border-white/10 px-2.5 pb-1.5">
          <button type="button" onClick={() => setNoting((v) => !v)} aria-expanded={noting} className="py-1 text-[11px] font-black text-purple-200/90" data-testid="ml-note-toggle">
            {noting ? "Hide notes" : "📝 Live note"}
          </button>
          {noting ? <LiveNotes league={g.league} gameId={g.id} snap={s ?? null} compact /> : null}
        </div>
      ) : null}
    </div>
  );
}

function TeamLine({ abbr, color, ball, football, lead }: { abbr: string; color: string; ball: boolean; football: boolean; lead: boolean }) {
  return (
    <span className={"flex min-w-0 items-center gap-1.5 font-black " + (lead ? "text-white" : "text-white/80")}>
      <span className="h-3 w-1 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span className="truncate">{abbr}</span>
      {ball ? (
        <span className="text-[10px]" style={{ color: "var(--gold)" }} aria-label={football ? "has the ball" : "batting"}>
          {football ? "◆" : "●"}
        </span>
      ) : null}
    </span>
  );
}

function Situation({ g, snap, compact }: { g: GameView; snap: LiveSnap; compact: boolean }) {
  if (snap.tennis) {
    const tn = snap.tennis;
    const live = snap.state === "in" && tn.point && tn.point.away !== null && tn.point.home !== null ? tn.point : null;
    const row = (abbr: string, sets: string[], serving: boolean, pt: string | null) => (
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate">
          {abbr}
          {serving ? <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--plus)] align-middle" aria-label="serving" /> : null}
        </span>
        {sets.map((x, i) => (
          <span key={i} className={"w-4 text-center " + (i === sets.length - 1 ? "text-white" : "text-zinc-400")}>{x}</span>
        ))}
        {pt !== null ? <span className="min-w-[1.4rem] rounded bg-[color:var(--plus)]/15 px-0.5 text-center text-[color:var(--plus)]" data-testid="tennis-point">{pt}</span> : null}
      </div>
    );
    return (
      <div className="tabular mt-1 rounded-md bg-white/[0.04] px-1.5 py-1 text-[11px] font-black text-zinc-200" data-testid="tennis-sets">
        {snap.state === "in" && tn.point?.kind === "tiebreak" ? <p className="text-[9px] uppercase tracking-wider text-[color:var(--plus)]">Tiebreak</p> : null}
        {row(snap.awayAbbr, tn.away, tn.serving === "away", live ? live.away : null)}
        {row(snap.homeAbbr, tn.home, tn.serving === "home", live ? live.home : null)}
        {!compact && tn.event ? <p className="mt-0.5 truncate text-[10px] font-semibold text-zinc-500">{tn.event}</p> : null}
      </div>
    );
  }
  if (FOOTBALL.has(g.league)) {
    const sit = snap.situation;
    if (!sit) return null;
    const abbr = sit.teamId === snap.homeId ? snap.homeAbbr : sit.teamId === snap.awayId ? snap.awayAbbr : "";
    return (
      <div className="mt-1">
        <p className="tabular truncate text-[11px] font-black text-white">
          {abbr ? `${abbr} · ` : ""}
          {compact ? sit.short ?? sit.text : sit.text}
          {sit.redZone ? <span className="ml-1 text-[color:var(--minus)]">RZ</span> : null}
        </p>
        {!compact ? <MiniField snap={snap} /> : null}
      </div>
    );
  }
  if (g.league === "mlb" && snap.bug) {
    const b = snap.bug;
    return (
      <div className="mt-1 flex items-center gap-2">
        <Bases first={b.onFirst} second={b.onSecond} third={b.onThird} />
        <span className="tabular text-[11px] font-black text-white">
          {b.outs ?? 0} out{b.outs === 1 ? "" : "s"}
          {b.balls != null && b.strikes != null ? <span className="ml-1 text-white/60">{b.balls}-{b.strikes}</span> : null}
        </span>
      </div>
    );
  }
  return null;
}

/** Away end zone left, home right (same as the game page). */
function MiniField({ snap }: { snap: LiveSnap }) {
  const sit = snap.situation;
  const side = sit?.teamId === snap.homeId ? "home" : "away";
  const geom = sit?.teamId ? fieldGeom(side, sit.yardsToEndzone, sit.distance) : null;
  const away = lift(snap.awayColor);
  const home = lift(snap.homeColor);
  return (
    <svg viewBox="0 0 120 14" className="mt-1 block h-3.5 w-full" role="img" aria-label={sit?.text ? `Ball: ${sit.text}` : "Field"} preserveAspectRatio="none">
      <rect x="0" y="0" width="120" height="14" rx="2" fill="#0b2a16" />
      <rect x="0" y="0" width="10" height="14" fill={away} opacity="0.75" />
      <rect x="110" y="0" width="10" height="14" fill={home} opacity="0.75" />
      {geom?.redZone && sit?.redZone ? <rect x={geom.redZone.x} y="0" width={geom.redZone.w} height="14" fill="var(--minus)" opacity="0.18" /> : null}
      {[20, 30, 40, 50, 60, 70, 80, 90, 100].map((x) => (
        <line key={x} x1={x} x2={x} y1="0" y2="14" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" />
      ))}
      <line x1="60" x2="60" y1="0" y2="14" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />
      {geom?.first != null ? <line x1={geom.first} x2={geom.first} y1="0" y2="14" stroke="#facc15" strokeWidth="1" /> : null}
      {geom ? (
        <g>
          <ellipse cx={geom.ball} cy="7" rx="2.6" ry="1.9" fill="#d97706" stroke="#fff" strokeWidth="0.5" />
          <path d={geom.dir > 0 ? `M${geom.ball + 3.5} 4.5 L${geom.ball + 6} 7 L${geom.ball + 3.5} 9.5` : `M${geom.ball - 3.5} 4.5 L${geom.ball - 6} 7 L${geom.ball - 3.5} 9.5`} fill="none" stroke="#fff" strokeWidth="0.8" />
        </g>
      ) : null}
    </svg>
  );
}

function Bases({ first, second, third }: { first: boolean; second: boolean; third: boolean }) {
  const on = "var(--gold)";
  const off = "rgba(255,255,255,0.15)";
  const base = (x: number, y: number, f: boolean, name: string) => (
    <rect key={name} x={x - 4} y={y - 4} width="8" height="8" transform={`rotate(45 ${x} ${y})`} fill={f ? on : off} stroke="rgba(255,255,255,0.5)" strokeWidth="0.8">
      <title>{`${name} ${f ? "occupied" : "empty"}`}</title>
    </rect>
  );
  return (
    <svg viewBox="0 0 34 22" className="h-4 w-6 shrink-0" role="img" aria-label={`Runners: ${[first && "1st", second && "2nd", third && "3rd"].filter(Boolean).join(", ") || "none"}`}>
      {base(17, 6, second, "2nd")}
      {base(27, 15, first, "1st")}
      {base(7, 15, third, "3rd")}
    </svg>
  );
}

function WinBar({ away, home, awayColor, homeColor, homeWin, compact }: { away: string; home: string; awayColor: string; homeColor: string; homeWin: number; compact: boolean }) {
  const awayWin = 100 - homeWin;
  return (
    <div className="mt-1.5" title="ESPN win chance">
      {!compact ? (
        <div className="tabular flex justify-between text-[10px] font-black">
          <span style={{ color: awayColor }}>{away} {awayWin}%</span>
          <span className="text-zinc-500">ESPN win chance</span>
          <span style={{ color: homeColor }}>{homeWin}% {home}</span>
        </div>
      ) : (
        <div className="tabular flex justify-between text-[9px] font-black text-white/70">
          <span>{awayWin}%</span>
          <span>{homeWin}%</span>
        </div>
      )}
      <div className="mt-0.5 flex h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div className="ml-bar h-full" style={{ width: awayWin + "%", background: awayColor }} />
        <div className="ml-bar h-full flex-1" style={{ background: homeColor }} />
      </div>
    </div>
  );
}

function TileLegs({ legs, compact, final }: { legs: LegView[]; compact: boolean; final: boolean }) {
  const show = legs.slice(0, compact ? 2 : 4);
  return (
    <div className="mt-1.5 space-y-1 border-t border-white/10 pt-1.5">
      {show.map((l) => (
        <div key={l.pickId} className="min-w-0">
          <div className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="min-w-0 truncate font-bold text-white">
              {compact ? shortName(l.name) : l.name}
              {!compact ? <span className="ml-1 font-semibold text-white/50">{l.label}</span> : null}
            </span>
            <span className="tabular shrink-0 font-black" style={{ color: TONE_COLOR[l.tone] }}>
              {final && WLP[l.state] ? (
                <WlpPill state={l.state} auto={l.auto} />
              ) : (
                <>
                  {l.valueText}
                  {l.lineText ? <span className="font-semibold text-white/50">/{l.lineText}</span> : null}
                  {l.state === "hit" ? " ✓" : ""}
                </>
              )}
            </span>
          </div>
          {!final ? (
            <div className="xp-bar mt-0.5 h-1 overflow-hidden rounded-full">
              <div className="xp-fill h-full rounded-full" style={{ width: l.fill + "%", background: TONE_COLOR[l.tone], color: TONE_COLOR[l.tone] }} />
            </div>
          ) : null}
        </div>
      ))}
      {legs.length > show.length ? <div className="text-[10px] font-bold text-zinc-400">+{legs.length - show.length} more</div> : null}
    </div>
  );
}

function WlpPill({ state, auto }: { state: LegState; auto: boolean }) {
  const w = WLP[state];
  if (!w) return null;
  return (
    <span
      className="inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[11px] font-black text-black"
      style={{ background: STATE_COLOR[state] }}
      title={auto ? "Graded from the final box score" : "From your Log"}
    >
      {w}
    </span>
  );
}

function SlipBox({ slip, byKey, now, compact }: { slip: SlipView; byKey: Record<string, GameView>; now: Date; compact: boolean }) {
  const parlay = slip.total > 1;
  const [open, setOpen] = useState(!compact && slip.total <= 3);
  const border = slip.state === "hit" ? "var(--gold)" : slip.state === "missed" ? "var(--minus)" : slip.rank === 0 ? "var(--plus)" : "rgba(255,255,255,0.14)";
  if (!parlay) {
    const l = slip.legs[0];
    return (
      <div className="rounded-xl border bg-black/50" style={{ borderColor: border }} data-testid="ml-slip">
        <LegRow leg={l} game={byKey[l.key]} now={now} />
        <div className="flex justify-end px-3 pb-2">
          <SlipActions pickIds={[l.pickId]} />
        </div>
      </div>
    );
  }
  const overall = slip.state === "hit" ? "All hit" : slip.state === "missed" ? "Missed" : slip.state === "waiting" ? "Not started" : "Alive";
  return (
    <div className="rounded-xl border bg-black/50" style={{ borderColor: border }} data-testid="ml-slip">
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="font-display text-[13px] font-black text-white">Parlay · {slip.total} legs</span>
            <span className="rounded-full border px-1.5 py-px text-[10px] font-black uppercase tracking-wider" style={{ borderColor: border, color: slip.state === "alive" ? "var(--plus)" : slip.state === "waiting" ? "#a1a1aa" : border }}>
              {overall}
            </span>
          </span>
          <span className="tabular mt-0.5 flex flex-wrap gap-x-2 text-[11px] font-bold">
            <span style={{ color: "var(--gold)" }}>{slip.hit} hit</span>
            {slip.state === "waiting" ? <span className="text-zinc-400">{slip.alive} not started</span> : <span style={{ color: "var(--plus)" }}>{slip.alive} alive</span>}
            <span style={{ color: slip.missed ? "var(--minus)" : "#71717a" }}>{slip.missed} missed</span>
            {slip.push ? <span className="text-zinc-400">{slip.push} push</span> : null}
            {slip.chance != null && slip.state === "alive" ? (
              <span className="text-zinc-400" title="Every leg together. Same-game legs move together, so this is rough. Not a guarantee.">
                all legs <span className="font-black" style={{ color: slip.chance >= 50 ? "var(--plus)" : "var(--minus)" }}>{slip.chance < 1 ? "<1" : Math.round(slip.chance)}%</span>
              </span>
            ) : null}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
          {slip.legs.map((l) => (
            <span key={l.pickId} className="h-2.5 w-2.5 rounded-full" style={{ background: l.state === "waiting" ? "rgba(255,255,255,0.2)" : TONE_COLOR[l.tone] }} />
          ))}
        </span>
        <span className="shrink-0 text-sm font-black text-white/70" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? (
        <div className="divide-y divide-white/10 border-t border-white/10">
          {slip.legs.map((l) => (
            <LegRow key={l.pickId} leg={l} game={byKey[l.key]} now={now} />
          ))}
          <div className="px-3 pb-2">
            <SlipNotes slipKey={slip.key} pickIds={slip.legs.map((l) => l.pickId)} />
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2 px-3 pb-2" data-testid="ml-slip-actions">
        {sweatOf(slip) ? (
          <button type="button" onClick={() => openSweat(sweatOf(slip)!.leg.pickId)} className="sweat-btn mr-auto rounded-lg px-2.5 py-1 text-[11px] font-black text-white" data-testid="sweat-open">
            💓 Sweat it
          </button>
        ) : null}
        <SlipActions pickIds={slip.legs.map((l) => l.pickId)} />
      </div>
    </div>
  );
}

function SlipActions({ pickIds }: { pickIds: string[] }) {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const mine = useMemo(() => picks.filter((p) => pickIds.includes(p.id)), [picks, pickIds]);
  return <PickActions picks={mine} />;
}

function SlipNotes({ slipKey, pickIds }: { slipKey: string; pickIds: string[] }) {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const legs = useMemo(() => picks.filter((p) => pickIds.includes(p.id)), [picks, pickIds]);
  return <ParlayNotes slipId={slipKey} legs={legs} />;
}

function LegRow({ leg, game, now }: { leg: LegView; game: GameView | undefined; now: Date }) {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const pick = picks.find((p) => p.id === leg.pickId);
  const color = TONE_COLOR[leg.tone];
  const t = game ? teamsOf(game.snap, game.row) : null;
  const live = game?.state === "in";
  const final = game?.state === "post" || leg.settled;
  return (
    <Link href={gameRoute(leg.league, leg.gameId)} className="block px-3 py-2" data-testid="ml-leg">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-bold text-white">{leg.name}</span>
            {leg.kind === "prop" ? <NoteTag player={{ name: leg.name, id: leg.athleteId }} /> : null}
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="rounded px-1 font-black" style={{ color, background: "rgba(255,255,255,0.06)" }}>
              {leg.side}
            </span>
            <span className="truncate text-zinc-400">{leg.label}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {final && WLP[leg.state] ? (
            <WlpPill state={leg.state} auto={leg.auto} />
          ) : (
            <div className="tabular text-lg font-black leading-none" style={{ color }}>
              {leg.valueText}
              {leg.lineText ? <span className="text-[11px] text-zinc-500">/{leg.lineText}</span> : null}
            </div>
          )}
          <div className="mt-0.5 text-[10px] font-black uppercase tracking-wider" style={{ color: STATE_COLOR[leg.state] }}>
            {leg.chance != null && !final && leg.state !== "hit" && leg.state !== "waiting" ? <span className="mr-1 normal-case tracking-normal" style={{ color }}>{Math.round(leg.chance)}%</span> : null}
            {STAMP[leg.state]}
            {leg.auto ? <span className="ml-1 normal-case tracking-normal text-zinc-500">auto</span> : null}
          </div>
        </div>
      </div>
      {!final || leg.state === "hit" ? (
        <div className={"xp-bar mt-1.5 h-1.5 overflow-hidden rounded-full " + (leg.state === "hit" ? "level-up" : "")}>
          <div className="xp-fill h-full rounded-full" style={{ width: leg.fill + "%", background: color, color }} />
        </div>
      ) : null}
      <div className="tabular mt-1 flex items-center gap-1.5 text-[10px] text-zinc-400">
        {live ? <span className="tv-live-dot shrink-0" aria-hidden /> : null}
        {t ? (
          <span className="shrink-0 font-bold text-zinc-300">
            {game?.state === "pre" ? `${t.awayAbbr} @ ${t.homeAbbr}` : `${t.awayAbbr} ${t.awayScore} · ${t.homeScore} ${t.homeAbbr}`}
          </span>
        ) : null}
        <span className="shrink-0">{statusText(game, now)}</span>
        <span className="min-w-0 truncate">· {leg.note}</span>
      </div>
      {pick ? <NoteSnippet pick={pick} /> : null}
    </Link>
  );
}

function FeedRow({ f, snap }: { f: FeedItem; snap: LiveSnap | null }) {
  const color = f.mine ? "var(--gold)" : "var(--plus)";
  const team = snap && f.teamId ? (f.teamId === snap.homeId ? lift(snap.homeColor) : f.teamId === snap.awayId ? lift(snap.awayColor) : null) : null;
  return (
    <li className="play-in list-none">
      <Link href={gameRoute(f.league, f.gameId)} className="block rounded-xl border bg-black/50 px-3 py-1.5" style={{ borderColor: f.mine ? "rgba(245,197,66,0.45)" : "rgba(255,255,255,0.12)", borderLeft: `3px solid ${team ?? color}` }}>
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
          <span style={{ color }}>{f.mine ? "⭐ " : "💥 "}{f.tag}</span>
          <span className="tabular ml-auto truncate normal-case tracking-normal text-zinc-400">
            {f.score}
            {f.when ? ` · ${f.when}` : ""}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[12px] font-semibold leading-snug text-white/90">{f.text}</p>
      </Link>
    </li>
  );
}

