"use client";

import type { Note } from "./notesCore";

/** Device-only notes. Nothing leaves the browser. Reset stats keeps them. */
export const NOTES_KEY = "pj-notes-v1";
const EMPTY: Note[] = [];
let cacheRaw: string | null = null;
let cache: Note[] = EMPTY;
const listeners = new Set<() => void>();

function parse(raw: string | null): Note[] {
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((n): n is Note => n && typeof n.id === "string" && typeof n.text === "string" && typeof n.createdAt === "string") : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function getNotes(): Note[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(NOTES_KEY);
  } catch {
    return EMPTY;
  }
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cache = parse(raw);
  }
  return cache;
}
export const getServerNotes = () => EMPTY;

export function subscribeNotes(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === NOTES_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function write(next: Note[]) {
  try {
    window.localStorage.setItem(NOTES_KEY, JSON.stringify(next));
  } catch {
    /* storage full or private mode */
  }
  listeners.forEach((l) => l());
}

export function addNote(n: Omit<Note, "id" | "createdAt">): Note {
  const note: Note = { ...n, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  write([note, ...getNotes()]);
  if (note.league && note.gameId && !note.matchup) void fillGame(note.id, note.league, note.gameId);
  return note;
}
export function updateNote(id: string, patch: Partial<Note>) {
  write(getNotes().map((n) => (n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n)));
}
export function removeNote(id: string) {
  write(getNotes().filter((n) => n.id !== id));
}

/** Fill the team pair and game label from the live feed, so the note shows on future meetings too. */
async function fillGame(id: string, league: string, gameId: string) {
  try {
    const r = await fetch(`/api/live/batch?g=${encodeURIComponent(`${league}:${gameId}`)}`);
    const j = (await r.json()) as { snaps?: Record<string, { awayAbbr?: string; homeAbbr?: string } | null> };
    const s = j.snaps?.[`${league}/${gameId}`] ?? Object.values(j.snaps ?? {})[0];
    if (!s?.awayAbbr || !s.homeAbbr) return;
    const [x, y] = [s.awayAbbr.toUpperCase(), s.homeAbbr.toUpperCase()].sort();
    const cur = getNotes().find((n) => n.id === id);
    if (!cur || cur.matchup) return;
    write(getNotes().map((n) => (n.id === id ? { ...n, matchup: `${league.toLowerCase()}:${x}-${y}`, gameLabel: n.gameLabel ?? `${s.awayAbbr} @ ${s.homeAbbr}` } : n)));
  } catch {
    /* offline: the note still hangs on the game and pick */
  }
}

/** Only when the user asks for it in the reset dialog. */
export function clearNotes() {
  write([]);
}
