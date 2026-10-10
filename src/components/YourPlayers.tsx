"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLiveHub, type PlayerMoment } from "@/components/LiveHub";
import { headshotFor } from "@/lib/faces";
import type { LiveSnap } from "@/lib/live";
import { ChanceBadge } from "@/components/LegMeter";
import { EntrySlip } from "@/components/EntrySlip";
import { CHANCE_NOTE, combinedChance, liveTeamChance, playedShare, pregameChance, type Chance } from "@/lib/chance";
import { sportOf } from "@/lib/legPick";
import { legFromPick, TONE_COLOR, type Leg } from "@/lib/motivation";
import { addPick, getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { clockSpan } from "@/lib/tracker";
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

export type TeamLeg = { pickId: string; slipKey: string; label: string; chance: Chance | null; status: "hit" | "miss" | "open" };

/** Spread, moneyline, and total picks on this game, with a live chance. */
function useTeamLegs(league: string, gameId: string, snap: LiveSnap | null): TeamLeg[] {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  return useMemo(() => {
    const out: TeamLeg[] = [];
    for (const p of picks) {
      if (p.status !== "open" || p.gameId !== gameId) continue;
      const m = (p.market ?? "").toLowerCase();
      const kind = /spread|run line|puck line/.test(m) ? "spread" : /money|^ml$/.test(m) ? "moneyline" : /^total$|game total/.test(m) ? "total" : null;
      if (!kind) continue;
      const subj = p.subject.toLowerCase();
      const side: "home" | "away" | null = !snap ? null : subj.includes(snap.homeAbbr.toLowerCase()) && !subj.includes(snap.awayAbbr.toLowerCase()) ? "home" : subj.includes(snap.awayAbbr.toLowerCase()) && !subj.includes(snap.homeAbbr.toLowerCase()) ? "away" : null;
      const pick = kind === "total" ? (p.selection === "Under" ? "under" : "over") : side;
      const label =
        kind === "total" ? `${p.selection ?? "Over"} ${p.line}` : kind === "spread" ? `${p.subject} ${p.line > 0 ? "+" : ""}${p.line}` : `${p.subject} ML`;
      let chance: Chance | null = null;
      if (snap && snap.state !== "pre" && pick) {
        const span = clockSpan(league, snap.period, snap.clock, snap.state);
        chance = liveTeamChance({
          league,
          kind,
          pick,
          home: Number(snap.homeScore) || 0,
          away: Number(snap.awayScore) || 0,
          played: playedShare(league, span, snap.period, snap.state, snap.bug?.half ?? null),
          final: snap.state === "post",
          line: kind === "moneyline" ? null : p.line,
          homeWin: snap.homeWin,
          spreadHome: snap.spreadHome,
          total: snap.total,
        });
      } else chance = pregameChance(p.odds);
      const status = chance?.source === "done" ? (chance.pct >= 99.9 ? "hit" : "miss") : "open";
      out.push({ pickId: p.id, slipKey: p.slipId ?? p.id, label, chance, status });
    }
    return out;
  }, [picks, gameId, snap, league]);
}

type DockData = { league: string; gameId: string; snap: LiveSnap | null; legs: Leg[]; team: TeamLeg[]; moment: PlayerMoment | null };
const Dock = createContext<DockData | null>(null);

/** Wraps the game so play rows can tag your players and the bets dock can sit beside the play. */
export function YourPlayersProvider({ league, gameId, snap, children }: { league: string; gameId: string; snap: LiveSnap | null; children: React.ReactNode }) {
  const legs = useGameLegs(gameId, snap);
  const team = useTeamLegs(league, gameId, snap);
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
  const dock = useMemo(() => ({ league, gameId, snap, legs, team, moment }), [league, gameId, snap, legs, team, moment]);
  return (
    <YP.Provider value={value}>
      <Dock.Provider value={dock}>{children}</Dock.Provider>
    </YP.Provider>
  );
}

function Face({ league, leg, size = 32, hot }: { league: string; leg: Leg; size?: number; hot: boolean }) {
  const color = TONE_COLOR[leg.tone];
  const face = headshotFor(league, leg.athleteId);
  return (
    <span className={`relative flex-none ${hot ? "your-player-ring" : ""}`}>
      {face ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={face} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size, border: `1.5px solid ${color}` }} referrerPolicy="no-referrer" />
      ) : (
        <span className="flex items-center justify-center rounded-full bg-white/10 text-[11px] font-black text-white" style={{ width: size, height: size, border: `1.5px solid ${color}` }}>
          {leg.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
        </span>
      )}
    </span>
  );
}

function summary(legs: Leg[], team: TeamLeg[]) {
  const total = legs.length + team.length;
  const hit = legs.filter((l) => l.status === "cleared").length + team.filter((t) => t.status === "hit").length;
  const pcts = [...legs.map((l) => l.chance?.pct ?? null), ...team.map((t) => t.chance?.pct ?? null)];
  return { total, hit, all: total > 1 ? combinedChance(pcts) : null };
}

/**
 * Your bets in this game, attached to the play. variant "bar": sticky under the score bug on phones.
 * variant "side": the desktop column beside the feed.
 */
export function BetsDock({ variant }: { variant: "bar" | "side" }) {
  const d = useContext(Dock);
  const [open, setOpen] = useState(false);
  const [logging, setLogging] = useState(false);
  if (!d) return null;
  const { league, legs, team, moment, snap, gameId } = d;
  const s = summary(legs, team);
  const side = variant === "side";
  const expanded = side || open;
  return (
    <section
      aria-label="Your bets"
      className={
        side
          ? "foil-tile mb-3 p-3"
          : "sticky top-[calc(var(--chrome-h,calc(6.6rem+env(safe-area-inset-top))))] z-20 -mx-4 border-y border-[color:var(--gold)]/30 bg-[#05040a] px-3 py-1.5 lg:hidden"
      }
    >
      <div className="flex items-center gap-2">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => !side && setOpen((v) => !v)} aria-expanded={expanded}>
          <span className="text-[10px] font-black uppercase tracking-[0.18em] tone-gold">⭐ Your bets</span>
          {s.total ? (
            <span className="tabular text-[11px] font-black text-white">
              {s.hit} of {s.total} hit
            </span>
          ) : (
            <span className="text-[11px] text-zinc-500">None on this game yet</span>
          )}
          {s.all != null ? (
            <span className="text-[10px] text-zinc-400">
              all <ChanceBadge chance={{ pct: s.all, source: "pace" }} />
            </span>
          ) : null}
          {!side && s.total ? <span className="ml-auto text-[10px] text-zinc-500">{open ? "▴" : "▾"}</span> : null}
        </button>
        <button
          type="button"
          onClick={() => setLogging((v) => !v)}
          className="flex-none rounded-lg border border-[color:var(--plus)]/60 px-2 py-1 text-[11px] font-black text-[color:var(--plus)]"
        >
          {logging ? "Close" : "+ Log a pick"}
        </button>
      </div>
      {!expanded && s.total ? (
        <ul className="mt-1 flex gap-2 overflow-x-auto pb-0.5">
          {legs.map((l) => (
            <li key={l.pickId} className={`flex flex-none items-center gap-1.5 rounded-full border bg-black/40 py-0.5 pl-0.5 pr-2 ${moment?.pickId === l.pickId ? "your-player" : ""}`} style={{ borderColor: `color-mix(in srgb, ${TONE_COLOR[l.tone]} 55%, transparent)` }}>
              <Face league={league} leg={l} size={22} hot={moment?.pickId === l.pickId} />
              <span className="tabular text-[11px] font-black" style={{ color: TONE_COLOR[l.tone] }}>
                {l.name.split(" ").slice(-1)[0]} {l.value ?? "—"}/{l.line}
              </span>
              <ChanceBadge chance={l.chance} />
            </li>
          ))}
          {team.map((t) => (
            <li key={t.pickId} className="flex flex-none items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-2 py-0.5">
              <span className="text-[11px] font-black text-white">{t.label}</span>
              <ChanceBadge chance={t.chance} />
            </li>
          ))}
        </ul>
      ) : null}
      {expanded && s.total ? (
        <ul className="mt-2 space-y-1.5">
          {legs.length && snap ? (
            <li className="list-none">
              <EntrySlip
                title="Your picks in this game"
                compact={!side}
                slip={{ key: `game-${gameId}`, legs, total: legs.length, hit: legs.filter((l) => l.status === "cleared").length, missed: legs.filter((l) => l.status === "missed").length }}
                snaps={{ [`${league}/${gameId}`]: snap }}
              />
            </li>
          ) : null}
          {team.map((t) => (
            <li key={t.pickId} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 px-2 py-1.5">
              <span className="text-[12px] font-bold text-white">{t.label}</span>
              <span className="flex items-center gap-1.5">
                {t.status !== "open" ? <span className={"text-[10px] font-black uppercase " + (t.status === "hit" ? "tone-gold" : "text-[color:var(--minus)]")}>{t.status === "hit" ? "Hit!" : "Missed"}</span> : null}
                <ChanceBadge chance={t.chance} />
              </span>
            </li>
          ))}
          <li className="list-none text-[10px] text-zinc-500">{CHANCE_NOTE}{s.all != null ? " All-legs chance multiplies legs; same-game legs move together, so it is rough." : ""}</li>
        </ul>
      ) : null}
      {logging ? <QuickLog league={league} gameId={gameId} snap={snap} onDone={() => setLogging(false)} /> : null}
    </section>
  );
}

const MARKETS: Record<string, string[]> = {
  nfl: ["Passing Yards", "Rushing Yards", "Receiving Yards", "Receptions", "Passing Touchdowns"],
  ncaaf: ["Passing Yards", "Rushing Yards", "Receiving Yards", "Receptions"],
  nba: ["Points", "Rebounds", "Assists", "3-Pointers", "Points + Rebounds + Assists"],
  mlb: ["Hits", "Total Bases", "Strikeouts", "Home Runs", "RBIs"],
  nhl: ["Shots on Goal", "Points", "Goals", "Assists", "Saves"],
};

/** Log a bet on this game in a few taps. Saved on this device. Nothing is placed. */
function QuickLog({ league, gameId, snap, onDone }: { league: string; gameId: string; snap: LiveSnap | null; onDone: () => void }) {
  const [kind, setKind] = useState<"prop" | "spread" | "moneyline" | "total">("prop");
  const [who, setWho] = useState("");
  const [market, setMarket] = useState((MARKETS[league] ?? ["Points"])[0]);
  const [line, setLine] = useState("");
  const [sel, setSel] = useState<"Over" | "Under">("Over");
  const [team, setTeam] = useState<"away" | "home">("away");
  const [odds, setOdds] = useState("");
  const [err, setErr] = useState("");
  const players = useMemo(() => [...new Set((snap?.boxes ?? []).flatMap((b) => b.players.map((p) => p.name)))].sort(), [snap]);
  const abbr = team === "home" ? snap?.homeAbbr ?? "Home" : snap?.awayAbbr ?? "Away";
  function save() {
    const n = Number(line);
    const o = Number(odds);
    if (kind === "prop" && who.trim().length < 3) return setErr("Add the player.");
    if (kind !== "moneyline" && (line.trim() === "" || !Number.isFinite(n))) return setErr("Add the line.");
    const now = new Date();
    addPick({
      id: crypto.randomUUID(),
      sport: sportOf(league),
      subject: kind === "prop" ? who.trim() : kind === "total" ? `${snap?.awayAbbr ?? "Away"} @ ${snap?.homeAbbr ?? "Home"}` : abbr,
      line: kind === "moneyline" ? 0 : n,
      odds: Number.isFinite(o) && Math.abs(o) >= 100 ? Math.round(o) : 0,
      stake: 0,
      book: "Not set",
      date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      status: "open",
      createdAt: now.toISOString(),
      league,
      gameId,
      market: kind === "prop" ? market : kind === "spread" ? "Spread" : kind === "total" ? "Total" : "Moneyline",
      selection: kind === "prop" || kind === "total" ? sel : null,
    });
    onDone();
  }
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-black/50 p-2">
      <div className="grid grid-cols-4 gap-1">
        {(["prop", "spread", "total", "moneyline"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={"rounded-lg px-1 py-1 text-[11px] font-bold " + (kind === k ? "bg-white/15 text-white" : "text-zinc-400")}>
            {k === "prop" ? "Player" : k === "moneyline" ? "ML" : k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>
      {kind === "prop" ? (
        <>
          <input className="field w-full" list={`ql-${gameId}`} placeholder="Player" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Player" />
          <datalist id={`ql-${gameId}`}>
            {players.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <select className="field w-full" value={market} onChange={(e) => setMarket(e.target.value)} aria-label="Stat">
            {(MARKETS[league] ?? ["Points"]).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </>
      ) : kind !== "total" ? (
        <div className="grid grid-cols-2 gap-1">
          {(["away", "home"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTeam(t)} className={"rounded-lg py-1 text-xs font-black " + (team === t ? "bg-white/15 text-white" : "text-zinc-400")}>
              {t === "home" ? snap?.homeAbbr ?? "Home" : snap?.awayAbbr ?? "Away"}
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-1">
        {kind === "prop" || kind === "total" ? (
          <select className="field" value={sel} onChange={(e) => setSel(e.target.value as "Over" | "Under")} aria-label="Side">
            <option>Over</option>
            <option>Under</option>
          </select>
        ) : (
          <span />
        )}
        {kind !== "moneyline" ? <input className="field" inputMode="decimal" placeholder={kind === "spread" ? "-3.5" : "Line"} value={line} onChange={(e) => setLine(e.target.value)} aria-label="Line" /> : <span />}
        <input className="field" inputMode="numeric" placeholder="Price" value={odds} onChange={(e) => setOdds(e.target.value)} aria-label="Price" />
      </div>
      {err ? <p className="text-[11px] text-[color:var(--minus)]">{err}</p> : null}
      <button type="button" onClick={save} className="w-full rounded-lg bg-[color:var(--plus)] py-1.5 text-xs font-black text-black">
        Track it
      </button>
    </div>
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
