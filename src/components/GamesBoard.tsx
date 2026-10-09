"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MatchRow from "@/components/MatchRow";
import GolfBoardView from "@/components/GolfBoardView";
import { SPORT_LEAGUES, todayOnly, type SportSlate } from "@/lib/sports";
import { useRouter } from "next/navigation";
import GameTile, { type MoveFlag } from "@/components/GameTile";
import { usePrefs } from "@/components/Prefs";
import { LEAGUES, POPULAR_SIGNAL, applyScore, rankGames, type Game, type LeagueId, type ScoreRow } from "@/lib/slate";
import { POLL_ERROR_MS, usePoll } from "@/components/usePoll";

/** Scores list: 15s while anything is live or about to start, 60s otherwise. */
const LIST_LIVE_MS = 15_000;
const LIST_IDLE_MS = 60_000;

function listDelay(games: Game[]): number {
  const now = Date.now();
  const busy = games.some(
    (g) => g.state === "in" || (g.state === "pre" && Date.parse(g.start) - now < 15 * 60_000)
  );
  return busy ? LIST_LIVE_MS : LIST_IDLE_MS;
}

const SEEN_KEY = "pj-seen-lines-v1";

type Seen = Record<string, { total: number | null; spread: number | null }>;

function readSeen(): Seen {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Seen;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export default function GamesBoard({
  games: served,
  fetchedAt: servedAt,
  dayLabel,
  missing,
}: {
  games: Game[];
  fetchedAt: string;
  dayLabel: string;
  missing: string[];
}) {
  const router = useRouter();
  const { team } = usePrefs();
  const [league, setLeague] = useState<string>("ALL");
  const [sports, setSports] = useState<Record<string, SportSlate>>({});
  const bar = useRef<HTMLDivElement>(null);

  usePoll(async (signal) => {
    const res = await fetch("/api/sports", { signal });
    if (!res.ok) return POLL_ERROR_MS;
    const data = (await res.json()) as { slates: SportSlate[] };
    const map: Record<string, SportSlate> = {};
    for (const sl of data.slates) map[sl.league.id] = sl;
    setSports(map);
    return data.slates.some((sl) => sl.matches.some((m) => m.state === "in") || sl.golf.some((g) => g.state === "in")) ? 15_000 : 60_000;
  }, "sports");

  useEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [league]);
  const [ago, setAgo] = useState<number | null>(null);
  const [moves, setMoves] = useState<Record<string, MoveFlag>>({});
  const [live, setLive] = useState<{ at: string; rows: Record<string, ScoreRow> } | null>(null);
  const games = useMemo(
    () => (live ? served.map((g) => applyScore(g, live.rows[g.id])) : served),
    [served, live]
  );
  const fetchedAt = live && Date.parse(live.at) > Date.parse(servedAt) ? live.at : servedAt;

  usePoll(async (signal) => {
    const res = await fetch("/api/scores", { cache: "no-store", signal });
    if (!res.ok) return POLL_ERROR_MS;
    const data = (await res.json()) as { fetchedAt: string; scores: ScoreRow[] };
    const rows: Record<string, ScoreRow> = {};
    for (const r of data.scores) rows[r.id] = r;
    setLive({ at: data.fetchedAt, rows });
    return listDelay(served.map((g) => applyScore(g, rows[g.id])));
  }, "scores");

  useEffect(() => {
    const tick = () => {
      const ms = Date.now() - Date.parse(fetchedAt);
      setAgo(Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [fetchedAt]);

  useEffect(() => {
    const seen = readSeen();
    const next: Seen = { ...seen };
    const flags: Record<string, MoveFlag> = {};
    for (const g of served) {
      const total = g.price?.total ?? null;
      const spread = g.price?.spreadHome ?? null;
      if (total === null && spread === null) continue;
      const prev = seen[g.id];
      const flag: MoveFlag = {};
      if (prev && prev.total !== null && total !== null && prev.total !== total) {
        flag.total = { from: prev.total, to: total };
      }
      if (prev && prev.spread !== null && spread !== null && prev.spread !== spread) {
        flag.spread = { from: prev.spread, to: spread };
      }
      if (flag.total || flag.spread) flags[g.id] = flag;
      next[g.id] = { total, spread };
    }
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
    const id = requestAnimationFrame(() => setMoves(flags));
    return () => cancelAnimationFrame(id);
  }, [served]);

  const filtered = useMemo(() => {
    const base = league === "ALL" ? games : games.filter((g) => g.league === (league as LeagueId));
    if (!team) return base;
    const yours = (g: Game) =>
      g.league === team.league && (g.home.abbr === team.abbr || g.away.abbr === team.abbr);
    return [...base].sort((a, b) => Number(yours(b)) - Number(yours(a)));
  }, [games, league, team]);
  const isYours = (g: Game) =>
    !!team && g.league === team.league && (g.home.abbr === team.abbr || g.away.abbr === team.abbr);
  const sportPick = SPORT_LEAGUES.find((l) => l.id === league) ?? null;
  const popular = useMemo(() => rankGames(filtered).slice(0, 4), [filtered]);
  const withTotal = filtered.filter((g) => g.price?.total !== null);

  const agoLabel =
    ago === null ? "Updated" : ago < 5 ? "Updated just now" : ago < 60 ? `Updated ${ago} sec ago` : `Updated ${Math.floor(ago / 60)} min ago`;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          {dayLabel} · {agoLabel}
          {missing.length > 0 ? ` · ${missing.join(", ")} didn’t load` : ""}
        </p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="shrink-0 rounded-lg border border-purple-400/30 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-zinc-300"
        >
          Refresh
        </button>
      </div>

      <div className="sticky top-[calc(var(--chrome-h,calc(6.6rem+env(safe-area-inset-top)))+var(--live-h,0px)-1px)] z-30 -mx-4 mb-4 border-b border-purple-500/20 bg-[#030306] px-4 py-2" data-testid="league-bar">
        <div ref={bar} className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip active={league === "ALL"} onClick={() => setLeague("ALL")}>
            All
          </Chip>
          {LEAGUES.map((l) => {
            const n = games.filter((g) => g.league === l.id).length;
            return (
              <Chip key={l.id} active={league === l.id} dim={n === 0} onClick={() => setLeague(l.id)}>
                {l.label}
              </Chip>
            );
          })}
          {SPORT_LEAGUES.filter((l) => (sportCount(sports[l.id]) > 0) || league === l.id).map((l) => (
            <Chip key={l.id} active={league === l.id} onClick={() => setLeague(l.id)}>
              {l.label}
            </Chip>
          ))}
        </div>
      </div>

      {sportPick ? (
        <SportList slate={sports[sportPick.id] ?? null} name={sportPick.name} />
      ) : (
      <>
      <section aria-label="Popular games">
        <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-purple-200/80">Popular</h2>
        <p className="mt-1 mb-3 text-[11px] leading-relaxed text-zinc-500">{POPULAR_SIGNAL}</p>
        {popular.length === 0 ? (
          <p className="panel rounded-xl px-4 py-5 text-sm text-zinc-400">No games from ESPN for this day.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {popular.map((g) => (
              <GameTile key={g.id} game={g} move={moves[g.id]} yours={isYours(g)} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8" aria-label="Over unders">
        <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-purple-200/80">Over / unders</h2>
        <p className="mt-1 mb-3 text-[11px] text-zinc-500">Game totals only, from the provider ESPN lists. Nothing is filled in.</p>
        {withTotal.length === 0 ? (
          <p className="panel rounded-xl px-4 py-5 text-sm text-zinc-400">No total posted for these games.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {withTotal.map((g) => (
              <GameTile key={`ou-${g.id}`} game={g} move={moves[g.id]} yours={isYours(g)} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8" aria-label="Today">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-purple-200/80">
          Today <span className="tabular text-zinc-500">{filtered.length}</span>
        </h2>
        {filtered.length === 0 ? (
          <p className="panel rounded-xl px-4 py-5 text-sm text-zinc-400">No games from ESPN for this day.</p>
        ) : (
          <div className="grid gap-2">
            {filtered.map((g) => (
              <GameTile key={`all-${g.id}`} game={g} move={moves[g.id]} rich={false} yours={isYours(g)} />
            ))}
          </div>
        )}
      </section>
      {league === "ALL" ? <MoreToday sports={sports} /> : null}
      </>
      )}
    </div>
  );
}

function sportCount(sl: SportSlate | undefined): number {
  return sl ? sl.matches.length + sl.golf.length : 0;
}

function SportList({ slate, name }: { slate: SportSlate | null; name: string }) {
  if (!slate) return <p className="panel rounded-xl px-4 py-5 text-sm text-zinc-400">Loading {name} from ESPN…</p>;
  if (!sportCount(slate)) return <p className="panel rounded-xl px-4 py-5 text-sm text-zinc-400">Nothing on ESPN&apos;s {name} board right now.</p>;
  return (
    <section aria-label={name}>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-purple-200/80">
        {name} <span className="tabular text-zinc-500">{sportCount(slate)}</span>
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {slate.golf.map((b) => (
          <div key={b.id} className="sm:col-span-2">
            <GolfBoardView b={b} />
          </div>
        ))}
        {slate.matches.map((m) => (
          <MatchRow key={m.id} m={m} href={`/sports/${slate.league.id}/${m.id}`} />
        ))}
      </div>
    </section>
  );
}

/** Under "All": the extra leagues with something live or on today, grouped by sport. */
function MoreToday({ sports }: { sports: Record<string, SportSlate> }) {
  const groups = [...new Set(SPORT_LEAGUES.map((l) => l.group))];
  const blocks = groups
    .map((g) => ({
      g,
      rows: SPORT_LEAGUES.filter((l) => l.group === g)
        .map((l) => sports[l.id])
        .filter((sl): sl is SportSlate => !!sl)
        .map((sl) => ({ sl, matches: todayOnly(sl.matches), golf: sl.golf.filter((b) => b.state !== "post") }))
        .filter((x) => x.matches.length || x.golf.length),
    }))
    .filter((b) => b.rows.length);
  if (!blocks.length) return null;
  return (
    <>
      {blocks.map((b) => (
        <section key={b.g} className="mt-8" aria-label={b.g}>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-purple-200/80">{b.g} today</h2>
          <div className="space-y-4">
            {b.rows.map(({ sl, matches, golf }) => (
              <div key={sl.league.id}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">{sl.league.name}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {golf.map((g) => (
                    <div key={g.id} className="sm:col-span-2">
                      <GolfBoardView b={g} />
                    </div>
                  ))}
                  {matches.slice(0, 8).map((m) => (
                    <MatchRow key={m.id} m={m} href={`/sports/${sl.league.id}/${m.id}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function Chip({
  active,
  dim = false,
  onClick,
  children,
}: {
  active: boolean;
  dim?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
        active ? "bg-purple-500/25 text-white" : dim ? "text-zinc-600" : "text-zinc-400"
      }`}
    >
      {children}
    </button>
  );
}
