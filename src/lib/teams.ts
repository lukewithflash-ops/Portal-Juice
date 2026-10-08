/** Team marks: abbreviation + one brand-safe accent per team. No logos hotlinked. */
const TEAM_ACCENT: Record<string, string> = {
  // NFL
  DAL: "#7f9cc0",
  TB: "#d50a0a",
  SEA: "#69be28",
  DEN: "#fb4f14",
  // NBA
  BOS: "#007a33",
  CLE: "#860038",
  NO: "#85714d",
  MIA: "#98002e",
  PHI: "#006bb6",
  BK: "#a1a1aa",
  WAS: "#e31837",
  NY: "#f58426",
  ATL: "#e03a3e",
  SA: "#c4ced4",
  SAC: "#5a2d81",
  LAL: "#fdb927",
};

export function teamAccent(abbr: string): string {
  return TEAM_ACCENT[abbr] ?? "#a78bfa";
}
