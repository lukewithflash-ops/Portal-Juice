"use client";

import SharePosition from "@/components/SharePosition";
import { atLeastOf, isPickem } from "@/lib/plusLegs";
import { Component, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { pickFromLeg } from "@/lib/legPick";
import { addNote, getNotes, updateNote } from "@/lib/noteStore";
import { getPicks, getServerPicks, removePicks, replacePicks, restorePicks, subscribe } from "@/lib/pickStore";
import type { ImportLeg, SlipKind, SlipRow } from "@/lib/slipImport";
import type { Pick } from "@/lib/types";

/* ------------------------------ Delete + Undo ------------------------------ */

type UndoState = { picks: Pick[]; label: string; n: number } | null;
let undo: UndoState = null;
let undoTimer: ReturnType<typeof setTimeout> | null = null;
const undoListeners = new Set<() => void>();
const setUndo = (u: UndoState) => {
  undo = u;
  undoListeners.forEach((l) => l());
};

/** Delete picks now; Undo puts them back for 5 seconds. After that the recap cache for them goes too. */
export function deleteWithUndo(picks: Pick[], label: string) {
  if (!picks.length) return;
  removePicks(picks.map((p) => p.id));
  if (undoTimer) clearTimeout(undoTimer);
  const n = Date.now();
  setUndo({ picks, label, n });
  undoTimer = setTimeout(() => {
    for (const p of picks) {
      try {
        localStorage.removeItem("pj-recap5:" + p.id);
      } catch {
        /* private mode */
      }
    }
    if (undo?.n === n) setUndo(null);
  }, 5000);
}

/** A plain message toast for when something breaks. Never fail silently. */
export function errorToast(msg: string) {
  setUndo({ picks: [], label: msg, n: Date.now() });
  const n = undo?.n;
  setTimeout(() => undo?.n === n && setUndo(null), 5000);
}

class Guard extends Component<{ children: ReactNode; onFail: () => void }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() {
    return { bad: true };
  }
  componentDidCatch(err: unknown) {
    console.error("pick edit", err);
    errorToast("Couldn't open the editor. Reload and try again.");
    this.props.onFail();
  }
  render() {
    return this.state.bad ? null : this.props.children;
  }
}

/** Bottom toast with Undo. Mounted once in the layout. */
export function UndoToast() {
  const u = useSyncExternalStore(
    (cb) => {
      undoListeners.add(cb);
      return () => undoListeners.delete(cb);
    },
    () => undo,
    () => null
  );
  if (!u) return null;
  return (
    <div data-layer="" style={{ position: "fixed", zIndex: 1001 }} className="portal-toast stats-toast fixed bottom-[calc(var(--tabbar)+1.5rem)] left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-2 text-sm font-black text-white" role="status" data-testid="undo-toast">
      <span>{u.picks.length ? `${u.label} deleted` : u.label}</span>
      {u.picks.length ? <button
        type="button"
        className="rounded-lg border border-[color:var(--plus)] px-2 py-0.5 text-[color:var(--plus)]"
        onClick={() => {
          restorePicks(u.picks);
          if (undoTimer) clearTimeout(undoTimer);
          setUndo(null);
        }}
        data-testid="undo-button"
      >
        Undo
      </button> : null}
    </div>
  );
}

function Confirm({ title, body, cta, onCancel, onOk }: { title: string; body: string; cta: string; onCancel: () => void; onOk: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onCancel]);
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" data-layer="" style={{ position: "fixed", inset: 0, zIndex: 1000 }} onClick={onCancel}>
      <div role="alertdialog" aria-modal="true" aria-label={title} className="reset-dialog w-full max-w-sm rounded-2xl p-5" onClick={(e) => e.stopPropagation()} data-testid="delete-pick-dialog">
        <div className="reset-ring mx-auto mb-3 h-12 w-12 rounded-full" aria-hidden />
        <h2 className="text-center text-lg font-black text-white">{title}</h2>
        <p className="mt-2 text-center text-[13px] leading-snug text-zinc-300">{body}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button ref={cancel} type="button" onClick={onCancel} className="rounded-xl border border-white/25 bg-white/10 px-3 py-2.5 text-sm font-black text-white" data-testid="delete-pick-cancel">
            Cancel
          </button>
          <button type="button" onClick={onOk} className="rounded-xl bg-red-600 px-3 py-2.5 text-sm font-black text-white shadow-[0_0_16px_rgba(239,68,68,0.6)]" data-testid="delete-pick-confirm">
            {cta}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Edit + Delete for one pick or a whole parlay. */
export function PickActions({ picks, small = false }: { picks: Pick[]; small?: boolean }) {
  const [del, setDel] = useState(false);
  const [edit, setEdit] = useState(false);
  if (!picks.length) return null;
  const parlay = picks.length > 1;
  const word = parlay ? "parlay" : "pick";
  const cls = small ? "text-[11px] font-bold" : "rounded-lg border px-2.5 py-1 text-[11px] font-black";
  return (
    <span className="inline-flex items-center gap-2" data-testid={parlay ? "parlay-actions" : "pick-actions"} onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEdit(true); }} className={cls + (small ? " text-purple-200" : " border-purple-400/50 text-purple-100")} data-testid={`edit-${word}`}>
        Edit{parlay ? " parlay" : ""}
      </button>
      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDel(true); }} className={cls + (small ? " text-red-300" : " border-red-500/50 text-red-300")} data-testid={`delete-${word}`}>
        Delete{parlay ? " parlay" : ""}
      </button>
      <SharePosition picks={picks} small={small} />
      {del ? (
        <Confirm
          title={parlay ? "Delete this parlay?" : "Delete this pick?"}
          body={parlay ? `All ${picks.length} legs come off your Log, stats and streak. This can't be undone.` : "It comes off your Log, stats and streak. This can't be undone."}
          cta="Delete"
          onCancel={() => setDel(false)}
          onOk={() => {
            setDel(false);
            deleteWithUndo(picks, parlay ? "Parlay" : "Pick");
          }}
        />
      ) : null}
      {edit ? (
        <Guard onFail={() => setEdit(false)}>
          <EditDialog picks={picks} onClose={() => setEdit(false)} />
        </Guard>
      ) : null}
    </span>
  );
}

/* --------------------------------- Edit --------------------------------- */

type Row = {
  key: string;
  id?: string;
  subject: string;
  market: string;
  line: string;
  selection: "Over" | "Under" | "Plus" | "";
  /** Whole-number over on a pick'em slip: you chose a plain over (exactly N pushes). */
  plainOver?: boolean;
  league?: string;
  gameId?: string;
  gameLabel?: string;
  matched?: ImportLeg | null;
  msg?: string;
  busy?: boolean;
};

const TEAM = /money|^ml$|spread|run line|puck line/i;

function rowOf(p: Pick): Row {
  const sel = String(p.selection ?? "").toLowerCase();
  return {
    key: String(p.id ?? Math.random()),
    id: p.id,
    subject: String(p.subject ?? ""),
    market: String(p.market ?? ""),
    line: p.plus ? String(atLeastOf(p)) : p.line == null || !Number.isFinite(Number(p.line)) ? "" : String(p.line),
    selection: p.plus ? "Plus" : sel.startsWith("o") ? "Over" : sel.startsWith("u") ? "Under" : "",
    plainOver: p.plus === false && Number.isInteger(p.line) ? true : undefined,
    league: p.league,
    gameId: p.gameId,
  };
}

/** What a row saves as. "Plus" (or a whole-number over on a pick'em slip you didn't mark plain) is at least N: line N - 0.5. */
function effOf(r: Row, book: string): { line: number; selection: "Over" | "Under" | null; plus: boolean } {
  const n = Number(r.line);
  const prop = !TEAM.test(r.market) && !/^total/i.test(r.market);
  const ask = wholePickem(r, book);
  if (Number.isFinite(n) && (r.selection === "Plus" || (ask && !r.plainOver))) return { line: Math.ceil(n) - 0.5, selection: "Over", plus: true };
  return { line: Number.isFinite(n) ? n : 0, selection: r.selection === "Plus" ? "Over" : r.selection || (prop ? null : null), plus: false };
}
function wholePickem(r: Row, book: string): boolean {
  const n = Number(r.line);
  return r.selection === "Over" && !TEAM.test(r.market) && !/^total/i.test(r.market) && r.line.trim() !== "" && Number.isInteger(n) && n > 0 && isPickem(book);
}

function EditDialog({ picks, onClose }: { picks: Pick[]; onClose: () => void }) {
  const all = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const orig = picks.map((p) => all.find((x) => x.id === p.id) ?? p);
  const slipId = orig[0].slipId;
  const parlayNote = slipId ? (getNotes() ?? []).find((n) => n.kind === "parlay" && n.slipId === slipId) : undefined;
  const [rows, setRows] = useState<Row[]>(() => orig.map(rowOf));
  const [date, setDate] = useState(String(orig[0].date ?? "").slice(0, 10));
  const [book, setBook] = useState(String(orig[0].book ?? ""));
  const [note, setNote] = useState(parlayNote?.text ?? "");
  const [err, setErr] = useState<string | null>(null);
  const upd = (k: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === k ? { ...r, ...patch } : r)));

  async function match(r: Row) {
    upd(r.key, { busy: true, msg: undefined });
    const kind: SlipKind = /money|^ml$/i.test(r.market) ? "moneyline" : /spread/i.test(r.market) ? "spread" : /^total/i.test(r.market) ? "total" : "prop";
    const e = effOf(r, book);
    const n = r.line.trim() === "" ? NaN : e.line;
    const row: SlipRow = { subject: r.subject.trim(), kind, market: kind === "prop" ? r.market : kind, line: kind === "moneyline" || !Number.isFinite(n) ? null : n, selection: kind === "prop" || kind === "total" ? (e.selection || "Over") : null, odds: null, league: r.league ?? null, date, plus: e.plus };
    try {
      const res = await fetch("/api/slip/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: [row] }) });
      const j = (await res.json()) as { legs?: ImportLeg[] };
      const hit = j.legs?.[0];
      if (hit?.leg && hit.game) upd(r.key, { busy: false, matched: hit, league: hit.game.league, gameId: hit.game.id, gameLabel: `${hit.game.away} @ ${hit.game.home} · ${new Date(hit.game.start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` });
      else upd(r.key, { busy: false, msg: hit?.issue ?? "No game found." });
    } catch {
      upd(r.key, { busy: false, msg: "Search failed." });
    }
  }

  function save() {
    try {
      saveInner();
    } catch (e) {
      console.error("pick save", e);
      setErr("Couldn't save that. Check the legs and try again.");
    }
  }
  function saveInner() {
    const live = rows.filter((r) => r.subject.trim());
    if (!live.length) return setErr("Keep at least one leg, or delete it instead.");
    for (const r of live) if (!TEAM.test(r.market) && r.line.trim() && !Number.isFinite(Number(r.line))) return setErr(`Line for ${r.subject} must be a number.`);
    const sid = live.length > 1 ? slipId ?? crypto.randomUUID() : slipId;
    const next: Pick[] = [];
    for (const r of live) {
      const o = orig.find((p) => p.id === r.id);
      const e = effOf(r, book);
      const line = r.line.trim() === "" ? NaN : e.line;
      let p: Pick;
      if (r.matched?.leg && r.matched.game) {
        const base = pickFromLeg(r.matched.leg, { home: r.matched.game.home, away: r.matched.game.away }, { book, date, slipId: sid });
        p = { ...base, id: o?.id ?? base.id, createdAt: o?.createdAt ?? base.createdAt, odds: o?.odds ?? base.odds, stake: o?.stake ?? 0, status: r.matched.result ?? "open", plus: e.plus };
      } else {
        const changed = !o || o.subject !== r.subject.trim() || (o.market ?? "") !== r.market || o.line !== line || (o.selection ?? null) !== e.selection || Boolean(o.plus) !== e.plus;
        p = {
          ...(o ?? { id: crypto.randomUUID(), sport: orig[0].sport, odds: -110, stake: 0, createdAt: new Date().toISOString(), status: "open" as const }),
          subject: r.subject.trim(),
          market: r.market || undefined,
          line: Number.isFinite(line) ? line : 0,
          selection: e.selection,
          plus: e.plus,
          ...(o ? {} : { league: r.league, gameId: r.gameId }),
          status: changed ? "open" : (o?.status ?? "open"),
        } as Pick;
        // A stat you typed beats the printed one: drop the slip text so the load-time re-read can't put the old stat back.
        if (o && (o.market ?? "") !== r.market) delete p.marketRaw;
      }
      next.push({ ...p, date, book, slipId: sid });
    }
    const removed = orig.filter((p) => !live.some((r) => r.id === p.id)).map((p) => p.id);
    replacePicks(next, removed);
    for (const p of next) {
      try {
        localStorage.removeItem("pj-recap5:" + p.id);
      } catch {
        /* private mode */
      }
    }
    if (sid && live.length > 1) {
      if (parlayNote) {
        if (note.trim() && note.trim() !== parlayNote.text) updateNote(parlayNote.id, { text: note.trim(), pickIds: next.map((p) => p.id) });
      } else if (!parlayNote && note.trim()) addNote({ kind: "parlay", text: note.trim(), slipId: sid, pickIds: next.map((p) => p.id), date });
    }
    window.dispatchEvent(new Event("pj-regrade"));
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-stretch justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-4" data-layer="" style={{ position: "fixed", inset: 0, zIndex: 1000 }} onClick={onClose} data-testid="edit-sheet">
      <div role="dialog" aria-modal="true" aria-label="Edit" className="reset-dialog h-full w-full max-w-lg overflow-y-auto overscroll-contain p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] sm:h-auto sm:max-h-[92vh] sm:rounded-2xl" onClick={(e) => e.stopPropagation()} data-testid="edit-dialog">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-black text-white">{rows.length > 1 ? `Edit parlay · ${rows.length} legs` : "Edit pick"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-zinc-400">✕</button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field mt-0.5 w-full text-[13px]" /></label>
          <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">App<input value={book} onChange={(e) => setBook(e.target.value)} className="field mt-0.5 w-full text-[13px]" data-testid="edit-book" /></label>
        </div>
        <ul className="mt-3 space-y-2">
          {rows.map((r, i) => (
            <li key={r.key} className="note-item rounded-xl p-2" data-testid="edit-leg">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.16em] text-purple-200">
                <span>Leg {i + 1}</span>
                <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="text-red-300" data-testid="edit-remove-leg">Remove leg</button>
              </div>
              <input value={r.subject} onChange={(e) => upd(r.key, { subject: e.target.value, matched: null })} placeholder="Player or team" className="field mt-1 w-full text-[13px]" aria-label="Player or team" data-testid="edit-subject" />
              <div className="mt-1 grid grid-cols-[1fr_5rem_6.5rem] gap-1">
                <input value={r.market} onChange={(e) => upd(r.key, { market: e.target.value, matched: null })} placeholder="Stat (points, spread…)" className="field text-[13px]" aria-label="Stat" data-testid="edit-market" />
                <input value={r.line} onChange={(e) => upd(r.key, { line: e.target.value, matched: null })} inputMode="decimal" placeholder="Line" className="field text-[13px]" aria-label="Line" data-testid="edit-line" />
                <select value={r.selection} onChange={(e) => upd(r.key, { selection: e.target.value as Row["selection"], matched: null, plainOver: undefined })} className="field text-[13px]" aria-label="Over, under or at least" data-testid="edit-side">
                  <option value="Over">Over</option>
                  <option value="Under">Under</option>
                  {!TEAM.test(r.market) ? <option value="Plus">At least (+)</option> : null}
                  <option value="">—</option>
                </select>
              </div>
              {r.selection === "Plus" && r.line.trim() ? (
                <p className="mt-1 text-[11px] text-[color:var(--plus)]" data-testid="edit-plus-note">Saves as {Math.ceil(Number(r.line))}+ : exactly {Math.ceil(Number(r.line))} is a hit.</p>
              ) : wholePickem(r, book) ? (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]" data-testid="edit-plus-ask">
                  <span className="text-zinc-300">{r.line} on a pick&apos;em slip:</span>
                  <button type="button" onClick={() => upd(r.key, { plainOver: false, matched: null })} className={`rounded-full px-2 py-0.5 font-black ${!r.plainOver ? "bg-[color:var(--plus)] text-black" : "border border-white/20 text-zinc-300"}`} data-testid="edit-plus-yes">{r.line}+ (exactly {r.line} hits)</button>
                  <button type="button" onClick={() => upd(r.key, { plainOver: true, matched: null })} className={`rounded-full px-2 py-0.5 font-black ${r.plainOver ? "bg-white text-black" : "border border-white/20 text-zinc-300"}`} data-testid="edit-plus-no">Over {r.line} (exactly {r.line} pushes)</button>
                </div>
              ) : null}
              <div className="mt-1 flex items-center gap-2 text-[11px]">
                <button type="button" onClick={() => match(r)} disabled={r.busy || !r.subject.trim()} className="rounded-lg border border-[color:var(--plus)]/60 px-2 py-0.5 font-black text-white" data-testid="edit-match">
                  {r.busy ? "Finding…" : "Match it"}
                </button>
                <span className="min-w-0 truncate text-zinc-400">{r.gameLabel ?? (r.gameId ? `${r.league?.toUpperCase()} game ${r.gameId}` : "Not tied to a game")}</span>
              </div>
              {r.msg ? <p className="mt-0.5 text-[11px] text-amber-300">{r.msg}</p> : null}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setRows((rs) => [...rs, { key: crypto.randomUUID(), subject: "", market: "", line: "", selection: "Over", league: orig[0].league }])} className="mt-2 w-full rounded-xl border border-dashed border-purple-400/50 py-2 text-[12px] font-black text-purple-100" data-testid="edit-add-leg">
          ＋ Add a leg
        </button>
        {rows.length > 1 ? (
          <label className="mt-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
            Parlay note
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={600} className="field mt-0.5 w-full text-[13px] normal-case tracking-normal" data-testid="edit-note" />
          </label>
        ) : null}
        <p className="mt-2 text-[11px] text-zinc-500">Changed legs go back to open and re-grade from the box score. Synced to your account when signed in.</p>
        {err ? <p className="mt-1 text-[12px] text-[color:var(--minus)]" role="alert">{err}</p> : null}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/25 bg-white/10 px-3 py-2.5 text-sm font-black text-white">Cancel</button>
          <button type="button" onClick={save} className="note-add rounded-xl px-3 py-2.5 text-sm font-black text-white" data-testid="edit-save">Save</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
