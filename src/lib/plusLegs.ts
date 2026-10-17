/**
 * "X+" legs (PrizePicks/Underdog "1+ Shots on Goal"): at least X, so exactly X is a hit and never a push.
 * Stored as selection "Over", line X - 0.5, plus: true, so every meter and grade that compares value > line is right.
 * A plus pick that still carries a whole-number line (older data) is read as X - 0.5 too.
 */
import type { SlipRow } from "@/lib/slipImport";
import type { Pick as LoggedPick } from "@/lib/types";

const PICKEM = /prize\s*picks|underdog|sleeper|betr|dabble|parlay\s*play|chalkboard|boom\s*fantasy|pick'?em|\b\d{1,2}-pick\b|power\s*play|flex\s*play/i;
const TEAM = /money|^ml$|spread|run line|puck line|^total/i;

export const isPickem = (book: string | null | undefined) => PICKEM.test(book ?? "");

/** The line a grade compares against. */
export function effLine(p: Pick<LoggedPick, "line" | "plus">): number {
  return p.plus && Number.isInteger(p.line) ? p.line - 0.5 : p.line;
}

/** "1" for a 1+ leg; null when the leg isn't at-least. */
export function atLeastOf(p: Pick<LoggedPick, "line" | "plus">): number | null {
  if (!p.plus) return null;
  return Number.isInteger(p.line) ? p.line : Math.round((p.line + 0.5) * 10) / 10;
}

/** "1+" or "Over 0.5" / "Under 3.5". */
export function sideLine(p: Pick<LoggedPick, "line" | "plus" | "selection">): string {
  const n = atLeastOf(p);
  if (n != null) return `${n}+`;
  return `${p.selection ?? "Over"} ${p.line}`;
}

/** Store an at-least leg: X → line X - 0.5. */
export function asPlus<T extends { line: number }>(p: T, atLeast: number): T & { plus: true; selection: "Over" } {
  return { ...p, line: Math.ceil(atLeast) - 0.5, plus: true, selection: "Over" };
}

/**
 * Old legs read from an "X+" slip that were saved (or edited) as a whole-number over on a pick'em slip.
 * Pick'em props have no whole-number pushes, so those become at-least legs, and a push from that tie re-opens to re-grade.
 * Legs where you chose plain "Over" in Edit (plus === false) are left alone.
 */
export function migratePlus(picks: LoggedPick[]): LoggedPick[] {
  const out: LoggedPick[] = [];
  for (const p of picks) {
    if (p.plus !== undefined) continue;
    if (!p.market || TEAM.test(p.market) || p.selection === "Under") continue;
    // Pick'em apps by name; a slip whose app wasn't read ("Slip") only when it already shows that exact-number push.
    const unknownBook = !p.book || /^slip$/i.test(p.book.trim());
    if (!(p.line > 0) || !Number.isInteger(p.line) || !(isPickem(p.book) || (unknownBook && p.status === "push"))) continue;
    const next = asPlus(p, p.line);
    out.push(p.status === "push" ? { ...next, status: "open" } : next);
  }
  return out;
}

/** Text slips: an over at X.5 that the slip printed as "X+" is an at-least leg. */
export function markPlus(r: SlipRow, text: string): SlipRow {
  if (r.plus !== undefined || r.kind !== "prop" || r.selection !== "Over" || r.line == null || Number.isInteger(r.line)) return r;
  const n = r.line + 0.5;
  return new RegExp(`(^|[\\s(])${n}\\s?\\+(?=\\s*[A-Za-z]|\\s*$)`, "m").test(text) ? { ...r, plus: true } : r;
}

