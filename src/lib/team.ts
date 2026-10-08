/** Favorite-team cookie. Name and logo stay on the device; the cookie only themes the icon. */

export type TeamCookie = {
  league: string;
  id: string;
  abbr: string;
  color: string;
  alt: string;
};

const HEX = /^[0-9a-fA-F]{6}$/;

export function parseTeamCookie(raw: string | undefined | null): TeamCookie | null {
  if (!raw) return null;
  let text = raw;
  try {
    text = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const [league, id, abbr, color, alt] = text.split(":");
  if (!league || !/^\d+$/.test(id || "") || !abbr || !/^[A-Za-z0-9]{2,5}$/.test(abbr)) return null;
  if (!HEX.test(color || "") || !HEX.test(alt || "")) return null;
  return { league, id, abbr: abbr.toUpperCase(), color: color.toUpperCase(), alt: alt.toUpperCase() };
}

export function teamCookieValue(team: TeamCookie): string {
  return `${team.league}:${team.id}:${team.abbr}:${team.color}:${team.alt}`;
}

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => (v && typeof v === "object" ? (v as Dict) : {});
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export type TeamOption = {
  id: string;
  abbr: string;
  name: string;
  color: string;
  alt: string;
  logo: string | null;
};

export function parseTeamList(payload: unknown): TeamOption[] {
  const sports = asList(asDict(payload).sports);
  const leagues = asList(asDict(sports[0]).leagues);
  const rows: TeamOption[] = [];
  for (const raw of asList(asDict(leagues[0]).teams)) {
    const team = asDict(asDict(raw).team);
    const id = typeof team.id === "string" ? team.id : team.id != null ? String(team.id) : "";
    const abbr = typeof team.abbreviation === "string" ? team.abbreviation : "";
    const name = typeof team.displayName === "string" ? team.displayName : "";
    const color = typeof team.color === "string" ? team.color : "";
    const alt = typeof team.alternateColor === "string" ? team.alternateColor : "";
    if (!/^\d+$/.test(id) || !abbr || !name || !HEX.test(color)) continue;
    const logos = asList(team.logos).map(asDict);
    const href = logos.map((l) => (typeof l.href === "string" ? l.href : "")).find((h) => h.startsWith("https://"));
    rows.push({
      id,
      abbr,
      name,
      color: color.toUpperCase(),
      alt: HEX.test(alt) ? alt.toUpperCase() : "F5C542",
      logo: href ?? null,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}
