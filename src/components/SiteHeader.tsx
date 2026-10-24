"use client";

import Link from "next/link";
import Bell from "@/components/Bell";
import AccountButton from "@/components/AccountButton";
import StreakGlow from "@/components/StreakGlow";
import VipBadge from "@/components/VipBadge";
import CoinPill from "@/components/CoinPill";
import { useLiveHub } from "@/components/LiveHub";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePrefs, type FavTeam } from "@/components/Prefs";
import { IMPLIED_TIP } from "@/lib/odds";
import { LEAGUES, type LeagueId } from "@/lib/slate";
import { SITE_NAME, TAGLINE } from "@/lib/site";
import { SECTIONS, sectionOf } from "@/lib/nav";
import type { TeamOption } from "@/lib/team";

export default function SiteHeader() {
  const path = usePathname();
  const firstPath = useRef(path);
  const [showTagline, setShowTagline] = useState(true);
  const { odds, setOdds, team } = usePrefs();
  const liveCount = useLiveHub().live.length;
  // Portal ring spins open on launch (once a session) and on big moments.
  const [spinN, setSpinN] = useState(0);
  useEffect(() => {
    const go = () => setSpinN((n) => n + 1);
    let first = false;
    try {
      first = !sessionStorage.getItem("pj-launched");
      sessionStorage.setItem("pj-launched", "1");
    } catch {}
    const t = first ? setTimeout(go, 0) : null;
    window.addEventListener("pj-portal", go);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener("pj-portal", go);
    };
  }, []);
  const spin = spinN ? (spinN % 2 ? "portal-spin" : "portal-spin2") : "";

  useEffect(() => {
    if (path !== firstPath.current) {
      const id = requestAnimationFrame(() => setShowTagline(false));
      return () => cancelAnimationFrame(id);
    }
  }, [path]);

  useEffect(() => {
    const link = document.querySelector('link[rel="apple-touch-icon"]');
    if (!(link instanceof HTMLLinkElement)) return;
    if (!team) {
      link.href = "/icons/apple-touch-icon.png";
      return;
    }
    link.href = "/api/icon?color=" + team.color + "&alt=" + team.alt + "&abbr=" + encodeURIComponent(team.abbr) + "&size=180";
  }, [team]);

  return (
    <header className="site-chrome">
      <div className="mx-auto max-w-6xl px-3 pt-2.5 sm:px-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/lines" className="flex shrink-0 items-center gap-1.5 sm:gap-2.5" aria-label={SITE_NAME + " — Lines"}>
            {team ? (
              <span className={"brand-mask h-7 w-9 shrink-0 sm:h-9 sm:w-11 " + spin} aria-hidden />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/brand/swirl-mark.png" alt="" width={44} height={37} className={"h-7 w-auto shrink-0 mix-blend-screen sm:h-9 " + spin} aria-hidden />
            )}
            {team?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={team.logo} alt="" width={24} height={24} className="hidden h-6 w-6 shrink-0 min-[380px]:block" />
            ) : null}
            <span className="flex shrink-0 flex-col leading-none">
              <span className="wordmark whitespace-nowrap text-[17px] font-black tracking-tight sm:text-xl" data-testid="site-name">{SITE_NAME}</span>
              {showTagline && (
                <span className="mt-1 whitespace-nowrap text-[9px] font-medium uppercase tracking-[0.12em] text-zinc-400 sm:text-[10px] sm:tracking-[0.22em]">{TAGLINE}</span>
              )}
            </span>
          </Link>
          <div className="ml-auto flex min-w-0 shrink items-center gap-1 sm:gap-1.5">
            <VipBadge />
            <CoinPill />
            <StreakGlow />
            <Bell />
            <button
              type="button"
              className="shrink-0 rounded-lg border border-white/10 px-1.5 py-1 text-[11px] font-bold text-zinc-200 sm:px-2"
              aria-pressed={odds === "pct"}
              aria-label={odds === "pct" ? "Odds: implied chance. Tap for American odds." : "Odds: American. Tap for implied chance."}
              title={IMPLIED_TIP}
              onClick={() => setOdds(odds === "pct" ? "american" : "pct")}
            >
              <span className="sm:hidden" aria-hidden>{odds === "pct" ? "%" : "+110"}</span>
              <span className="sr-only sm:not-sr-only">{odds === "pct" ? "Implied chance" : "American odds"}</span>
            </button>
            <AccountButton />
          </div>
        </div>
        <nav aria-label="Sections" className="hidden items-center gap-1 pb-2 pt-1 lg:flex">
          {SECTIONS.map((n) => {
            const active = sectionOf(path).id === n.id;
            return (
              <Link
                key={n.id}
                href={n.href}

                aria-current={active ? "page" : undefined}
                className={
                  "press shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors " +
                  (active ? "bg-purple-500/20 text-white shadow-[inset_0_-2px_0_var(--plus)]" : "text-zinc-400 hover:bg-purple-500/10 hover:text-zinc-100")
                }
              >
                {n.label}
                {n.id === "live" && liveCount > 0 ? (
                  <span className="tabular ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 align-[1px] text-[10px] font-black text-black" style={{ background: "var(--plus)" }} aria-label={`${liveCount} live`}>
                    {liveCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="h-2 lg:hidden" />
      </div>
    </header>
  );
}

export function TeamPicker({
  team,
  onPick,
  onClose,
}: {
  team: FavTeam | null;
  onPick: (t: FavTeam | null) => void;
  onClose: () => void;
}) {
  const start = team && LEAGUES.some((l) => l.id === team.league) ? (team.league as LeagueId) : "nfl";
  const [league, setLeague] = useState<LeagueId>(start);
  const [rows, setRows] = useState<TeamOption[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let stop = false;
    fetch("/api/teams/" + league)
      .then((r) => r.json())
      .then((data: { teams?: TeamOption[] }) => {
        if (!stop) setRows(data.teams ?? []);
      })
      .catch(() => {
        if (!stop) setErr("Teams didn’t load.");
      });
    return () => {
      stop = true;
    };
  }, [league]);

  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-[#0b0b12] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">Favorite team</p>
        <button type="button" className="text-[11px] text-zinc-500" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="mb-2 flex gap-1 overflow-x-auto">
        {LEAGUES.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setLeague(l.id)}
            className={"shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold " + (league === l.id ? "bg-white/15 text-white" : "text-zinc-400")}
          >
            {l.label}
          </button>
        ))}
      </div>
      {err ? <p className="text-sm text-zinc-400">{err}</p> : null}
      <ul className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/5"
              onClick={() => {
                onPick({
                  league,
                  id: row.id,
                  abbr: row.abbr,
                  name: row.name,
                  color: row.color,
                  alt: row.alt,
                  logo: row.logo,
                });
                onClose();
              }}
            >
              {row.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.logo} alt="" width={20} height={20} className="h-5 w-5" />
              ) : (
                <span className="inline-block h-5 w-5 rounded-full" style={{ background: "#" + row.color }} />
              )}
              <span className="truncate text-[color:var(--flat)]">{row.abbr}</span>
            </button>
          </li>
        ))}
      </ul>
      {team ? (
        <button
          type="button"
          className="mt-2 text-[11px] font-semibold text-zinc-400"
          onClick={() => {
            onPick(null);
            onClose();
          }}
        >
          Clear {team.name}
        </button>
      ) : (
        <p className="mt-2 text-[11px] text-zinc-500">Colors the header and the mark. Green, gold, and red stay the same.</p>
      )}
    </div>
  );
}
