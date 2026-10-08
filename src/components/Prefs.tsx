"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { formatPrice, IMPLIED_TIP, type OddsMode } from "@/lib/odds";
import { teamCookieValue, type TeamCookie } from "@/lib/team";

export type FavTeam = TeamCookie & { name: string; logo: string | null };

type Prefs = {
  odds: OddsMode;
  setOdds: (m: OddsMode) => void;
  team: FavTeam | null;
  setTeam: (t: FavTeam | null) => void;
};

const Ctx = createContext<Prefs | null>(null);
const ODDS_KEY = "pj-odds";
const TEAM_KEY = "pj-fav-team";

function readTeam(): FavTeam | null {
  try {
    const raw = localStorage.getItem(TEAM_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as FavTeam;
    if (!t || !t.abbr || !t.color || !t.league) return null;
    return t;
  } catch {
    return null;
  }
}

function writeCookie(team: FavTeam | null) {
  if (!team) {
    document.cookie = "pj-team=; Max-Age=0; Path=/; SameSite=Lax";
    return;
  }
  const v = encodeURIComponent(
    teamCookieValue({ league: team.league, id: team.id, abbr: team.abbr, color: team.color, alt: team.alt })
  );
  document.cookie = `pj-team=${v}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function paint(team: FavTeam | null) {
  const root = document.documentElement;
  if (!team) {
    root.removeAttribute("data-team");
    root.style.removeProperty("--team");
    root.style.removeProperty("--team-alt");
    return;
  }
  root.dataset.team = team.abbr;
  root.style.setProperty("--team", `#${team.color}`);
  root.style.setProperty("--team-alt", `#${team.alt}`);
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [odds, setOddsState] = useState<OddsMode>("american");
  const [team, setTeamState] = useState<FavTeam | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const stored = localStorage.getItem(ODDS_KEY);
      if (stored === "pct" || stored === "american") setOddsState(stored);
      const fav = readTeam();
      setTeamState(fav);
      paint(fav);
      writeCookie(fav);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const api = useMemo<Prefs>(
    () => ({
      odds,
      setOdds: (m) => {
        setOddsState(m);
        try {
          localStorage.setItem(ODDS_KEY, m);
        } catch {
          /* private mode */
        }
      },
      team,
      setTeam: (t) => {
        setTeamState(t);
        paint(t);
        writeCookie(t);
        try {
          if (t) localStorage.setItem(TEAM_KEY, JSON.stringify(t));
          else localStorage.removeItem(TEAM_KEY);
        } catch {
          /* private mode */
        }
      },
    }),
    [odds, team]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function usePrefs(): Prefs {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      odds: "american",
      setOdds: () => {},
      team: null,
      setTeam: () => {},
    };
  }
  return ctx;
}

/** American price, or implied chance when that mode is on. Lines pass through. */
export function OddsText({
  value,
  className,
}: {
  value: string | number | null | undefined;
  className?: string;
}) {
  const { odds } = usePrefs();
  const shown = formatPrice(value, odds);
  const chance = odds === "pct" && shown.endsWith("%");
  return (
    <span className={className} title={chance ? IMPLIED_TIP : undefined}>
      {shown}
    </span>
  );
}
