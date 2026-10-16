"use client";

import { NoteTag } from "@/components/Notes";
import { matchupKey } from "@/lib/notesCore";
import Link from "next/link";
import { useState } from "react";
import { usePoll, POLL_ERROR_MS } from "@/components/usePoll";
import type { AllLive as AllLiveData, AllLiveGame } from "@/lib/allLive";

const ACTIVE_MS = 10_000;
const IDLE_MS = 45_000;

/** Every game in progress across every league. Polls one batched endpoint. */
export function useAllLive(active: boolean): AllLiveData | null {
  const [data, setData] = useState<AllLiveData | null>(null);
  usePoll(async (signal) => {
    const r = await fetch("/api/live/all", { cache: "no-store", signal });
    if (!r.ok) return POLL_ERROR_MS;
    setData((await r.json()) as AllLiveData);
    return active ? ACTIVE_MS : IDLE_MS;
  }, "all-live:" + (active ? "on" : "off"));
  return data;
}

const LEAGUE_HUE: Record<string, string> = {
  nfl: "#3b82f6", ncaaf: "#60a5fa", nba: "#f97316", wnba: "#fb923c", ncaam: "#fdba74", ncaaw: "#fed7aa",
  mlb: "#ef4444", nhl: "#38bdf8", "hockey.womens-college-hockey": "#7dd3fc", "hockey.mens-college-hockey": "#7dd3fc", epl: "#a855f7", ucl: "#6366f1", laliga: "#f43f5e", seriea: "#22d3ee",
  bundesliga: "#e11d48", mls: "#84cc16", atp: "#facc15", wta: "#f472b6", pga: "#22c55e", ufc: "#dc2626",
};

export function LeagueBadge({ league, label }: { league: string; label: string }) {
  const c = LEAGUE_HUE[league] ?? (league.startsWith("soccer.") ? "#c084fc" : league.startsWith("volleyball.") ? "#2dd4bf" : league.startsWith("golf.") ? "#4ade80" : league.startsWith("mma.") ? "#f87171" : "#a1a1aa");
  return (
    <span className="shrink-0 rounded px-1.5 py-px text-[10px] font-black uppercase tracking-wider" style={{ color: c, background: `color-mix(in srgb, ${c} 16%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 45%, transparent)` }}>
      {label}
    </span>
  );
}

export default function AllLive({ data }: { data: AllLiveData | null }) {
  const [pick, setPick] = useState("all");
  if (!data) return <div className="h-32 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" aria-hidden />;
  const { games, leagues } = data;
  const sports = [...new Set(games.map((g) => g.group))].map((name) => ({ name, count: games.filter((g) => g.group === name).length }));
  const isGroup = pick.startsWith("g:");
  const filter = pick === "all" ? "all" : isGroup ? (sports.some((x) => "g:" + x.name === pick) ? pick : "all") : leagues.some((l) => l.id === pick) ? pick : "all";
  const inFilter = (g: AllLiveGame) => filter === "all" || g.league === filter || "g:" + g.group === filter;
  const shown = games.filter(inFilter);
  const groups = leagues.filter((l) => shown.some((g) => g.league === l.id));
  return (
    <div data-testid="all-live">
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter by league">
        <Chip on={filter === "all"} onClick={() => setPick("all")} label="All" count={games.length} />
        {sports.length > 1 && leagues.length > 5
          ? sports.map((x) => <Chip key={"g:" + x.name} on={filter === "g:" + x.name} onClick={() => setPick("g:" + x.name)} label={x.name} count={x.count} />)
          : null}
        {leagues.map((l) => (
          <Chip key={l.id} on={filter === l.id} onClick={() => setPick(l.id)} label={l.label} count={l.count} />
        ))}
      </div>
      {!games.length ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-zinc-400">
          No games are in progress right now in any league.{" "}
          <Link href="/games" className="font-bold text-[color:var(--plus)]">
            Today&apos;s games →
          </Link>
        </p>
      ) : (
        groups.map((l) => (
          <section key={l.id} className="mb-4" aria-label={`${l.label} live`}>
            <h2 className="mb-1.5 flex items-center gap-2">
              <LeagueBadge league={l.id} label={l.label} />
              <span className="tabular text-[12px] font-black text-zinc-300">{l.count} live</span>
            </h2>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {shown
                .filter((g) => g.league === l.id)
                .map((g) => (
                  <AllRow key={g.key} g={g} />
                ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function Chip({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={"tabular shrink-0 rounded-full border px-2.5 py-1 text-[12px] font-black " + (on ? "border-[color:var(--plus)] bg-[color:var(--plus)]/15 text-white" : "border-white/15 text-zinc-400")}
    >
      {label} <span className={on ? "text-[color:var(--plus)]" : "text-zinc-500"}>{count}</span>
    </button>
  );
}

function Side({ s, lead, sets }: { s: AllLiveGame["away"]; lead: boolean; sets?: string[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {s.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.logo} alt="" width={16} height={16} className="h-4 w-4 shrink-0 object-contain" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span className="h-3 w-1 shrink-0 rounded-full" style={{ background: s.color ?? "#71717a" }} aria-hidden />
      )}
      <span className={"min-w-0 flex-1 truncate text-[13px] font-bold " + (lead ? "text-white" : "text-white/75")}>
        {s.short || s.name}
        {sets ? <span className="ml-1"><NoteTag player={{ name: s.name }} /></span> : null}
        {s.serving ? <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--plus)] align-middle" title="Serving" aria-label="serving" data-testid="serving" /> : null}
      </span>
      {sets?.length ? (
        <span className="tabular flex gap-1 text-[12px] font-bold text-zinc-300" data-testid="sets">
          {sets.map((x, i) => (
            <span key={i} className={"w-4 text-center " + (i === sets.length - 1 ? "text-white" : "")}>{x}</span>
          ))}
        </span>
      ) : null}
      <span className={"tabular w-7 text-right text-[14px] font-black " + (lead ? "text-white" : "text-white/70")}>{sets?.length ? "" : s.score ?? ""}</span>
    </div>
  );
}

function AllRow({ g }: { g: AllLiveGame }) {
  const a = Number(g.away.score);
  const h = Number(g.home.score);
  return (
    <Link href={g.href} className="block rounded-xl border border-white/12 bg-black/55 px-2.5 py-1.5 hover:border-[color:var(--plus)]" data-testid="all-live-row" aria-label={g.leaders ? `${g.label} ${g.event}` : `${g.label}: ${g.away.name} vs ${g.home.name}`}>
      <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
        <LeagueBadge league={g.league} label={g.label} />
        <span className="tv-live-dot shrink-0" aria-hidden />
        <span className="tabular min-w-0 truncate text-white">{g.detail || "Live"}</span>
        {!g.sets && !g.leaders ? <NoteTag matchup={matchupKey(g.league, g.away.short, g.home.short)} label={`${g.away.short} vs ${g.home.short}`} /> : null}
        {g.event ? <span className="ml-auto min-w-0 truncate normal-case tracking-normal text-zinc-500">{g.event}</span> : null}
      </div>
      {g.leaders ? (
        <ol className="space-y-0.5">
          {g.leaders.map((r, i) => (
            <li key={r.name + i} className="tabular flex items-center gap-1.5 text-[12px]">
              <span className="w-4 text-zinc-500">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-bold text-white">{r.name}</span>
              <span className="font-black text-[color:var(--plus)]">{r.score}</span>
              {r.thru ? <span className="text-[10px] text-zinc-500">thru {r.thru}</span> : null}
            </li>
          ))}
        </ol>
      ) : (
        <>
          <Side s={g.away} lead={a > h} sets={g.sets?.away} />
          <Side s={g.home} lead={h > a} sets={g.sets?.home} />
        </>
      )}
    </Link>
  );
}
