"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { label, recordFor, recText, suggest, type DnbEntry } from "@/lib/dnb";
import { addDnb, getDnb, getServerDnb, removeDnb, subscribeDnb } from "@/lib/dnbStore";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";

const pctColor = (p: number | null) => (p == null ? "#a1a1aa" : p <= 30 ? "var(--minus)" : p >= 55 ? "var(--plus)" : "#e4e4e7");

function Row({ e, onRemove }: { e: DnbEntry; onRemove?: () => void }) {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const r = recordFor(e, picks);
  return (
    <li className="flex items-start gap-2 px-3 py-2.5" data-testid="dnb-row">
      <span aria-hidden className="mt-0.5 text-[13px]">⛔</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-bold capitalize text-white">{label(e)}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-zinc-400">
          <span className="tabular font-black" style={{ color: pctColor(r.t.pct) }}>{r.t.w + r.t.l + r.t.p ? recText(r.t) : "No graded picks yet"}</span>
          {r.streak <= -2 ? <span className="text-[color:var(--minus)]">{-r.streak} straight L</span> : r.streak >= 2 ? <span className="text-[color:var(--plus)]">{r.streak} straight W</span> : null}
          {r.t.open ? <span>{r.t.open} open</span> : null}
          {r.missed.length && !e.market ? <span>Most missed: {r.missed.map((m) => `${m.market} (${m.n})`).join(", ")}</span> : null}
        </div>
        {e.note ? <div className="mt-0.5 text-[12px] italic text-zinc-300">“{e.note}”</div> : null}
      </div>
      {onRemove ? (
        <button type="button" onClick={onRemove} className="press shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-zinc-400" aria-label={`Remove ${label(e)}`} data-testid="dnb-remove">Remove</button>
      ) : null}
    </li>
  );
}

/** Full list: your entries with real records, one-tap suggestions, manual add. */
export function DoNotBetPanel({ id = "dnb" }: { id?: string }) {
  const list = useSyncExternalStore(subscribeDnb, getDnb, getServerDnb);
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const sugg = useMemo(() => suggest(picks, list), [picks, list]);
  const [name, setName] = useState("");
  const [market, setMarket] = useState("");
  const [side, setSide] = useState<"" | "Over" | "Under">("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <section id={id} className="panel mt-4 rounded-2xl p-4" data-testid="dnb-panel" aria-label="Do Not Bet list">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200/80">⛔ Do Not Bet</h2>
        <span className="text-[10px] text-zinc-500">From your graded Log</span>
      </div>
      {list.length ? (
        <ul className="mt-2 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
          {list.map((e) => <Row key={e.id} e={e} onRemove={() => removeDnb(e.id)} />)}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] text-zinc-400">Teams, players or stats you keep missing on. You&apos;ll get a quiet heads-up when a new leg matches.</p>
      )}
      {sugg.length ? (
        <div className="mt-3" data-testid="dnb-suggest">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Suggested from your record</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {sugg.map((s) => (
              <button key={s.id} type="button" onClick={() => addDnb({ name: s.name, market: s.market })} className="press rounded-full border border-[color:var(--minus)]/50 px-2.5 py-1 text-[12px] font-bold capitalize text-zinc-200" data-testid="dnb-sugg">
                + {label(s)} <span className="tabular text-[color:var(--minus)]">{recText(s.rec.t)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : picks.some((p) => p.status !== "open") ? null : (
        <p className="mt-2 text-[11px] text-zinc-500">Suggestions show up once you have 3+ graded picks on the same name at 30% or worse.</p>
      )}
      {open ? (
        <form
          className="mt-3 grid gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!name.trim()) return;
            addDnb({ name, market: market || undefined, side: side || undefined, note: note || undefined });
            setName(""); setMarket(""); setSide(""); setNote(""); setOpen(false);
          }}
          data-testid="dnb-form"
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team or player (Bulls, Edwards)" className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[15px] text-white" aria-label="Team or player" maxLength={60} />
          <div className="flex gap-2">
            <input value={market} onChange={(e) => setMarket(e.target.value)} placeholder="Stat (optional: pts)" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[15px] text-white" aria-label="Stat" maxLength={30} />
            <select value={side} onChange={(e) => setSide(e.target.value as "" | "Over" | "Under")} className="rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-[15px] text-white" aria-label="Side">
              <option value="">Any side</option><option value="Over">Overs</option><option value="Under">Unders</option>
            </select>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why? (optional)" className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[15px] text-white" aria-label="Why" maxLength={140} />
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="press flex-1 rounded-xl border border-white/15 py-2 text-[14px] font-bold text-zinc-300">Cancel</button>
            <button type="submit" className="press flex-1 rounded-xl bg-purple-500 py-2 text-[14px] font-bold text-white" data-testid="dnb-save">Add to list</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="press mt-3 w-full rounded-xl border border-purple-400/40 py-2 text-[14px] font-bold text-purple-100" data-testid="dnb-add">+ Add a team or player</button>
      )}
    </section>
  );
}

/** Profile summary: count, the worst entry, link to the full list. */
export function DoNotBetSummary() {
  const list = useSyncExternalStore(subscribeDnb, getDnb, getServerDnb);
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const rows = list.map((e) => ({ e, r: recordFor(e, picks) })).sort((a, b) => (a.r.t.pct ?? 101) - (b.r.t.pct ?? 101));
  const sugg = suggest(picks, list).length;
  return (
    <Link href="/lines/stats#dnb" className="panel mb-4 flex items-center gap-3 rounded-2xl px-4 py-3" data-testid="dnb-summary">
      <span aria-hidden className="text-lg">⛔</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-black text-white">Do Not Bet · {list.length} on your list</div>
        <div className="truncate text-[11px] text-zinc-400">
          {rows[0] ? <>Worst: <span className="capitalize">{label(rows[0].e)}</span> {recText(rows[0].r.t)}</> : sugg ? `${sugg} suggested from your record` : "Add teams or players you keep missing on"}
        </div>
      </div>
      <span aria-hidden className="text-zinc-500">›</span>
    </Link>
  );
}
