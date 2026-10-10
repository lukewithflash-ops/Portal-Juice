"use client";

import { useState } from "react";
import { teamAccent } from "@/lib/teams";

/**
 * Circle on the left of every line. Licensed headshot when the row carries an
 * allowed headshotUrl (already filtered server-side), otherwise the team mark.
 */
export default function Mark({
  team,
  headshotUrl,
  label,
  size = 52,
  contain = false,
  league,
}: {
  /** With a pro league, a missing headshot falls back to the real ESPN team logo, not initials. */
  league?: string | null;
  team: string;
  headshotUrl?: string | null;
  label?: string;
  size?: number;
  /** Team logos sit inside the circle instead of filling it. */
  contain?: boolean;
}) {
  const accent = teamAccent(team);
  const [broken, setBroken] = useState(false);
  const PRO = ["nfl", "nba", "mlb", "nhl", "wnba"];
  const teamLogo = !headshotUrl && league && PRO.includes(league) && /^[A-Za-z]{2,4}$/.test(team) ? `https://a.espncdn.com/i/teamlogos/${league}/500/${team.toLowerCase()}.png` : null;
  if (teamLogo && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={teamLogo} alt={team} width={size} height={size} className="shrink-0 rounded-full bg-white/5 object-contain p-1" style={{ width: size, height: size, border: `1.5px solid ${accent}` }} referrerPolicy="no-referrer" onError={() => setBroken(true)} />
    );
  }
  if (headshotUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={headshotUrl}
        alt={label ?? team}
        width={size}
        height={size}
        className={`shrink-0 rounded-full ${contain ? "bg-white/5 object-contain p-1" : "object-cover"}`}
        style={{ width: size, height: size, border: `1.5px solid ${accent}` }}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  const initials = (label ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const text = (team || initials || "?").slice(0, 4);
  return (
    <span
      className="team-mark shrink-0"
      style={
        {
          width: size,
          height: size,
          fontSize: text.length > 2 ? size * 0.27 : size * 0.33,
          "--mark": accent,
        } as React.CSSProperties
      }
      aria-label={`${team} team mark`}
      role="img"
    >
      {text}
    </span>
  );
}
