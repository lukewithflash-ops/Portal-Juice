"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [league, setLeague] = useState<LeagueId | "ALL">("ALL");
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
    const base = league === "ALL" ? games : games.filter((g) => g.league === league);
    if (!team) return base;
    const yours = (g: Game) =>
      g.league === team.league && (g.home.abbr === team.abbr || g.away.abbr === team.abbr);
    return [...base].sort((a, b) => Number(yours(b)) - Number(yours(a)));
  }, [games, league, team]);
  const isYours = (g: Game) =>
    !!team && g.league === team.league && (g.home.abbr === team.abbr || g.away.abbr === team.abbr);
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

      <div className="sticky top-[calc(6.6rem+env(safe-area-inset-top))] z-30 -mx-4 mb-4 border-b border-purple-500/15 bg-[#030306]/90 px-4 py-2 backdrop-blur">
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip active={league === "ALL"} onClick={() => setLeague("ALL")}>
            All
          </Chip>
          {LEAGUES.map((l) => (
            <Chip key={l.id} active={league === l.id} onClick={() => setLeague(l.id)}>
              {l.label}
            </Chip>
          ))}
        </div>
      </div>

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
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
        active ? "bg-purple-500/25 text-white" : "text-zinc-400"
      }`}
    >
      {children}
    </button>
  );
}
