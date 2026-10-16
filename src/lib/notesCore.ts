/**
 * Notes: pure helpers (no storage). Notes live on this device only, like picks.
 * A note can hang on a pick, a parlay (slip), a game (live note), a player or a matchup.
 */
import type { Pick, PickStatus } from "./types";

export type NotePlayer = { name: string; id?: string | null };
export type NoteKind = "pick" | "parlay" | "live" | "game" | "player";

export type Note = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
  kind: NoteKind;
  /** Picks this note is tied to (a pick note, every leg of a parlay, or picks in a game at the time of a live note). */
  pickIds?: string[];
  slipId?: string;
  league?: string;
  gameId?: string;
  /** Team pair in this league, any date: "nba:DET-TOR". */
  matchup?: string;
  /** "TOR @ DET" */
  gameLabel?: string;
  /** Game day, YYYY-MM-DD. */
  date?: string;
  players?: NotePlayer[];
  market?: string;
  /** Live notes: game clock and score when it was written. "Q3 4:12 · TOR 78-71". */
  tag?: string;
};

/** Same team pair in the same league, whatever the date or home side. */
export function matchupKey(league: string | null | undefined, a: string | null | undefined, b: string | null | undefined): string | null {
  if (!league || !a || !b) return null;
  const [x, y] = [a.toUpperCase(), b.toUpperCase()].sort();
  return `${league.toLowerCase()}:${x}-${y}`;
}

/** "Shai Gilgeous-Alexander" and "S. Gilgeous-Alexander" match; case, accents and punctuation do not matter. */
export function playerKey(name: string): string {
  const parts = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "")
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  return parts[0][0] + " " + parts.slice(1).join(" ");
}

export function samePlayer(a: NotePlayer, b: NotePlayer): boolean {
  if (a.id && b.id) return a.id === b.id;
  const ka = playerKey(a.name);
  return !!ka && ka === playerKey(b.name);
}

/** Players a pick is about. Team sides (ML, spread, total) have none. */
export function pickPlayer(p: Pick): NotePlayer | null {
  const m = (p.market ?? "").toLowerCase();
  if (!p.market || /money|^ml$|spread|run line|puck line|^total|game total|team total/.test(m)) return null;
  if (/ @ | vs\.? /i.test(p.subject)) return null;
  return { name: p.subject };
}

/** Notes that belong to a pick: its own, its parlay's, and live notes from its game. */
export function notesForPick(notes: Note[], p: Pick): Note[] {
  return notes.filter(
    (n) =>
      n.pickIds?.includes(p.id) ||
      (n.kind === "parlay" && !!p.slipId && n.slipId === p.slipId) ||
      ((n.kind === "live" || n.kind === "game") && !!p.gameId && n.gameId === p.gameId && n.league === p.league)
  );
}

export function notesForSlip(notes: Note[], slipId: string): Note[] {
  return notes.filter((n) => n.kind === "parlay" && n.slipId === slipId);
}

export function notesForGame(notes: Note[], league: string, gameId: string): Note[] {
  return notes.filter((n) => n.league === league && n.gameId === gameId);
}

/** Every note on a player: player notes, pick notes on that player, and parlay or live notes tied to their picks. */
export function notesForPlayer(notes: Note[], picks: Pick[], who: NotePlayer): Note[] {
  const theirs = new Set(picks.filter((p) => { const pl = pickPlayer(p); return pl && samePlayer(pl, who); }).map((p) => p.id));
  return notes.filter((n) => n.players?.some((pl) => samePlayer(pl, who)) || n.pickIds?.some((id) => theirs.has(id)));
}

export function notesForMatchup(notes: Note[], key: string): Note[] {
  return notes.filter((n) => n.matchup === key);
}

export function linkedPicks(n: Note, picks: Pick[]): Pick[] {
  const ids = new Set(n.pickIds ?? []);
  return picks.filter((p) => ids.has(p.id) || (n.kind === "parlay" && n.slipId && p.slipId === n.slipId));
}

export const STATUS_WORD: Record<PickStatus, string> = { open: "Open", win: "W", loss: "L", push: "P" };

/** "Q3 4:12 · TOR 78-71" from the live game. */
export function liveTag(
  league: string,
  s: { state: string; period: number | null; clock: string | null; detail: string; awayAbbr: string; homeAbbr: string; awayScore: string | null; homeScore: string | null } | null
): string | undefined {
  if (!s) return undefined;
  const score = s.awayScore != null && s.homeScore != null ? `${s.awayAbbr} ${s.awayScore}-${s.homeScore} ${s.homeAbbr}` : `${s.awayAbbr} @ ${s.homeAbbr}`;
  if (s.state === "pre") return `Before tip · ${s.awayAbbr} @ ${s.homeAbbr}`;
  if (s.state === "post") return `Final · ${score}`;
  const l = league.toLowerCase();
  const p = s.period ?? 0;
  let when: string;
  if (/nba|wnba|nfl|ncaaf|ncaam|ncaaw|basketball|football/.test(l)) when = (p > 4 ? (p === 5 ? "OT" : `${p - 4}OT`) : `Q${p}`) + (s.clock ? ` ${s.clock}` : "");
  else if (/nhl|hockey/.test(l)) when = (p > 3 ? "OT" : `P${p}`) + (s.clock ? ` ${s.clock}` : "");
  else if (/mlb|baseball/.test(l)) when = s.detail || `Inning ${p}`;
  else when = s.clock ? s.clock : s.detail;
  return `${when} · ${score}`;
}

export type NoteFilter = { q?: string; player?: string; matchup?: string; league?: string; slip?: string; game?: string; kind?: NoteKind | "all" };

export function filterNotes(notes: Note[], picks: Pick[], f: NoteFilter): Note[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return notes
    .filter((n) => {
      if (f.kind && f.kind !== "all" && n.kind !== f.kind) return false;
      if (f.league && n.league !== f.league) return false;
      if (f.matchup && n.matchup !== f.matchup) return false;
      if (f.slip && n.slipId !== f.slip) return false;
      if (f.game && `${n.league}/${n.gameId}` !== f.game) return false;
      if (f.player && !notesForPlayer([n], picks, { name: f.player }).length) return false;
      if (q) {
        const hay = [n.text, n.tag, n.gameLabel, n.market, ...(n.players ?? []).map((p) => p.name), ...linkedPicks(n, picks).map((p) => p.subject)].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
}
