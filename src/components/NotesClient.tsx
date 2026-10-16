"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { NoteItem, useNotes } from "@/components/Notes";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { filterNotes, linkedPicks, pickPlayer, type NoteKind } from "@/lib/notesCore";

const KINDS: { id: NoteKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pick", label: "Picks" },
  { id: "parlay", label: "Parlays" },
  { id: "live", label: "Live" },
];

/** Every note on this device. Search, then narrow by player, game, league or parlay. */
export default function NotesClient() {
  const notes = useNotes();
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const sp = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<NoteKind | "all">("all");
  const player = sp.get("player") ?? "";
  const matchup = sp.get("matchup") ?? "";
  const league = sp.get("league") ?? "";
  const slip = sp.get("slip") ?? "";
  const game = sp.get("game") ?? "";
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.replace(`/notes${next.toString() ? "?" + next : ""}`, { scroll: false });
  };

  // Options come from the notes themselves.
  const opts = useMemo(() => {
    const players = new Set<string>();
    const leagues = new Set<string>();
    const games = new Map<string, string>();
    const slips = new Map<string, string>();
    for (const n of notes) {
      for (const p of n.players ?? []) players.add(p.name);
      for (const p of linkedPicks(n, picks)) {
        const pl = pickPlayer(p);
        if (pl) players.add(pl.name);
      }
      if (n.league) leagues.add(n.league);
      if (n.league && n.gameId) games.set(`${n.league}/${n.gameId}`, `${n.gameLabel ?? n.gameId}${n.date ? " · " + n.date : ""}`);
      if (n.slipId) slips.set(n.slipId, `Parlay · ${n.pickIds?.length ?? "?"} legs${n.date ? " · " + n.date : ""}`);
    }
    return { players: [...players].sort(), leagues: [...leagues].sort(), games: [...games.entries()], slips: [...slips.entries()] };
  }, [notes, picks]);

  const shown = useMemo(() => filterNotes(notes, picks, { q, kind, player, matchup, league, slip, game }), [notes, picks, q, kind, player, matchup, league, slip, game]);
  const any = player || matchup || league || slip || game;

  return (
    <div data-testid="notes-page">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your notes" className="field w-full" aria-label="Search your notes" data-testid="notes-search" />
      <div className="mt-2 flex gap-1 overflow-x-auto pb-1" role="group" aria-label="Note type">
        {KINDS.map((k) => (
          <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)} className={`shrink-0 rounded-full border px-3 py-1 text-[12px] font-bold ${kind === k.id ? "border-[color:var(--plus)] bg-[color:var(--plus)]/15 text-white" : "border-zinc-700/70 text-zinc-400"}`}>
            {k.label}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Select label="Player" value={player} onChange={(v) => setParam("player", v)} options={opts.players.map((p) => [p, p])} testid="notes-player" />
        <Select label="Game" value={game} onChange={(v) => setParam("game", v)} options={opts.games} />
        <Select label="League" value={league} onChange={(v) => setParam("league", v)} options={opts.leagues.map((l) => [l, l.toUpperCase()])} />
        <Select label="Parlay" value={slip} onChange={(v) => setParam("slip", v)} options={opts.slips} />
      </div>
      {matchup ? (
        <p className="mt-2 text-[12px] text-zinc-300">
          Matchup: <span className="font-black text-white">{matchup.split(":")[1]?.replace("-", " vs ")}</span> · every meeting
        </p>
      ) : null}
      {any ? (
        <button type="button" className="mt-2 text-[11px] font-bold text-zinc-400 underline" onClick={() => router.replace("/notes", { scroll: false })}>
          Clear filters
        </button>
      ) : null}
      {shown.length ? (
        <ul className="mt-3 space-y-1.5" data-testid="notes-list">
          {shown.map((n) => (
            <NoteItem key={n.id} n={n} picks={picks} />
          ))}
        </ul>
      ) : (
        <p className="panel mt-3 rounded-xl px-4 py-5 text-sm text-zinc-400">
          {notes.length ? "No notes match." : "No notes yet. Add one from a pick in your "}
          {notes.length ? null : (
            <>
              <Link href="/lines/portfolio" className="font-bold text-[color:var(--gold)]">Log</Link>, a parlay, or a live game.
            </>
          )}
        </p>
      )}
    </div>
  );
}

function Select({ label, value, onChange, options, testid }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; testid?: string }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</span>
      <select className="field w-full text-[13px]" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid}>
        <option value="">Any</option>
        {value && !options.some(([v]) => v === value) ? <option value={value}>{value}</option> : null}
        {options.map(([v, t]) => (
          <option key={v} value={v}>{t}</option>
        ))}
      </select>
    </label>
  );
}
