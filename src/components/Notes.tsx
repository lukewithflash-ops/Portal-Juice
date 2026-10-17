"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { addNote, getNotes, getServerNotes, removeNote, subscribeNotes, updateNote } from "@/lib/noteStore";
import {
  linkedPicks,
  liveTag,
  matchupKey,
  notesForGame,
  notesForMatchup,
  notesForPick,
  notesForPlayer,
  notesForSlip,
  pickPlayer,
  STATUS_WORD,
  type Note,
  type NotePlayer,
} from "@/lib/notesCore";
import type { Pick, PickStatus } from "@/lib/types";

export function useNotes(): Note[] {
  return useSyncExternalStore(subscribeNotes, getNotes, getServerNotes);
}
function usePicks(): Pick[] {
  return useSyncExternalStore(subscribe, getPicks, getServerPicks);
}

const STATUS_COLOR: Record<PickStatus, string> = { open: "#c084fc", win: "var(--gold)", loss: "var(--minus)", push: "var(--push)" };

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function ResultPill({ status }: { status: PickStatus }) {
  return (
    <span className="tabular rounded px-1 text-[10px] font-black" style={{ color: STATUS_COLOR[status], background: "rgba(255,255,255,0.06)" }}>
      {STATUS_WORD[status]}
    </span>
  );
}

/** One note: text, when, live tag, the picks it hangs on with W/L/P/open. Edit and delete in place. */
export function NoteItem({ n, picks, compact = false }: { n: Note; picks: Pick[]; compact?: boolean }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(n.text);
  const [sure, setSure] = useState(false);
  const linked = linkedPicks(n, picks);
  return (
    <li className="note-item list-none rounded-lg px-2.5 py-1.5" data-testid="note-item">
      <div className="flex flex-wrap items-center gap-x-1.5 text-[10px] font-bold text-zinc-500">
        <span>{when(n.createdAt)}</span>
        {n.tag ? <span className="note-clock tabular">{n.tag}</span> : null}
        {!compact && n.kind === "parlay" ? <span className="text-purple-300">Parlay</span> : null}
        {!compact && n.gameLabel ? <span className="text-zinc-400">{n.gameLabel}</span> : null}
      </div>
      {edit ? (
        <div className="mt-1">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={600} className="field w-full text-[13px]" aria-label="Edit note" />
          <div className="mt-1 flex gap-2 text-[11px] font-black">
            <button type="button" className="text-[color:var(--plus)]" onClick={() => { if (text.trim()) updateNote(n.id, { text: text.trim() }); setEdit(false); }}>Save</button>
            <button type="button" className="text-zinc-400" onClick={() => { setText(n.text); setEdit(false); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-snug text-zinc-100">{n.text}</p>
      )}
      {linked.length && !compact ? (
        <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-zinc-400">
          {linked.slice(0, 6).map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1">
              <ResultPill status={p.status} />
              <span className="max-w-[10rem] truncate">{p.subject}{p.market ? ` ${p.market}` : ""}</span>
            </span>
          ))}
          {linked.length > 6 ? <span>+{linked.length - 6}</span> : null}
        </div>
      ) : null}
      {!edit && !compact ? (
        <div className="mt-1 flex gap-3 text-[10px] font-bold">
          <button type="button" className="text-zinc-400 hover:text-white" onClick={() => setEdit(true)}>Edit</button>
          {sure ? (
            <>
              <button type="button" className="text-[color:var(--minus)]" onClick={() => removeNote(n.id)} data-testid="note-delete-yes">Delete it</button>
              <button type="button" className="text-zinc-400" onClick={() => setSure(false)}>Keep</button>
            </>
          ) : (
            <button type="button" className="text-zinc-500 hover:text-zinc-300" onClick={() => setSure(true)}>Delete</button>
          )}
        </div>
      ) : null}
    </li>
  );
}

function Composer({ onSave, placeholder, tag, testid }: { onSave: (text: string) => void; placeholder: string; tag?: string; testid?: string }) {
  const [text, setText] = useState("");
  return (
    <form
      className="note-compose mt-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        onSave(t);
        setText("");
      }}
      data-testid={testid}
    >
      {tag ? <div className="note-clock tabular mb-1 inline-block text-[10px] font-black">{tag}</div> : null}
      <div className="flex gap-1.5">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder={placeholder} className="field min-w-0 flex-1 text-[13px]" aria-label={placeholder} />
        <button type="submit" disabled={!text.trim()} className="note-add shrink-0 rounded-lg px-3 text-[12px] font-black text-white disabled:opacity-40">
          Add
        </button>
      </div>
    </form>
  );
}

function NoteList({ notes, picks, compact }: { notes: Note[]; picks: Pick[]; compact?: boolean }) {
  if (!notes.length) return null;
  return (
    <ul className="space-y-1">
      {[...notes].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)).map((n) => (
        <NoteItem key={n.id} n={n} picks={picks} compact={compact} />
      ))}
    </ul>
  );
}

/** Notes on one logged pick (plus its parlay's and live notes from its game). */
export function PickNotes({ pick, athleteId }: { pick: Pick; athleteId?: string | null }) {
  const notes = useNotes();
  const picks = usePicks();
  const mine = useMemo(() => notesForPick(notes, pick), [notes, pick]);
  return (
    <div className="note-zone" data-testid="pick-notes">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-200/80">📝 Notes</div>
      <NoteList notes={mine} picks={picks} />
      <Composer
        placeholder="Add a note to this pick"
        testid="pick-note-add"
        onSave={(text) => {
          const pl = pickPlayer(pick);
          addNote({ kind: "pick", text, pickIds: [pick.id], league: pick.league, gameId: pick.gameId, date: pick.date, market: pick.market, players: pl ? [{ ...pl, id: athleteId ?? null }] : undefined });
        }}
      />
    </div>
  );
}

/** A short line under a row: newest note on this pick, if any. */
export function NoteSnippet({ pick }: { pick: Pick }) {
  const notes = useNotes();
  const mine = useMemo(() => notesForPick(notes, pick), [notes, pick]);
  if (!mine.length) return null;
  const top = [...mine].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))[0];
  return (
    <p className="note-snippet truncate text-[11px]" data-testid="note-snippet">
      📝 {top.tag ? <span className="note-clock tabular mr-1">{top.tag}</span> : null}
      {top.text}
      {mine.length > 1 ? <span className="text-zinc-500"> · +{mine.length - 1}</span> : null}
    </p>
  );
}

/** Notes on a whole parlay. */
export function ParlayNotes({ slipId, legs }: { slipId: string; legs: Pick[] }) {
  const notes = useNotes();
  const picks = usePicks();
  const mine = useMemo(() => notesForSlip(notes, slipId), [notes, slipId]);
  return (
    <div className="note-zone" data-testid="parlay-notes">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-200/80">📝 Parlay notes</div>
      <NoteList notes={mine} picks={picks} />
      <Composer
        placeholder="Add a note to this parlay"
        testid="parlay-note-add"
        onSave={(text) =>
          addNote({
            kind: "parlay",
            text,
            slipId,
            pickIds: legs.map((p) => p.id),
            date: legs[0]?.date,
            players: legs.map(pickPlayer).filter((p): p is NotePlayer => !!p),
          })
        }
      />
    </div>
  );
}

type SnapLike = Parameters<typeof liveTag>[1];

/** Live notes while watching: stamped with the clock and score, tied to the game and your picks in it. */
export function LiveNotes({ league, gameId, snap, compact = false }: { league: string; gameId: string; snap: SnapLike; compact?: boolean }) {
  const notes = useNotes();
  const picks = usePicks();
  const mine = useMemo(() => notesForGame(notes, league, gameId), [notes, league, gameId]);
  const tag = liveTag(league, snap);
  return (
    <section className={compact ? "note-zone" : "note-zone foil-tile mt-3 p-3"} aria-label="Live notes" data-testid="live-notes">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-black uppercase tracking-[0.22em] text-purple-200/80">Live notes</h2>
        <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          {!compact && snap ? <NoteTag matchup={matchupKey(league, snap.awayAbbr, snap.homeAbbr)} label={`${snap.awayAbbr} vs ${snap.homeAbbr}`} /> : null}
          On this device
        </span>
      </div>
      <Composer
        placeholder={snap?.state === "in" ? "What are you seeing?" : "Note on this game"}
        tag={tag}
        testid="live-note-add"
        onSave={(text) => {
          const s = snap;
          const inGame = picks.filter((p) => p.league === league && p.gameId === gameId);
          addNote({
            kind: "live",
            text,
            league,
            gameId,
            tag: liveTag(league, s),
            pickIds: inGame.map((p) => p.id),
            players: inGame.map(pickPlayer).filter((p): p is NotePlayer => !!p),
            matchup: s ? matchupKey(league, s.awayAbbr, s.homeAbbr) ?? undefined : undefined,
            gameLabel: s ? `${s.awayAbbr} @ ${s.homeAbbr}` : undefined,
            date: new Date().toLocaleDateString("en-CA"),
          });
        }}
      />
      <div className="mt-1.5">
        <NoteList notes={compact ? mine.slice(0, 3) : mine} picks={picks} compact={compact} />
      </div>
    </section>
  );
}

/** "Your notes on Scottie Barnes": past notes with dates and how those picks went. Shown while logging a new pick. */
export function PastNotes({ name, id }: { name: string; id?: string | null }) {
  const notes = useNotes();
  const picks = usePicks();
  const who = useMemo(() => ({ name, id }), [name, id]);
  const mine = useMemo(() => (name.trim().length >= 3 ? notesForPlayer(notes, picks, who) : []), [notes, picks, who, name]);
  if (!mine.length) return null;
  return (
    <div className="note-zone mt-2" data-testid="past-notes">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] tone-gold">📝 Your notes on {name}</div>
      <NoteList notes={mine.slice(0, 5)} picks={picks} />
      {mine.length > 5 ? <Link href={`/notes?player=${encodeURIComponent(name)}`} className="text-[11px] font-bold text-purple-200">All {mine.length} →</Link> : null}
    </div>
  );
}

/**
 * Tiny glowing note chip on a player or matchup you've noted. Tap for the notes.
 * Players match by ESPN athlete id (else name); matchups by team pair in any season.
 */
export function NoteTag({ player, matchup, label }: { player?: NotePlayer | null; matchup?: string | null; label?: string }) {
  const notes = useNotes();
  const picks = usePicks();
  const ref = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const list = useMemo(() => {
    if (!notes.length) return [];
    if (player?.name) return notesForPlayer(notes, picks, player);
    if (matchup) return notesForMatchup(notes, matchup);
    return [];
  }, [notes, picks, player, matchup]);
  useEffect(() => {
    if (!at) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setAt(null);
    window.addEventListener("keydown", close);
    window.addEventListener("scroll", () => setAt(null), { once: true, passive: true });
    return () => window.removeEventListener("keydown", close);
  }, [at]);
  if (!list.length) return null;
  const title = player?.name ? `Your notes on ${player.name}` : `Your notes · ${label ?? matchup?.split(":")[1]?.replace("-", " vs ")}`;
  const href = player?.name ? `/notes?player=${encodeURIComponent(player.name)}` : `/notes?matchup=${encodeURIComponent(matchup ?? "")}`;
  const open = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const r = ref.current?.getBoundingClientRect();
    if (r) setAt({ x: r.left + r.width / 2, y: r.bottom });
  };
  return (
    <>
      <span
        ref={ref}
        role="button"
        tabIndex={0}
        className="note-tag"
        aria-label={`${title}: ${list.length}`}
        onClick={open}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open(e)}
        data-testid="note-tag"
      >
        <span aria-hidden>✎</span>
        {list.length}
      </span>
      {at
        ? createPortal(
            <div className="fixed inset-0 z-[80]" onClick={() => setAt(null)} data-testid="note-pop-backdrop">
              <div
                className="note-pop"
                role="dialog"
                aria-label={title}
                data-testid="note-pop"
                onClick={(e) => e.stopPropagation()}
                style={{ left: Math.max(8, Math.min(window.innerWidth - 300, at.x - 146)), top: at.y + 260 > window.innerHeight ? Math.max(8, at.y - 280) : at.y + 6 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-black uppercase tracking-[0.16em] tone-gold">{title}</span>
                  <button type="button" className="text-zinc-400" aria-label="Close" onClick={() => setAt(null)}>✕</button>
                </div>
                <ul className="mt-1 max-h-52 space-y-1 overflow-y-auto">
                  {[...list].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)).slice(0, 5).map((n) => {
                    const linked = linkedPicks(n, picks);
                    return (
                      <li key={n.id} className="rounded-md bg-white/[0.04] px-2 py-1">
                        <div className="flex flex-wrap items-center gap-1 text-[10px] text-zinc-500">
                          <span>{when(n.createdAt)}</span>
                          {n.tag ? <span className="note-clock tabular">{n.tag}</span> : n.gameLabel ? <span>{n.gameLabel}</span> : null}
                          {linked.slice(0, 3).map((p) => <ResultPill key={p.id} status={p.status} />)}
                        </div>
                        <p className="text-[12px] leading-snug text-zinc-100">{n.text}</p>
                      </li>
                    );
                  })}
                </ul>
                <Link href={href} className="mt-1.5 block text-right text-[11px] font-black text-[color:var(--plus)]" onClick={() => setAt(null)}>
                  All notes →
                </Link>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
