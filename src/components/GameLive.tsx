"use client";
import Lineups from "@/components/Lineups";
import { stageColors } from "@/lib/stageColors";
import { driveTrail, fieldGeom, spotX, type FieldSide, type TrailSeg } from "@/lib/fieldGeom";

import { clutch, heatCheck, isHuge, otLabel, runMeter } from "@/lib/gameFeel";
import { playCrowd, playSignature } from "@/lib/emotes";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import PlayViz, { type VizMine } from "@/components/PlayViz";
import LiveClock from "@/components/LiveClock";
import { VizCtx, useViz } from "@/components/vizContext";
import { vizFor } from "@/lib/playViz";
import { headshotFor } from "@/lib/faces";
import { pickEmote, playSound, replaySnap, type Emote } from "@/lib/emotes";
import { CrowdToggle, EmoteLayer, SoundToggle } from "@/components/Emotes";
import DriveFeed from "@/components/DriveFeed";
import { bigSwing, PitchMap, PlayPop, ShareFinal, ShotMap, Spotlight, SwingBanner, type Swing } from "@/components/GameGraphics";
import GameChat from "@/components/GameChat";
import { SweatPill } from "@/components/SweatMode";
import { questDone } from "@/lib/questStore";
import { LiveNotes } from "@/components/Notes";
import { LeadShockwave, leadFlip, LineMoveTags, PitcherFatigue, RedZoneAlarm, WinStrip, type Shock } from "@/components/GameUpgrades";
import Mark from "@/components/Mark";
import { BetsDock, MomentBadge, TaggedText, YourPlayersProvider, useGameLegList, useYourPlayers } from "@/components/YourPlayers";
import { mentions, shortName } from "@/lib/yourPlayers";
import { isBehind, type LivePlay, type LiveSnap } from "@/lib/live";
import { POLL_ERROR_MS, pollDelay, usePoll } from "@/components/usePoll";
import {
  currentDrive,
  isBigPlay,
  isShotAttempt,
  leadChanged,
  playKind,
  playerFromText,
  scoringRun,
  trackProps,
  type PlayKind,
  type TrackProp,
  type TrackRow,
} from "@/lib/tracker";

type Run = { teamId: string; us: number; them: number } | null;

const ICON: Record<PlayKind, string> = {
  three: "③",
  dunk: "💥",
  bucket: "🏀",
  miss: "○",
  ft: "•",
  rebound: "↺",
  turnover: "⇄",
  foul: "✋",
  block: "⛔",
  steal: "⚡",
  sub: "⇅",
  td: "🏈",
  fg: "🥅",
  pass: "➶",
  rush: "➜",
  sack: "✖",
  punt: "⤴",
  pick: "🛑",
  goal: "🚨",
  shot: "◎",
  save: "🧤",
  penalty: "⚑",
  hit: "⚾",
  out: "∅",
  period: "⏱",
  other: "·",
};

export default function GameLive({
  league,
  id,
  away,
  home,
  props,
}: {
  league: string;
  id: string;
  away: string;
  home: string;
  props: TrackProp[];
}) {
  const [live, setLive] = useState<LiveSnap | null>(null);
  const [replay, setReplay] = useState<number | null>(null);
  const [freshIds, setFreshIds] = useState<string[]>([]);
  const [cinema, setCinema] = useState<LivePlay | null>(null);
  const [emote, setEmote] = useState<Emote | null>(null);
  const [bump, setBump] = useState<{ away: number; home: number }>({ away: 0, home: 0 });
  const [edge, setEdge] = useState<{ n: number; color: string } | null>(null);
  const [pop, setPop] = useState<{ n: number; side: "away" | "home"; text: string } | null>(null);
  const [shake, setShake] = useState(0);
  const [swing, setSwing] = useState<Swing | null>(null);
  const swingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shock, setShock] = useState<Shock | null>(null);
  const shockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tab, setTab] = useState<"play" | "lines" | "chat">("play");
  // Play visualizer: every new play in order (a few at most, so it keeps up), or one you tapped to replay.
  const [vizQ, setVizQ] = useState<LivePlay[]>([]);
  const [unseen, setUnseen] = useState(0);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const feedH = useRef<number | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const scores = useRef<{ away: string | null; home: string | null }>({ away: null, home: null });
  const shownRef = useRef<LiveSnap | null>(null);

  const cinemaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnap = useRef<LiveSnap | null>(null);
  useEffect(
    () => () => {
      if (cinemaTimer.current) clearTimeout(cinemaTimer.current);
      if (emoteTimer.current) clearTimeout(emoteTimer.current);
      if (swingTimer.current) clearTimeout(swingTimer.current);
      if (shockTimer.current) clearTimeout(shockTimer.current);
    },
    []
  );

  /** New plays in: fresh rows, big-play cinema, a quick emote, score roll and edge lights. */
  const react = useCallback((data: LiveSnap, quiet: boolean) => {
    const prev = shownRef.current;
    const first = seen.current === null;
    const prior = seen.current ?? new Set<string>();
    const added = first ? [] : data.plays.filter((p) => !prior.has(p.id));
    seen.current = new Set([...prior, ...data.plays.map((p) => p.id)]);
    setFreshIds(added.map((p) => p.id));
    const drawable = added.filter((p) => vizFor(p, data, league));
    if (drawable.length) setVizQ((q) => [...q, ...drawable].slice(-4));
    // Reading further down the page: keep your place and count what came in above.
    const el = feedRef.current;
    if (added.length && el && typeof window !== "undefined" && el.getBoundingClientRect().top < 0) {
      feedH.current = el.offsetHeight;
      setUnseen((n) => n + added.length);
    }
    const big = [...added].reverse().find(isBigPlay);
    if (big && !quiet) {
      if (isHuge(big, clutch(league, data))) {
        setShake((n) => n + 1);
        playCrowd(0.9);
      }
      playSignature();
      setCinema(big);
      if (cinemaTimer.current) clearTimeout(cinemaTimer.current);
      cinemaTimer.current = setTimeout(() => setCinema(null), 4300);
    }
    const em = pickEmote(league, added, prev, data);
    if (em) {
      setEmote(em);
      playSound(em.kind);
      if (emoteTimer.current) clearTimeout(emoteTimer.current);
      emoteTimer.current = setTimeout(() => setEmote(null), 1500);
    }
    if (!first) {
      const awayMoved = data.awayScore !== scores.current.away;
      const homeMoved = data.homeScore !== scores.current.home;
      setBump((b) => ({ away: awayMoved ? b.away + 1 : b.away, home: homeMoved ? b.home + 1 : b.home }));
      if (awayMoved || homeMoved) setEdge((e) => ({ n: (e?.n ?? 0) + 1, color: stageColors(data)[homeMoved ? 1 : 0] }));
      // Arcade score pop: "+3" over the side that scored.
      const side = homeMoved ? "home" : awayMoved ? "away" : null;
      if (side) {
        const was = Number(scores.current[side]) || 0;
        const now = Number(side === "home" ? data.homeScore : data.awayScore) || 0;
        if (now > was && now - was <= 9) {
          setPop((p) => ({ n: (p?.n ?? 0) + 1, side, text: `+${now - was}` }));
          if (!quiet) playCrowd(clutch(league, data) ? 0.8 : 0.4);
        }
      }
    }
    // Win-chance swing: one play moved ESPN's win chance 10+ points.
    if (!first && !quiet && prev) {
      const d = bigSwing(prev.win, data.win);
      if (d !== null) {
        const side = d > 0 ? "home" : "away";
        setSwing((sw) => ({
          n: (sw?.n ?? 0) + 1,
          delta: d,
          side,
          abbr: side === "home" ? data.homeAbbr : data.awayAbbr,
          color: stageColors(data)[side === "home" ? 1 : 0],
        }));
        if (swingTimer.current) clearTimeout(swingTimer.current);
        swingTimer.current = setTimeout(() => setSwing(null), 2600);
      }
    }
    // Lead-change shockwave: the other side now leads (ties do not count).
    if (!first && prev) {
      const flip = leadFlip(prev, data);
      if (flip) {
        setShock((sh) => ({ n: (sh?.n ?? 0) + 1, color: stageColors(data)[flip === "home" ? 1 : 0], abbr: flip === "home" ? data.homeAbbr : data.awayAbbr }));
        if (shockTimer.current) clearTimeout(shockTimer.current);
        shockTimer.current = setTimeout(() => setShock(null), 1900);
      }
    }
    scores.current = { away: data.awayScore, home: data.homeScore };
    shownRef.current = data;
  }, [league]);

  const newestId = live?.plays.length ? live.plays[live.plays.length - 1].id : null;
  useLayoutEffect(() => {
    const el = feedRef.current;
    if (el && feedH.current !== null) {
      const grew = el.offsetHeight - feedH.current;
      if (grew > 0) window.scrollBy(0, grew);
      feedH.current = null;
    }
  }, [newestId]);
  useEffect(() => {
    if (!unseen) return;
    const onScroll = () => {
      const el = feedRef.current;
      if (el && el.getBoundingClientRect().top >= 0) setUnseen(0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [unseen]);
  const vizNow = vizQ[0] ?? null;
  const vizDone = useCallback(() => setVizQ((q) => q.slice(1)), []);
  const vizApi = useMemo(() => ({ replay: (p: LivePlay) => setVizQ([p]), current: vizNow?.id ?? null }), [vizNow]);

  usePoll(async (signal) => {
    const res = await fetch("/api/live/" + league + "/" + id, { cache: "no-store", signal });
    if (!res.ok) return POLL_ERROR_MS;
    const data = (await res.json()) as LiveSnap;
    // An older copy can come back from a different edge. Never step the game backwards.
    if (isBehind(data, lastSnap.current)) return pollDelay(lastSnap.current?.state);
    lastSnap.current = data;
    if (replay === null) react(data, false);
    setLive(data);
    return pollDelay(data.state);
  }, league + "/" + id);

  // Replay: step through the last plays of a final, one every 1.4s, with the same emotes.
  const snapAt = useCallback((n: number) => (live ? replaySnap(live, n, league) : null), [live, league]);
  function startReplay() {
    if (!live) return;
    const start = Math.max(1, live.plays.length - 40);
    seen.current = new Set(live.plays.slice(0, start).map((p) => p.id));
    shownRef.current = snapAt(start);
    scores.current = { away: shownRef.current?.awayScore ?? null, home: shownRef.current?.homeScore ?? null };
    setReplay(start);
  }
  useEffect(() => {
    if (replay === null || !live) return;
    const t = setTimeout(() => {
      const next = replay + 1;
      if (next > live.plays.length) {
        setReplay(null);
        seen.current = null;
        react(live, true);
        return;
      }
      const v = snapAt(next);
      if (v) react(v, false);
      setReplay(next);
    }, 1400);
    return () => clearTimeout(t);
  }, [replay, live, snapAt, react]);

  const view = replay !== null && live ? replaySnap(live, replay, league) : live;
  const snap = view;
  // Daily quest: five minutes on a live game page while it is on screen.
  const isLive = live?.state === "in";
  useEffect(() => {
    if (!isLive) return;
    const KEY = "pj-watch-s:" + new Date().toLocaleDateString("en-CA");
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      try {
        const n = Number(sessionStorage.getItem(KEY) || 0) + 5;
        sessionStorage.setItem(KEY, String(n));
        if (n >= 300) questDone("watch");
      } catch {
        /* private mode */
      }
    }, 5000);
    return () => clearInterval(t);
  }, [isLive]);

  const rows = useMemo(() => trackProps(props, snap, league), [props, snap, league]);
  const top = rows.slice(0, 8);
  const rest = rows.slice(8);
  const plays = snap ? [...snap.plays].reverse() : [];
  const run = snap ? scoringRun(snap.plays) : null;
  const flipped = snap ? leadChanged(snap.plays) : false;
  const [awayColor, homeColor] = stageColors(snap);
  const shown = snap ? { ...snap, awayColor, homeColor } : null;
  const bigChips = plays.filter(isBigPlay).slice(0, 3);
  const vars = { ["--away" as string]: awayColor, ["--home" as string]: homeColor } as React.CSSProperties;
  const football = league === "nfl" || league === "ncaaf";
  const hoops = league === "nba" || league === "wnba" || league === "ncaam" || league === "ncaaw";
  const newestPlay = snap?.plays.length ? snap.plays[snap.plays.length - 1] : null;
  const popPlay = !football && newestPlay && freshIds.includes(newestPlay.id) ? newestPlay : null;

  return (
    <YourPlayersProvider league={league} gameId={id} snap={view}>
    <VizCtx.Provider value={vizApi}>
    <div className="game-stage">
      <div className={tab === "chat" ? "max-lg:hidden" : ""}>
        <div className={tab === "lines" ? "max-lg:hidden" : ""} style={vars}>
          <div key={"shake" + shake} className={"relative " + (shake ? "screen-shake" : "")}>
          <MomentBadge />
          {pop ? (
            <span key={"pop" + pop.n} className={"arcade-pop " + (pop.side === "home" ? "right-[12%]" : "left-[12%]")} style={{ ["--pop" as string]: pop.side === "home" ? homeColor : awayColor } as React.CSSProperties} aria-hidden>
              {pop.text}
            </span>
          ) : null}
          <Hero
            league={league}
            snap={snap}
            away={away}
            home={home}
            awayColor={awayColor}
            homeColor={homeColor}
            cinema={cinema}
            bump={bump}
            freshIds={freshIds}
            emote={emote}
            swing={swing ? <SwingBanner swing={swing} /> : null}
            shock={shock ? <LeadShockwave shock={shock} /> : null}
            alarm={football ? <RedZoneAlarm snap={snap} /> : null}
            vizPlay={vizNow}
            onVizDone={vizDone}
            pop={popPlay && !vizNow ? <PlayPop play={popPlay} color={teamColor(snap, popPlay.teamId, awayColor, homeColor)} icon={ICON[playKind(popPlay)]} /> : null}
          />
          <MineChip league={league} play={vizNow} />
          <GameFeel league={league} snap={snap} awayColor={awayColor} homeColor={homeColor} />
          {live?.state === "post" && live.plays.length > 3 ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => (replay === null ? startReplay() : (setReplay(null), (seen.current = null), live && react(live, true)))}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-black text-white"
              >
                {replay === null ? "▶ Replay the finish" : "■ Stop replay"}
              </button>
              {replay !== null ? <span className="text-[11px] text-zinc-400">Replay · play {replay} of {live.plays.length}</span> : <ShareFinal league={league} id={id} label={`${live.awayAbbr} ${live.awayScore ?? ""} · ${live.homeAbbr} ${live.homeScore ?? ""}`} />}
            </div>
          ) : live?.state === "post" ? (
            <div className="mt-2 flex justify-end">
              <ShareFinal league={league} id={id} label={`${live.awayAbbr} ${live.awayScore ?? ""} · ${live.homeAbbr} ${live.homeScore ?? ""}`} />
            </div>
          ) : null}
          {edge ? <div key={edge.n} className="edge-lights" style={{ ["--edge" as string]: edge.color } as React.CSSProperties} aria-hidden /> : null}
          </div>
          <BetsDock variant="bar" />
          <SweatPill league={league} id={id} />
          <Spotlight league={league} gameId={id} snap={snap} />
          <LiveNotes league={league} gameId={id} snap={snap} />
          {hoops && snap ? <ShotMap snap={snap} awayColor={awayColor} homeColor={homeColor} freshIds={freshIds} /> : null}
          {league === "mlb" && snap?.atBat ? <PitchMap atBat={snap.atBat} live={snap.state === "in"} freshIds={freshIds} /> : null}
          {league === "mlb" && snap?.arms?.length ? <PitcherFatigue snap={snap} awayColor={awayColor} homeColor={homeColor} /> : null}
          {shown && shown.win.length > 1 ? <WinStrip snap={shown} flipped={flipped} /> : null}
          {live && live.state !== "post" ? <LineMoveTags snap={live} /> : null}
          {shown ? <PossessionStrip league={league} snap={shown} run={run} /> : null}
          {bigChips.length ? <BigChips plays={bigChips} snap={shown} /> : null}
          {top.length > 0 ? (
            <div className="lg:hidden">
              <Tracker top={top.slice(0, 3)} rest={[]} state={snap?.state ?? "pre"} />
            </div>
          ) : null}
          {unseen > 0 ? (
            <button type="button" className="new-plays-pill fixed left-1/2 top-16 -translate-x-1/2" data-testid="new-plays" onClick={() => { feedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); setUnseen(0); }}>
              ↑ {unseen} new play{unseen === 1 ? "" : "s"}
            </button>
          ) : null}
          <div ref={feedRef} className="scroll-mt-20">
          {snap && snap.drives.length ? (
            <DriveFeed snap={snap} freshIds={freshIds} awayColor={awayColor} homeColor={homeColor} />
          ) : (
            <Feed plays={plays.slice(0, 30)} freshIds={freshIds} snap={snap} awayColor={awayColor} homeColor={homeColor} />
          )}
          </div>
          <Lineups league={league} gameId={id} snap={snap} />
        </div>
        <div className={tab === "play" ? "max-lg:hidden" : ""}>
          <Tracker top={top} rest={rest} state={snap?.state ?? "pre"} />
        </div>
      </div>
      <div className={(tab !== "chat" ? "max-lg:hidden " : "") + "lg:sticky lg:top-[calc(var(--chrome-h,calc(6.6rem+env(safe-area-inset-top))))] lg:block"}>
        <div className="hidden lg:block">
          <BetsDock variant="side" />
        </div>
        <GameChat league={league} id={id} awayColor={awayColor} homeColor={homeColor} />
      </div>
      <div className="mt-3 flex gap-1 lg:hidden">
        {(
          [
            ["play", "Play"],
            ["lines", "Live vs line"],
            ["chat", "Thread"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={
              "flex-1 rounded-lg px-2 py-2 text-[11px] font-bold uppercase tracking-wider " +
              (tab === key ? "bg-white/10 text-white" : "text-zinc-500")
            }
          >
            {label}
          </button>
        ))}
      </div>
    </div>
    </VizCtx.Provider>
    </YourPlayersProvider>
  );
}

function teamColor(snap: LiveSnap | null, teamId: string | null, awayColor: string, homeColor: string) {
  if (!teamId || !snap) return "#a1a1aa";
  return teamId === snap.homeId ? homeColor : teamId === snap.awayId ? awayColor : "#a1a1aa";
}

function logoUrl(league: string, abbr: string, id: string): string | null {
  if ((league === "ncaam" || league === "ncaaw") && id) return `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`;
  if (["epl", "ucl", "laliga", "seriea", "bundesliga", "mls"].includes(league) && id) return `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`;
  if (league === "ncaaf") return id ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png` : null;
  if (["nfl", "nba", "mlb", "nhl", "wnba"].includes(league) && abbr) return `https://a.espncdn.com/i/teamlogos/${league}/500/${abbr.toLowerCase()}.png`;
  return null;
}

function Dots({ n, of, color }: { n: number; of: number; color: string }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${n} of ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: i < n ? color : "rgba(255,255,255,0.18)" }} />
      ))}
    </span>
  );
}

function BugSide({ league, snap, side, fallback, color, bump }: { league: string; snap: LiveSnap | null; side: "away" | "home"; fallback: string; color: string; bump: number }) {
  const abbr = (side === "home" ? snap?.homeAbbr : snap?.awayAbbr) || fallback;
  const teamId = (side === "home" ? snap?.homeId : snap?.awayId) ?? "";
  const score = (side === "home" ? snap?.homeScore : snap?.awayScore) ?? "—";
  const logo = logoUrl(league, abbr, teamId);
  const football = league === "nfl" || league === "ncaaf";
  const ball = snap?.state === "in" && football && snap.situation?.teamId === teamId;
  const atBat = snap?.state === "in" && league === "mlb" && snap.bug?.half ? (snap.bug.half === "top" ? side === "away" : side === "home") : false;
  const tos = side === "home" ? snap?.bug?.homeTimeouts : snap?.bug?.awayTimeouts;
  const right = side === "home";
  return (
    <div className={"tv-team " + (right ? "justify-end text-right" : "")}>
      {!right ? <span className="h-10 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 14px ${color}` }} /> : null}
      {!right && logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" width={30} height={30} className="h-7 w-7 object-contain" referrerPolicy="no-referrer" />
      ) : null}
      <div>
        <div className={"flex items-center gap-1 text-xs font-black tracking-wider " + (right ? "justify-end" : "")} style={{ color }}>
          {right && (ball || atBat) ? <span title={ball ? "Ball" : "At bat"}>{ball ? "🏈" : "⚾"}</span> : null}
          {abbr}
          {!right && (ball || atBat) ? <span title={ball ? "Ball" : "At bat"}>{ball ? "🏈" : "⚾"}</span> : null}
        </div>
        <span key={side + bump} className={"tv-score " + (bump ? "score-roll" : "")} style={{ ["--flash" as string]: color } as React.CSSProperties}>
          {score}
        </span>
        {football && tos != null && snap?.state === "in" ? (
          <div className={"mt-0.5 flex " + (right ? "justify-end" : "")}>
            <Dots n={tos} of={3} color="#f5c542" />
          </div>
        ) : null}
      </div>
      {right && logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" width={30} height={30} className="h-7 w-7 object-contain" referrerPolicy="no-referrer" />
      ) : null}
      {right ? <span className="h-10 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 14px ${color}` }} /> : null}
    </div>
  );
}

function Hero({
  league,
  snap,
  away,
  home,
  awayColor,
  homeColor,
  cinema,
  bump,
  freshIds,
  emote,
  pop,
  swing,
  shock,
  alarm,
  vizPlay,
  onVizDone,
}: {
  vizPlay: LivePlay | null;
  onVizDone: () => void;
  league: string;
  snap: LiveSnap | null;
  away: string;
  home: string;
  awayColor: string;
  homeColor: string;
  cinema: LivePlay | null;
  bump: { away: number; home: number };
  freshIds: string[];
  emote: Emote | null;
  pop: React.ReactNode;
  swing: React.ReactNode;
  shock: React.ReactNode;
  alarm: React.ReactNode;
}) {
  const live = snap?.state === "in";
  const bug = snap?.bug;
  const flashKey = bump.away + bump.home;
  const lastScorer = bump.home >= bump.away ? homeColor : awayColor;
  return (
    <div className="tv-hero">
      <div className="stadium-glow" aria-hidden />
      <div key={"bug" + flashKey} className={"tv-bug " + (flashKey ? "tv-bug-flash" : "")} style={{ ["--flash" as string]: lastScorer } as React.CSSProperties}>
        <BugSide league={league} snap={snap} side="away" fallback={away} color={awayColor} bump={bump.away} />
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white">
            {live ? <span className="tv-live-dot" aria-hidden /> : null}
            {live ? "Live" : snap?.state === "post" ? "Final" : "Soon"}
            <SoundToggle />
            <CrowdToggle />
          </div>
          <div className="tabular mt-0.5 text-sm font-black text-[color:var(--flat)]">
            {live && otLabel(league, snap?.period ?? null) ? <span className="ot-pill mr-1">{otLabel(league, snap?.period ?? null)}</span> : null}
            {live && snap?.clock ? <LiveClock league={league} snap={snap} /> : ""}
          </div>
          <div className="text-[10px] text-zinc-400">{snap?.detail || ""}</div>
          {live && league === "mlb" && bug ? (
            <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[10px] font-black text-white">
              {bug.balls != null && bug.strikes != null ? <span className="tabular">{bug.balls}-{bug.strikes}</span> : null}
              {bug.outs != null ? <Dots n={bug.outs} of={3} color="#ff3b5c" /> : null}
            </div>
          ) : null}
        </div>
        <BugSide league={league} snap={snap} side="home" fallback={home} color={homeColor} bump={bump.home} />
      </div>
      <div className="tv-surface">
        {snap ? (
          <Surface league={league} snap={snap} awayColor={awayColor} homeColor={homeColor} freshIds={freshIds}>
            {vizPlay ? <VizLayer key={vizPlay.id} league={league} snap={snap} play={vizPlay} awayColor={awayColor} homeColor={homeColor} onDone={onVizDone} /> : null}
          </Surface>
        ) : (
          <p className="w-full pb-6 text-center text-sm text-zinc-500">Waiting on the live feed.</p>
        )}
      </div>
      {vizPlay && snap ? <VizCaption league={league} snap={snap} play={vizPlay} awayColor={awayColor} homeColor={homeColor} /> : null}
      {pop}
      <EmoteLayer emote={emote} color={teamColor(snap, emote?.teamId ?? null, awayColor, homeColor)} />
      {cinema ? <Cinema play={cinema} color={teamColor(snap, cinema.teamId, awayColor, homeColor)} /> : null}
      {alarm}
      {swing}
      {shock}
    </div>
  );
}

function Diamond({ snap, awayColor, homeColor, children }: { snap: LiveSnap; awayColor: string; homeColor: string; children?: React.ReactNode }) {
  const bug = snap.bug;
  const batting = bug?.half === "bottom" ? homeColor : awayColor;
  const base = (on: boolean | undefined, x: number, y: number, key: string) => (
    <rect key={key} x={x - 4} y={y - 4} width="8" height="8" transform={`rotate(45 ${x} ${y})`} fill={on ? batting : "rgba(255,255,255,0.12)"} stroke="#fff" strokeWidth="0.6" style={on ? { filter: `drop-shadow(0 0 4px ${batting})` } : undefined} />
  );
  const last = [...snap.plays].reverse().find((p) => p.text);
  return (
    <svg viewBox="0 0 120 70" preserveAspectRatio="xMidYMax meet" aria-label="Diamond">
      <defs>
        <radialGradient id="grass" cx="50%" cy="100%" r="90%">
          <stop offset="0" stopColor="#14532d" />
          <stop offset="1" stopColor="#0a2e18" />
        </radialGradient>
      </defs>
      <path d="M60 68 L5 18 A70 70 0 0 1 115 18 Z" fill="url(#grass)" stroke="rgba(255,255,255,0.25)" strokeWidth="0.4" />
      <path d="M60 66 L84 42 L60 18 L36 42 Z" fill="#7c4a24" opacity="0.85" />
      <path d="M60 60 L78 42 L60 24 L42 42 Z" fill="#166534" />
      <line x1="60" y1="66" x2="5" y2="18" stroke="rgba(255,255,255,0.5)" strokeWidth="0.4" />
      <line x1="60" y1="66" x2="115" y2="18" stroke="rgba(255,255,255,0.5)" strokeWidth="0.4" />
      <circle cx="60" cy="43" r="2.2" fill="#a16207" />
      {base(bug?.onSecond, 60, 20, "2b")}
      {base(bug?.onThird, 38, 42, "3b")}
      {base(bug?.onFirst, 82, 42, "1b")}
      <path d="M57 64 h6 l-3 3 z" fill="#fff" />
      {!bug ? (
        <text x="60" y="8" fontSize="4" textAnchor="middle" fill="rgba(255,255,255,0.6)">{last ? "" : "Waiting on the first pitch"}</text>
      ) : null}
      {children}
    </svg>
  );
}

function Surface({
  league,
  snap,
  awayColor,
  homeColor,
  freshIds,
  children,
}: {
  league: string;
  snap: LiveSnap;
  awayColor: string;
  homeColor: string;
  freshIds: string[];
  children?: React.ReactNode;
}) {
  if (league === "nfl" || league === "ncaaf") return <Field snap={snap} awayColor={awayColor} homeColor={homeColor}>{children}</Field>;
  if (league === "nba" || league === "wnba" || league === "ncaam" || league === "ncaaw")
    return <Court snap={snap} awayColor={awayColor} homeColor={homeColor} freshIds={freshIds}>{children}</Court>;
  if (league === "nhl") return <Rink snap={snap} awayColor={awayColor} homeColor={homeColor} freshIds={freshIds}>{children}</Rink>;
  if (league === "mlb") return <Diamond snap={snap} awayColor={awayColor} homeColor={homeColor}>{children}</Diamond>;
  return <Pitch snap={snap} awayColor={awayColor} homeColor={homeColor}>{children}</Pitch>;
}

/** The play being drawn, with your logged player marked when ESPN's text names them. */
function VizLayer({ league, snap, play, awayColor, homeColor, onDone }: { league: string; snap: LiveSnap; play: LivePlay; awayColor: string; homeColor: string; onDone: () => void }) {
  const legs = useGameLegList();
  const spec = useMemo(() => vizFor(play, snap, league), [play, snap, league]);
  useEffect(() => {
    if (spec) return;
    const t = setTimeout(onDone, 50);
    return () => clearTimeout(t);
  }, [spec, onDone]);
  if (!spec) return null;
  const leg = legs.find((l) => mentions(play.text, l.name)) ?? null;
  const passer = spec.player;
  const mine: VizMine = leg
    ? {
        name: shortName(leg.name),
        face: headshotFor(league, leg.athleteId),
        // A catch: the receiver is where the ball lands, not the passer.
        onBall: spec.sport === "football" && (spec.kind === "pass" || spec.kind === "incomplete") && !(passer && mentions(passer, leg.name)),
      }
    : null;
  const color = spec.side === "home" ? homeColor : spec.side === "away" ? awayColor : "#a855f7";
  return <PlayViz spec={spec} color={color} mine={mine} onDone={onDone} />;
}

function VizCaption({ league, snap, play, awayColor, homeColor }: { league: string; snap: LiveSnap; play: LivePlay; awayColor: string; homeColor: string }) {
  const spec = vizFor(play, snap, league);
  if (!spec) return null;
  const abbr = spec.side === "home" ? snap.homeAbbr : spec.side === "away" ? snap.awayAbbr : "";
  const color = spec.side === "home" ? homeColor : awayColor;
  return (
    <div className="viz-caption" style={{ ["--viz" as string]: color } as React.CSSProperties} data-testid="viz-caption">
      <b>{abbr}</b>
      <span>{spec.caption}</span>
    </div>
  );
}

function Field({ snap, awayColor, homeColor, children }: { snap: LiveSnap; awayColor: string; homeColor: string; children?: React.ReactNode }) {
  const sit = snap.situation;
  // With ESPN drives, trust only the posted situation; between snaps (after a score or kick) show no ball.
  const drive = snap.drives.length ? null : currentDrive(snap.plays);
  const lastDrive = snap.drives.length ? snap.drives[snap.drives.length - 1] : null;
  // Prefer ESPN's posted situation; fall back to the latest marked play.
  const teamId = sit?.teamId ?? drive?.teamId ?? null;
  const toGoal = sit?.yardsToEndzone ?? drive?.ball ?? null;
  const offense = teamId ? (teamId === snap.homeId ? homeColor : awayColor) : "#a1a1aa";
  const defense = teamId ? (teamId === snap.homeId ? awayColor : homeColor) : "#a1a1aa";
  // Fixed like ESPN: away end zone left, home right. Home attacks left, away attacks right.
  const side: FieldSide = teamId === snap.homeId ? "home" : "away";
  const geom = teamId ? fieldGeom(side, toGoal, sit?.distance ?? null) : null;
  const ball = geom?.ball ?? null;
  const startPlay = drive && drive.teamId === teamId ? [...snap.plays].reverse().find((p) => p.teamId === drive.teamId && p.yardsToEndzone !== null && p.driveId === snap.plays[snap.plays.length - 1]?.driveId) : null;
  const start = startPlay?.yardsToEndzone != null ? spotX(side, startPlay.yardsToEndzone) : ball;
  const distance = sit?.distance ?? null;
  const firstToGoal =
    toGoal !== null && distance !== null && distance > 0 ? Math.max(0, toGoal - distance) : drive && drive.teamId === teamId ? drive.firstDown : null;
  const first = firstToGoal !== null ? spotX(side, firstToGoal) : null;
  const redZone = sit ? sit.redZone : !!drive?.redZone;
  const label =
    sit?.text ??
    (snap.state === "in" && lastDrive && !lastDrive.live && lastDrive.resultLong
      ? `${lastDrive.abbr} ${lastDrive.resultLong} · next snap soon`
      : snap.state === "post" && lastDrive
        ? `Last drive · ${lastDrive.abbr}${lastDrive.resultLong ? " " + lastDrive.resultLong : ""}`
        : null);
  // Drive trail: the drive on the field, else the one that just ended (between snaps or at the final).
  const trailDrive = snap.drives.find((d) => d.live) ?? lastDrive;
  const trailSide: FieldSide = trailDrive?.teamId === snap.homeId ? "home" : "away";
  const trailColor = trailDrive?.teamId === snap.homeId ? homeColor : awayColor;
  const trail = useMemo(() => {
    if (!trailDrive?.teamId) return [];
    const byId = new Map(snap.plays.map((p) => [p.id, p]));
    const plays = trailDrive.playIds.map((pid) => byId.get(pid)).filter((p): p is LivePlay => !!p);
    return driveTrail(plays, trailDrive.teamId, trailSide);
  }, [trailDrive, snap.plays, trailSide]);
  const newest = trail.length ? trail[trail.length - 1] : null;
  const newestPlay = newest ? snap.plays.find((p) => p.id === newest.id) ?? null : null;
  return (
    <svg viewBox="0 0 120 54" preserveAspectRatio="xMidYMid meet" aria-label="Field">
      <defs>
        <linearGradient id="turf" x1="0" x2="1">
          <stop offset="0" stopColor="#0b3a1d" />
          <stop offset="0.5" stopColor="#0f4a25" />
          <stop offset="1" stopColor="#0b3a1d" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="120" height="54" rx="2" fill="url(#turf)" />
      <rect x="0" y="0" width="10" height="54" fill={awayColor} opacity="0.55" />
      <rect x="110" y="0" width="10" height="54" fill={homeColor} opacity="0.55" />
      {redZone && geom ? <rect x={geom.redZone.x} y="0" width={geom.redZone.w} height="54" fill="rgba(255,59,92,0.22)" /> : null}
      {Array.from({ length: 99 }, (_, i) => 11 + i).map((x) =>
        x % 5 === 0 ? null : (
          <g key={"h" + x} stroke="rgba(255,255,255,0.28)" strokeWidth="0.15">
            <line x1={x} y1="1" x2={x} y2="2.2" />
            <line x1={x} y1="20" x2={x} y2="21.2" />
            <line x1={x} y1="32.8" x2={x} y2="34" />
            <line x1={x} y1="51.8" x2={x} y2="53" />
          </g>
        )
      )}
      <text x="5" y="27" fontSize="5" fontWeight="900" textAnchor="middle" fill="rgba(255,255,255,0.75)" transform="rotate(-90 5 27)" letterSpacing="1">
        {snap.awayAbbr}
      </text>
      <text x="115" y="27" fontSize="5" fontWeight="900" textAnchor="middle" fill="rgba(255,255,255,0.75)" transform="rotate(90 115 27)" letterSpacing="1">
        {snap.homeAbbr}
      </text>
      {Array.from({ length: 21 }, (_, i) => 10 + i * 5).map((x) => (
        <line key={x} x1={x} y1="0" x2={x} y2="54" stroke="rgba(255,255,255,0.35)" strokeWidth={x % 10 === 0 ? 0.45 : 0.2} />
      ))}
      {[10, 20, 30, 40, 50, 40, 30, 20, 10].map((n, i) => (
        <text key={i} x={20 + i * 10} y="49" fontSize="3.4" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontWeight="700">
          {n}
        </text>
      ))}
      {label ? (
        <text x="60" y="7" fontSize="4.2" textAnchor="middle" fill="#fff" fontWeight="900" style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.6)", strokeWidth: 0.8 }}>
          {label}
        </text>
      ) : null}
      {trail.length ? <DriveTrail trail={trail} color={trailColor} newestPlay={newestPlay} /> : null}
      {start !== null && ball !== null ? (
        <>
          {!trail.length ? <rect x={Math.min(start, ball)} y="24.5" width={Math.abs(ball - start)} height="5" rx="2.5" fill={offense} opacity="0.55" /> : null}
          <line className="ball-mark" x1={ball} y1="2" x2={ball} y2="52" stroke="#38bdf8" strokeWidth="0.8" />
          {first !== null ? <line x1={first} y1="2" x2={first} y2="52" stroke="#f5c542" strokeWidth="0.9" /> : null}
          {geom ? <path d={`M ${ball + geom.dir * 3} 38 l ${geom.dir * 3} 2 l ${-geom.dir * 3} 2 z`} fill={offense} stroke="#fff" strokeWidth="0.25" aria-label={geom.dir > 0 ? "Attacking right" : "Attacking left"} /> : null}
          <ellipse className="ball-mark" cx={ball} cy="27" rx="2.2" ry="1.4" fill="#a0522d" stroke="#fff" strokeWidth="0.3" style={{ filter: "drop-shadow(0 0 3px #f5c542)" }} />
        </>
      ) : (
        trail.length ? null : <text x="60" y="30" fontSize="4" textAnchor="middle" fill="rgba(255,255,255,0.6)">{label ? "Waiting on the next snap" : "No yard line posted yet"}</text>
      )}
      {children}
    </svg>
  );
}

/**
 * The drive as stacked segments, oldest at the top, one per snap, start spot to end spot.
 * The newest snap draws in and its ball travels from where it started to where it ended.
 */
function DriveTrail({ trail, color, newestPlay }: { trail: TrailSeg[]; color: string; newestPlay: LivePlay | null }) {
  const top = 10;
  const room = 30;
  const lane = Math.min(3.4, room / Math.max(1, trail.length));
  const first = trail[0];
  const last = trail[trail.length - 1];
  const pass = !!newestPlay && /pass|reception|field goal|punt/i.test(newestPlay.typeText) && !/incomplet/i.test(newestPlay.typeText);
  return (
    <g aria-label={`Drive trail, ${trail.length} plays`}>
      <line x1={first.x1} y1="27" x2={last.x2} y2="27" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity="0.28" />
      <circle cx={first.x1} cy="27" r="1" fill="none" stroke={color} strokeWidth="0.4" opacity="0.8" />
      {trail.map((seg, i) => {
        const y = top + i * lane + lane / 2;
        const isNew = i === trail.length - 1;
        const dir = Math.sign(seg.x2 - seg.x1);
        const stroke = seg.turnover ? "#ff3b5c" : seg.penalty ? "#f5c542" : color;
        const w = Math.max(0.5, Math.min(1.3, lane * 0.42));
        const op = 0.35 + 0.65 * ((i + 1) / trail.length);
        return (
          <g key={seg.id} opacity={op}>
            {seg.kick && dir !== 0 ? (
              <path
                className={isNew ? "trail-draw" : undefined}
                d={`M ${seg.x1} ${y} Q ${(seg.x1 + seg.x2) / 2} ${y - 6} ${seg.x2} ${y}`}
                pathLength={1}
                stroke={seg.scoring ? "#f5c542" : stroke}
                strokeWidth={w * 0.7}
                strokeDasharray={isNew ? undefined : "0.04 0.03"}
                fill="none"
              />
            ) : dir === 0 ? (
              <circle cx={seg.x1} cy={y} r={w * 0.7} fill={stroke} />
            ) : (
              <>
                <path
                  className={isNew ? "trail-draw" : undefined}
                  d={`M ${seg.x1} ${y} H ${seg.x2 - dir * w}`}
                  pathLength={1}
                  stroke={stroke}
                  strokeWidth={w}
                  strokeLinecap="round"
                  strokeDasharray={seg.penalty ? "0.06 0.04" : undefined}
                  fill="none"
                  style={isNew ? { filter: `drop-shadow(0 0 1.2px ${stroke})` } : undefined}
                />
                <path d={`M ${seg.x2} ${y} l ${-dir * w * 1.6} ${-w * 0.9} v ${w * 1.8} z`} fill={stroke} className={isNew ? "trail-head" : undefined} />
              </>
            )}
            {seg.tag ? (
              <text x={seg.x2 + (dir || 1) * 1.5} y={y + 1} fontSize="2.6" fontWeight="900" fill={seg.scoring ? "#f5c542" : "#fff"} textAnchor={dir < 0 ? "end" : "start"} style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.6)", strokeWidth: 0.5 }}>
                {seg.tag}
              </text>
            ) : null}
          </g>
        );
      })}
      {last.x1 !== last.x2 ? (
        <g key={"travel" + last.id} className="ball-travel" style={{ ["--dx" as string]: `${last.x1 - last.x2}px` } as React.CSSProperties}>
          <g className={pass ? "ball-hop" : undefined}>
            <ellipse cx={last.x2} cy={top + (trail.length - 1) * lane + lane / 2} rx="1.6" ry="1" fill="#a0522d" stroke="#fff" strokeWidth="0.25" style={{ filter: "drop-shadow(0 0 2px #f5c542)" }} />
          </g>
        </g>
      ) : null}
    </g>
  );
}

function Court({
  snap,
  awayColor,
  homeColor,
  freshIds,
  children,
}: {
  snap: LiveSnap;
  awayColor: string;
  homeColor: string;
  freshIds: string[];
  children?: React.ReactNode;
}) {
  const shots = snap.plays.filter(isShotAttempt).slice(-24);
  const line = "rgba(255,255,255,0.4)";
  return (
    <svg viewBox="-1 -1 52 34" preserveAspectRatio="xMidYMax meet" aria-label="Shot chart">
      <defs>
        <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2a1a" />
          <stop offset="1" stopColor="#1b130c" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="50" height="32" fill="url(#wood)" rx="0.6" />
      <rect x="17" y="0" width="16" height="19" fill="color-mix(in srgb, var(--home) 30%, transparent)" stroke={line} strokeWidth="0.2" />
      <circle cx="25" cy="19" r="6" fill="none" stroke={line} strokeWidth="0.2" />
      <path d="M3 0 V14 A23.75 23.75 0 0 0 47 14 V0" fill="none" stroke={line} strokeWidth="0.25" />
      <line x1="22" y1="4" x2="28" y2="4" stroke="#fff" strokeWidth="0.3" />
      <circle cx="25" cy="5.25" r="0.75" fill="none" stroke="#f97316" strokeWidth="0.3" />
      <path d="M19 32 A6 6 0 0 1 31 32" fill="none" stroke={line} strokeWidth="0.2" />
      {shots.map((p) => {
        const color = p.teamId === snap.homeId ? homeColor : awayColor;
        const cx = Math.max(0.5, Math.min(49.5, p.x as number));
        const cy = Math.max(0.5, Math.min(31.5, p.y as number));
        const isNew = freshIds.includes(p.id);
        return (
          <g key={p.id}>
            {isNew && p.scoring ? <circle className="dot-ring" cx={cx} cy={cy} r="1.4" stroke={color} strokeWidth="0.3" /> : null}
            {p.scoring ? (
              <circle className="dot-pop" cx={cx} cy={cy} r={p.points >= 3 ? 1.2 : 0.95} fill={color} stroke="#fff" strokeWidth="0.2" style={{ filter: `drop-shadow(0 0 1.2px ${color})` }} />
            ) : (
              <g className="dot-pop" stroke={color} strokeWidth="0.35" opacity="0.8">
                <line x1={cx - 0.7} y1={cy - 0.7} x2={cx + 0.7} y2={cy + 0.7} />
                <line x1={cx - 0.7} y1={cy + 0.7} x2={cx + 0.7} y2={cy - 0.7} />
              </g>
            )}
          </g>
        );
      })}
      {children}
    </svg>
  );
}

function Rink({
  snap,
  awayColor,
  homeColor,
  freshIds,
  children,
}: {
  snap: LiveSnap;
  awayColor: string;
  homeColor: string;
  freshIds: string[];
  children?: React.ReactNode;
}) {
  const shots = snap.plays.filter((p) => p.x !== null && p.y !== null && (p.scoring || /shot|goal/i.test(p.typeText))).slice(-20);
  return (
    <svg viewBox="-100 -43 200 86" preserveAspectRatio="xMidYMid meet" aria-label="Rink">
      <rect x="-99" y="-42" width="198" height="84" rx="26" fill="#dbe9f5" opacity="0.12" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
      <line x1="0" y1="-42" x2="0" y2="42" stroke="rgba(255,59,92,0.8)" strokeWidth="1" />
      <line x1="-25" y1="-42" x2="-25" y2="42" stroke="rgba(56,189,248,0.7)" strokeWidth="1" />
      <line x1="25" y1="-42" x2="25" y2="42" stroke="rgba(56,189,248,0.7)" strokeWidth="1" />
      <circle cx="0" cy="0" r="15" fill="none" stroke="rgba(56,189,248,0.6)" />
      <line x1="-89" y1="-38" x2="-89" y2="38" stroke="rgba(255,59,92,0.6)" />
      <line x1="89" y1="-38" x2="89" y2="38" stroke="rgba(255,59,92,0.6)" />
      {shots.map((p) => {
        const color = p.teamId === snap.homeId ? homeColor : awayColor;
        const cx = p.x as number;
        const cy = -(p.y as number);
        return (
          <g key={p.id}>
            {freshIds.includes(p.id) ? <circle className="dot-ring" cx={cx} cy={cy} r="3" stroke={color} strokeWidth="0.8" /> : null}
            <circle className="dot-pop" cx={cx} cy={cy} r={p.scoring ? 3.4 : 2} fill={p.scoring ? color : "transparent"} stroke={color} strokeWidth="0.8" />
          </g>
        );
      })}
      {children}
    </svg>
  );
}

const SPARKS = Array.from({ length: 18 }, (_, i) => {
  const a = (i / 18) * Math.PI * 2;
  const r = 90 + (i % 3) * 40;
  return { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r), rot: (i * 47) % 360, delay: (i % 4) * 60 };
});

function Cinema({ play, color }: { play: LivePlay; color: string }) {
  const name = playerFromText(play.text);
  const kind = playKind(play);
  const tag =
    kind === "td" ? "Touchdown" : kind === "three" ? "From deep" : kind === "dunk" ? "Slam" : kind === "goal" ? "Goal" : kind === "pick" ? "Picked off" : kind === "turnover" ? "Turnover" : kind === "block" ? "Rejected" : play.scoring ? "Bucket" : "Big play";
  return (
    <div className="cinema" style={{ ["--team" as string]: color } as React.CSSProperties} role="status" aria-live="polite">
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
              animationDelay: 250 + s.delay + "ms",
            } as React.CSSProperties
          }
        />
      ))}
      <div className="cinema-copy">
        <div className="text-[11px] font-black uppercase tracking-[0.3em] text-white/80">{tag}</div>
        <div className="cinema-name">{name ?? play.typeText}</div>
        <p className="mt-2 line-clamp-2 max-w-[22rem] text-sm font-semibold text-white/90">{play.text}</p>
        {play.points > 0 ? <span className="cinema-stamp">+{play.points}</span> : null}
      </div>
    </div>
  );
}

function PossessionStrip({ league, snap, run }: { league: string; snap: LiveSnap; run: Run }) {
  const football = league === "nfl" || league === "ncaaf";
  const liveDrive = football ? snap.drives.find((d) => d.live) ?? null : null;
  const drive = football && (!snap.drives.length || liveDrive) ? currentDrive(snap.plays) : null;
  const lastTeam = [...snap.plays].reverse().find((p) => p.teamId)?.teamId ?? null;
  const holder = football ? snap.situation?.teamId ?? drive?.teamId ?? null : lastTeam;
  const runAbbr = run ? (run.teamId === snap.homeId ? snap.homeAbbr : snap.awayAbbr) : null;
  const runColor = run ? (run.teamId === snap.homeId ? snap.homeColor : snap.awayColor) : "";
  const side = (teamId: string, abbr: string, color: string) => {
    const on = holder === teamId && snap.state === "in";
    return (
      <div
        className={"flex-1 rounded-xl border border-white/10 px-3 py-2 text-center " + (on ? "poss-glow" : "")}
        style={{ ["--team" as string]: color } as React.CSSProperties}
      >
        <div className="text-xs font-black" style={{ color }}>{abbr}</div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-400">
          {on ? (football ? "Ball" : "Last play") : "\u00a0"}
        </div>
      </div>
    );
  };
  return (
    <div className="mt-3">
      <div className="flex items-stretch gap-2">
        {side(snap.awayId, snap.awayAbbr, snap.awayColor)}
        {side(snap.homeId, snap.homeAbbr, snap.homeColor)}
      </div>
      {football && snap.situation?.text && snap.state === "in" ? (
        <p className="mt-1.5 text-center text-sm font-black text-[color:var(--flat)]">{snap.situation.text}</p>
      ) : null}
      {drive ? (
        <p className="mt-1.5 text-center text-[11px] text-zinc-400">
          {drive.plays} plays{drive.yards !== null ? " · " + drive.yards + " yds" : ""}
          {drive.redZone ? <span className="text-[color:var(--minus)]"> · Red zone</span> : null}
        </p>
      ) : null}
      {run && runAbbr ? (
        <p className="mt-1.5 text-center text-sm font-black" style={{ color: runColor }}>
          {runAbbr} on a {run.us}–{run.them} run
        </p>
      ) : null}
    </div>
  );
}

function BigChips({ plays, snap }: { plays: LivePlay[]; snap: LiveSnap | null }) {
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {plays.map((p) => {
        const color = teamColor(snap, p.teamId, snap?.awayColor || "#7c3aed", snap?.homeColor || "#39ff14");
        return (
          <div key={p.id} className="chip-big min-w-[9.5rem] flex-none rounded-xl px-2.5 py-1.5" style={{ ["--team" as string]: color } as React.CSSProperties}>
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-400">
              <span>{p.period.replace(/ Quarter| Period/, "")} {p.clock}</span>
              {p.points > 0 ? <span className="font-black text-[color:var(--gold)]">+{p.points}</span> : null}
            </div>
            <div className="truncate text-xs font-black" style={{ color }}>{playerFromText(p.text) ?? p.typeText}</div>
          </div>
        );
      })}
    </div>
  );
}

function Feed({
  plays,
  freshIds,
  snap,
  awayColor,
  homeColor,
}: {
  plays: LivePlay[];
  freshIds: string[];
  snap: LiveSnap | null;
  awayColor: string;
  homeColor: string;
}) {
  const box = useRef<HTMLOListElement | null>(null);
  const pinned = useRef(true);
  const { moment, names } = useYourPlayers();
  const { replay, current } = useViz();
  const newest = plays[0]?.id;
  useEffect(() => {
    if (box.current && pinned.current) box.current.scrollTo({ top: 0 });
  }, [newest]);
  if (!plays.length) return null;
  return (
    <section className="mt-4" aria-label="Play by play">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-purple-200/80">Play by play</h2>
      <ol
        ref={box}
        className="feed space-y-1.5 pr-1"
        onScroll={(e) => {
          pinned.current = e.currentTarget.scrollTop < 40;
        }}
      >
        {plays.map((p, i) => {
          const color = teamColor(snap, p.teamId, awayColor, homeColor);
          const kind = playKind(p);
          const big = isBigPlay(p);
          const mine = !!moment && freshIds.includes(p.id) && mentions(p.text, moment.name);
          return (
            <li
              key={p.id}
              className={
                (mine ? "your-player " : "") +
                "feed-row foil-tile rounded-l-md px-3 py-2 text-sm " +
                (i === 0 ? "newest " : "older ") +
                (freshIds.includes(p.id) ? "feed-spring " : "") +
                (p.scoring ? "score-flash " : "") +
                (big ? "gold-edge " : "") +
                (names.some((n) => mentions(p.text, n)) ? "mine-row " : "") +
                (current === p.id ? "replaying" : "")
              }
              onClick={() => replay(p)}
              title="Replay this play"
              data-testid="pbp-row"
              style={{ ["--team" as string]: color, ["--flash" as string]: color } as React.CSSProperties}
            >
              <div className="flex items-start gap-2">
                <span className="ico" aria-hidden>{ICON[kind]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-[0.7em] uppercase tracking-wider text-zinc-500">
                    <span style={{ color }}>{p.period} {p.clock}</span>
                    {p.scoring && p.points > 0 ? <span className="font-black" style={{ color }}>+{p.points}</span> : null}
                  </div>
                  <p className="mt-0.5 leading-snug text-[color:var(--flat)]">
                    <TaggedText text={p.text} />
                  </p>
                  {p.awayScore !== null && p.homeScore !== null && p.scoring ? (
                    <p className="tabular text-[0.7em] text-zinc-500">
                      {snap?.awayAbbr} {p.awayScore} · {snap?.homeAbbr} {p.homeScore}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Tracker({ top, rest, state }: { top: TrackRow[]; rest: TrackRow[]; state: string }) {
  return (
    <section className="mt-4" aria-label="Live versus line">
      <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-purple-200/80">Live vs line</h2>
      <p className="mt-1 mb-2 text-[11px] text-zinc-500">
        Box score against the posted line. Green is on pace. Gold cleared it. Red is behind. Not a pick.
      </p>
      {top.length === 0 ? (
        <p className="panel rounded-xl px-4 py-4 text-sm text-zinc-400">
          {state === "pre" ? "No recent average loaded. The bar starts when the box score does." : "No live stat matched a posted line."}
        </p>
      ) : (
        <ul className="space-y-2">
          {top.map((row) => (
            <TrackTile key={row.id} row={row} />
          ))}
        </ul>
      )}
      {rest.length > 0 ? (
        <details className="fold mt-2">
          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-zinc-500">Show all tracked</summary>
          <ul className="mt-2 space-y-2">
            {rest.map((row) => (
              <TrackTile key={row.id} row={row} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function TrackTile({ row }: { row: TrackRow }) {
  const fill = row.value === null ? 0 : Math.max(0, Math.min(100, (row.value / row.line) * 100));
  const color =
    row.tone === "gold" ? "var(--gold)" : row.tone === "green" ? "var(--plus)" : row.tone === "red" ? "var(--minus)" : "#a1a1aa";
  return (
    <li className={"foil-tile px-3 py-2 " + (row.tone === "gold" ? "gold-burst gold-edge" : "")}>
      <div className="flex items-center gap-2">
        <Mark team={row.team} headshotUrl={row.headshot} label={row.name} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-[color:var(--flat)]">{row.name}</div>
          <div className="truncate text-[11px] text-zinc-500">{row.market} · line {row.line}</div>
        </div>
        <div className="text-right">
          <div className="tabular text-lg font-black" style={{ color }}>
            {row.value === null ? "—" : row.value}
            <span className="text-xs text-zinc-500">/{row.line}</span>
          </div>
          {row.stamp ? <div className="text-[10px] font-black tracking-wider" style={{ color }}>{row.stamp}</div> : null}
          {row.pace !== null ? <div className="text-[10px] text-zinc-500">pace {row.pace}</div> : null}
          {row.valueLabel === "last 5" ? <div className="text-[10px] text-zinc-500">last 5</div> : null}
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: fill + "%", background: color, transition: "width 700ms ease" }} />
      </div>
    </li>
  );
}

/** Neon soccer pitch: halves in team colors, the last key moment named. */
function Pitch({ snap, awayColor, homeColor, children }: { snap: LiveSnap; awayColor: string; homeColor: string; children?: React.ReactNode }) {
  const last = [...snap.plays].reverse().find((p) => p.text);
  return (
    <svg viewBox="0 0 120 70" preserveAspectRatio="xMidYMax meet" aria-label="Pitch">
      <defs>
        <linearGradient id="pitch" x1="0" x2="1">
          <stop offset="0" stopColor={awayColor} stopOpacity="0.28" />
          <stop offset="0.5" stopColor="#0b3d1f" />
          <stop offset="1" stopColor={homeColor} stopOpacity="0.28" />
        </linearGradient>
      </defs>
      <rect x="4" y="6" width="112" height="60" rx="2" fill="url(#pitch)" stroke="#a855f7" strokeWidth="0.6" style={{ filter: "drop-shadow(0 0 3px #a855f7)" }} />
      <line x1="60" y1="6" x2="60" y2="66" stroke="rgba(255,255,255,0.55)" strokeWidth="0.4" />
      <circle cx="60" cy="36" r="9" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.4" />
      <rect x="4" y="22" width="16" height="28" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.4" />
      <rect x="100" y="22" width="16" height="28" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.4" />
      <rect x="1.5" y="31" width="2.5" height="10" fill={awayColor} />
      <rect x="116" y="31" width="2.5" height="10" fill={homeColor} />
      {last ? (
        <text x="60" y="4" fontSize="3.2" textAnchor="middle" fill="rgba(255,255,255,0.75)">
          {last.text.slice(0, 70)}
        </text>
      ) : null}
      {children}
    </svg>
  );
}

/** Overtime intro, clutch heartbeat, team-run combo meter, and heat check. Real plays only. */
function GameFeel({ league, snap, awayColor, homeColor }: { league: string; snap: LiveSnap | null; awayColor: string; homeColor: string }) {
  const ot = snap?.state === "in" ? otLabel(league, snap.period) : null;
  const hot = clutch(league, snap);
  const run = snap && snap.state === "in" ? runMeter(snap.plays) : null;
  const heat = snap && snap.state === "in" ? heatCheck(snap.plays) : null;
  const colorOf = (teamId: string) => (snap && teamId === snap.homeId ? homeColor : awayColor);
  return (
    <>
      {ot ? (
        <div key={"ot" + snap?.period} className="ot-intro" aria-live="polite">
          <span>{ot === "OT" ? "OVERTIME" : ot.toUpperCase()}</span>
        </div>
      ) : null}
      {hot ? <div className="clutch-edges" aria-hidden /> : null}
      {hot ? <span className="clutch-tag">{ot ? "Sudden death" : "Clutch time"} ♥</span> : null}
      <div className="pointer-events-none absolute inset-x-3 top-[5.6rem] z-[20] flex justify-between gap-2">
        {run ? (
          <span key={run.label} className={"combo-meter " + (run.fire ? "on-fire" : "")} style={{ ["--combo" as string]: colorOf(run.teamId) } as React.CSSProperties}>
            {run.fire ? "🔥 " : ""}
            {run.label}
          </span>
        ) : (
          <span />
        )}
        {heat ? (
          <span key={heat.name} className="heat-check" style={{ ["--combo" as string]: colorOf(heat.teamId) } as React.CSSProperties}>
            Heat check · {heat.name}
          </span>
        ) : null}
      </div>
    </>
  );
}

/**
 * Your player was in the play just drawn: their leg, ticking. "Kupp 64/70.5 rec yds +12".
 * Gold level-up and HIT when the leg clears; a red glitch when the play hurt it (an Under moving up, a miss).
 */
function MineChip({ league, play }: { league: string; play: LivePlay | null }) {
  const legs = useGameLegList();
  const last = useRef<Map<string, number>>(new Map());
  const shown = useRef<string | null>(null);
  const leg = play ? legs.find((l) => mentions(play.text, l.name)) ?? null : null;
  const [chip, setChip] = useState<{ id: string; text: string; gain: number | null; hit: boolean; hurt: boolean; face: string | null } | null>(null);
  useEffect(() => {
    // Remember every leg's value so the next play can show what it added.
    for (const l of legs) if (l.value !== null && !last.current.has(l.pickId)) last.current.set(l.pickId, l.value);
  }, [legs]);
  useEffect(() => {
    if (!play || !leg || shown.current === play.id) return;
    shown.current = play.id;
    const before = last.current.get(leg.pickId);
    const gain = leg.value !== null && before !== undefined ? leg.value - before : null;
    if (leg.value !== null) last.current.set(leg.pickId, leg.value);
    const short = shortName(leg.name);
    const lineText = leg.lineText ?? String(leg.line);
    const stat = leg.market.replace(/receiving/i, "rec").replace(/rushing/i, "rush").replace(/passing/i, "pass").replace(/yards/i, "yds").toLowerCase();
    const hit = leg.status === "cleared";
    const hurt = leg.status === "missed" || (leg.side === "Under" && (gain ?? 0) > 0) || (!!play.turnover && leg.side === "Over");
    setChip({ id: play.id, text: `${short} ${leg.value ?? "–"}/${lineText} ${stat}`, gain: gain && gain !== 0 ? gain : null, hit, hurt, face: headshotFor(league, leg.athleteId) });
    const t = setTimeout(() => setChip((c) => (c?.id === play.id ? null : c)), 4200);
    return () => clearTimeout(t);
  }, [play, leg, league]);
  if (!chip) return null;
  return (
    <div className="mt-2 flex justify-center" aria-live="polite">
      <span key={chip.id} className={"mine-chip" + (chip.hit ? " hit" : chip.hurt ? " hurt" : "")} data-testid="mine-chip">
        {chip.face ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={chip.face} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="mine-dot" />
        )}
        <span className="tabular">{chip.text}</span>
        {chip.gain !== null ? <span className={"tabular " + (chip.hurt ? "text-[color:var(--minus)]" : "gain")}>{chip.gain > 0 ? "+" : ""}{chip.gain}</span> : null}
        {chip.hit ? <span className="hit-tag">HIT</span> : null}
      </span>
    </div>
  );
}
