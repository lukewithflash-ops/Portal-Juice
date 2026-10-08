/** Format American odds with an explicit sign. */
export function fmtOdds(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}

/** Format a line. Spreads carry a sign; O/U numbers do not. */
export function fmtLine(n: number, signed: boolean): string {
  const s = Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1);
  if (!signed) return s;
  if (n > 0) return `+${s}`;
  if (n === 0) return "PK";
  return s;
}

/** Implied probability of American odds (vig included). */
export function implied(odds: number): number {
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
}

/** True when the value is valid American odds (≤ -100 or ≥ +100). */
export function validOdds(n: number): boolean {
  return Number.isFinite(n) && (n <= -100 || n >= 100);
}
