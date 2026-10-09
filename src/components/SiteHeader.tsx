"use client";

import Link from "next/link";
import Bell from "@/components/Bell";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePrefs, type FavTeam } from "@/components/Prefs";
import { IMPLIED_TIP } from "@/lib/odds";
import { LEAGUES, type LeagueId } from "@/lib/slate";
import { MORE_NAV, NAV, SITE_NAME, TAGLINE } from "@/lib/site";
import type { TeamOption } from "@/lib/team";

export default function SiteHeader() {
  const path = usePathname();
  const firstPath = useRef(path);
  const [showTagline, setShowTagline] = useState(true);
  const { odds, setOdds, team, setTeam } = usePrefs();
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);

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
              <span className="brand-mask h-7 w-9 shrink-0 sm:h-9 sm:w-11" aria-hidden />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/brand/swirl-mark.png" alt="" width={44} height={37} className="h-7 w-auto shrink-0 mix-blend-screen sm:h-9" aria-hidden />
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
            <button
              type="button"
              className="shrink-0 rounded-lg border border-white/10 px-1.5 py-1 text-[11px] font-bold text-zinc-200 sm:px-2"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {team ? team.abbr : "Team"}
            </button>
          </div>
        </div>
        {open ? <TeamPicker team={team} onPick={setTeam} onClose={() => setOpen(false)} /> : null}
        <nav aria-label="Portal Juice" className="-mx-4 mt-1 flex items-center gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.map((n) => {
            const active =
              n.href === "/lines" ? path === "/lines" : path === n.href || path.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setMore(false)}
                aria-current={active ? "page" : undefined}
                className={
                  "shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-colors " +
                  (active
                    ? "bg-purple-500/20 text-white shadow-[inset_0_-2px_0_var(--plus)]"
                    : "text-zinc-400 hover:bg-purple-500/10 hover:text-zinc-100")
                }
              >
                {n.label}
              </Link>
            );
          })}
          <button
            type="button"
            aria-expanded={more}
            onClick={() => setMore((v) => !v)}
            className={
              "shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-colors " +
              (more || MORE_NAV.some((n) => path === n.href || path.startsWith(n.href + "/"))
                ? "bg-purple-500/20 text-white"
                : "text-zinc-400 hover:bg-purple-500/10 hover:text-zinc-100")
            }
          >
            More {more ? "▴" : "▾"}
          </button>
        </nav>
        {more ? (
          <div className="-mx-1 mb-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {MORE_NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setMore(false)}
                className={
                  "rounded-lg border border-white/10 px-2 py-2 text-center text-[13px] font-semibold " +
                  (path === n.href ? "bg-purple-500/20 text-white" : "text-zinc-300")
                }
              >
                {n.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}

function TeamPicker({
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
