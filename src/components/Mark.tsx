import { teamAccent } from "@/lib/teams";

/**
 * Circle on the left of every card. Licensed headshot when the row carries an
 * allowed headshotUrl (already filtered server-side), otherwise the team mark.
 */
export default function Mark({
  team,
  headshotUrl,
  label,
  size = 52,
}: {
  team: string;
  headshotUrl?: string | null;
  label?: string;
  size?: number;
}) {
  const accent = teamAccent(team);
  if (headshotUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={headshotUrl}
        alt={label ?? team}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size, border: `1.5px solid ${accent}` }}
        referrerPolicy="no-referrer"
      />
    );
  }
  const initials = (label ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  // Team mark first; initials only when there is no team on the row.
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
