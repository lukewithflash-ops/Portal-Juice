"use client";

import Link from "next/link";
import { useState } from "react";
import { checkHref, type LegInput } from "@/lib/breakdown";
import { pickFromLeg, sportOf } from "@/lib/legPick";
import { addPick } from "@/lib/pickStore";
import type { ImportLeg, SlipKind, SlipRow } from "@/lib/slipImport";
import { ptTime } from "@/lib/time";

type Item = ImportLeg & { keep: boolean; dirty: boolean };

const KIND_LABEL: Record<SlipKind, string> = { prop: "Prop", spread: "Spread", total: "Total", moneyline: "Moneyline" };

/** Shrinks a photo to a JPEG data URL (max 1600px) so it uploads fast. */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

async function ocr(file: File): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(file);
    return data.text || "";
  } finally {
    await worker.terminate();
  }
}

async function post(body: unknown): Promise<{ legs?: ImportLeg[]; stake?: number | null; error?: string; vision?: boolean; reason?: string }> {
  const res = await fetch("/api/slip/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

/**
 * Photo, link, or pasted text → rows you confirm → Break it down or Track it.
 * Rows only come from what the slip shows. Anything we cannot tie to a game is flagged.
 */
export default function SlipImport({ onBreakDown, compact = false }: { onBreakDown?: (legs: LegInput[]) => void; compact?: boolean }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [stake, setStake] = useState("");
  const [book, setBook] = useState("");
  const [link, setLink] = useState("");
  const [pasted, setPasted] = useState("");
  const [tracked, setTracked] = useState(false);

  function load(r: { legs?: ImportLeg[]; stake?: number | null; error?: string }, how: string) {
    setTracked(false);
    if (r.error) return setError(r.error);
    const legs = r.legs ?? [];
    if (!legs.length) {
      setItems(null);
      return setError("No legs found. A row needs a name and a line, side, or price. Paste the slip text to try again.");
    }
    setError("");
    setNote(how);
    if (r.stake) setStake(String(r.stake));
    setItems(legs.map((l) => ({ ...l, keep: true, dirty: false })));
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy("Reading the photo…");
    try {
      const r = await post({ image: await shrink(file) });
      if (r.vision === false || (!r.legs && !r.error)) {
        setBusy("Photo reader is off. Reading on this device…");
        const text = await ocr(file);
        load(await post({ text }), "Read on this device. Check each row.");
      } else load(r, "Read from the photo. Check each row.");
    } catch {
      setError("The photo could not be read. Paste the slip text instead.");
    } finally {
      setBusy("");
    }
  }

  async function onLink(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim()) return;
    setError("");
    setBusy("Opening the link…");
    try {
      const res = await fetch("/api/slip", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: link }) });
      const d = await res.json();
      if (!res.ok || !String(d.text ?? "").trim()) {
        setError(`${d.error ?? "That book doesn’t share the slip with us."} Open the slip, copy its text (or screenshot it), and use the box below.`);
        return;
      }
      const r = await post({ text: d.text });
      if (!r.legs?.length) {
        setError("The link opened, but the legs load in the book’s app. Copy the slip text or upload a screenshot instead.");
        return;
      }
      load(r, "Read from the link. Check each row.");
    } catch {
      setError("The link did not load. Paste the slip text or upload a screenshot.");
    } finally {
      setBusy("");
    }
  }

  async function onPaste() {
    if (!pasted.trim()) return;
    setBusy("Reading…");
    try {
      load(await post({ text: pasted }), "Read from your text. Check each row.");
    } catch {
      setError("Could not read that.");
    } finally {
      setBusy("");
    }
  }

  async function rematch() {
    if (!items) return;
    setBusy("Matching to games…");
    try {
      const r = await post({ rows: items.map((x) => x.row) });
      const legs = r.legs ?? [];
      setItems(items.map((x, i) => ({ ...(legs[i] ?? x), keep: x.keep, dirty: false })));
    } finally {
      setBusy("");
    }
  }

  const edit = (i: number, patch: Partial<SlipRow>) =>
    setItems((xs) => (xs ? xs.map((x, j) => (j === i ? { ...x, row: { ...x.row, ...patch }, dirty: true } : x)) : xs));

  const kept = items?.filter((x) => x.keep) ?? [];
  const ready = kept.filter((x) => x.leg && !x.issue && !x.dirty);
  const dirty = items?.some((x) => x.dirty) ?? false;

  function breakDown() {
    const legs = ready.map((x) => x.leg as LegInput).slice(0, 6);
    if (!legs.length) return;
    if (onBreakDown) onBreakDown(legs);
    else window.location.href = checkHref(legs);
  }

  function track() {
    if (!kept.length) return;
    const slipId = crypto.randomUUID();
    const amount = Number(stake);
    kept.forEach((x, i) => {
      const extra = { slipId, book: book || "Slip", stake: i === 0 && amount > 0 ? amount : 0, odds: x.row.odds };
      if (x.leg && x.game && !x.dirty) {
        addPick({ ...pickFromLeg(x.leg, { home: x.game.home, away: x.game.away }, extra), link: link.trim() || undefined });
        return;
      }
      // Not tied to a game: saved as read, so you can fix it in the Log.
      addPick({
        id: crypto.randomUUID(),
        slipId,
        sport: sportOf(x.game?.league ?? ""),
        subject: x.row.subject,
        line: x.row.line ?? 0,
        odds: x.row.odds ?? 0,
        stake: extra.stake,
        book: extra.book,
        date: new Date().toISOString().slice(0, 10),
        status: "open",
        createdAt: new Date().toISOString(),
        market: x.row.kind === "prop" ? x.row.market : KIND_LABEL[x.row.kind],
        selection: x.row.selection,
        link: link.trim() || undefined,
      });
    });
    setTracked(true);
  }

  return (
    <div className={compact ? "space-y-3" : "panel space-y-3 rounded-2xl p-4"}>
      <p className="text-sm text-zinc-400">Upload a slip photo, paste a share link, or paste the slip text. You check every row. Nothing is placed.</p>
      <div className="flex flex-wrap gap-2">
        <label className="cursor-pointer rounded-lg border border-[color:var(--gold)]/50 bg-[color:var(--gold)]/10 px-3 py-2 text-xs font-bold text-white">
          📷 Slip photo
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
        </label>
        <form onSubmit={onLink} className="flex min-w-0 flex-1 gap-2">
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Share link (https://…)" className="field min-w-0 flex-1" aria-label="Share link" />
          <button type="submit" className="rounded-lg bg-white/10 px-3 text-xs font-bold text-white">
            Read
          </button>
        </form>
      </div>
      <div className="flex gap-2">
        <textarea className="field min-h-14 flex-1" placeholder="Or paste the slip text" value={pasted} onChange={(e) => setPasted(e.target.value)} aria-label="Slip text" />
        <button type="button" onClick={onPaste} className="self-end rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white">
          Read text
        </button>
      </div>
      {busy ? <p className="text-sm text-zinc-300" role="status">{busy}</p> : null}
      {error ? <p className="text-sm text-[color:var(--minus)]">{error}</p> : null}
      {items ? (
        <div className="space-y-2">
          {note ? <p className="text-xs text-zinc-500">{note}</p> : null}
          <ul className="space-y-2">
            {items.map((x, i) => (
              <li key={i} className={"rounded-xl border p-2 " + (x.issue || !x.leg ? "border-[color:var(--minus)]/50 bg-[color:var(--minus)]/5" : "border-white/10")}>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <label className="flex items-center gap-1.5 text-zinc-400">
                    <input type="checkbox" checked={x.keep} onChange={(e) => setItems(items.map((y, j) => (j === i ? { ...y, keep: e.target.checked } : y)))} />
                    Keep
                  </label>
                  <span className={x.leg && !x.issue ? "font-bold text-[color:var(--plus)]" : "font-bold text-[color:var(--minus)]"}>
                    {x.game ? `${x.game.away} @ ${x.game.home} · ${ptTime(x.game.start)}` : "Not matched"}
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-6 gap-1.5">
                  <input className="field col-span-4" value={x.row.subject} aria-label="Player or team" onChange={(e) => edit(i, { subject: e.target.value })} />
                  <select className="field col-span-2" value={x.row.kind} aria-label="Type" onChange={(e) => edit(i, { kind: e.target.value as SlipKind, market: e.target.value === "prop" ? x.row.market : e.target.value })}>
                    {(Object.keys(KIND_LABEL) as SlipKind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  {x.row.kind === "prop" ? (
                    <input className="field col-span-6" value={x.row.market} placeholder="Stat" aria-label="Stat" onChange={(e) => edit(i, { market: e.target.value })} />
                  ) : null}
                  {x.row.kind === "prop" || x.row.kind === "total" ? (
                    <select className="field col-span-2 min-w-0" value={x.row.selection ?? ""} aria-label="Side" onChange={(e) => edit(i, { selection: e.target.value === "Over" || e.target.value === "Under" ? e.target.value : null })}>
                      <option value="">—</option>
                      <option value="Over">Over</option>
                      <option value="Under">Under</option>
                    </select>
                  ) : null}
                  {x.row.kind !== "moneyline" ? (
                    <input
                      className={"field min-w-0 " + (x.row.kind === "prop" || x.row.kind === "total" ? "col-span-2" : "col-span-3")}
                      value={x.row.line ?? ""}
                      placeholder="Line"
                      inputMode="decimal"
                      aria-label="Line"
                      onChange={(e) => edit(i, { line: e.target.value === "" || !Number.isFinite(Number(e.target.value)) ? null : Number(e.target.value) })}
                    />
                  ) : null}
                  <input
                    className={"field min-w-0 " + (x.row.kind === "spread" ? "col-span-3" : x.row.kind === "moneyline" ? "col-span-6" : "col-span-2")}
                    value={x.row.odds ?? ""}
                    placeholder="Price"
                    aria-label="Price"
                    onChange={(e) => edit(i, { odds: e.target.value === "" || !Number.isFinite(Number(e.target.value)) ? null : Number(e.target.value) })}
                  />
                </div>
                {x.dirty ? (
                  <p className="mt-1 text-[11px] text-zinc-400">Edited. Tap Match again.</p>
                ) : x.issue ? (
                  <p className="mt-1 text-[11px] text-[color:var(--minus)]">⚠ {x.issue}</p>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Stake (stays on this device)
              <input className="field mt-1 w-full" inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} placeholder="0" />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Book
              <input className="field mt-1 w-full" value={book} onChange={(e) => setBook(e.target.value)} placeholder="Where you logged it" />
            </label>
          </div>
          {dirty ? (
            <button type="button" onClick={rematch} className="w-full rounded-xl border border-white/20 py-2 text-sm font-bold text-white">
              Match again
            </button>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={!ready.length} onClick={breakDown} className="rounded-xl bg-[color:var(--gold)] py-2.5 text-sm font-black text-black disabled:opacity-40">
              Break it down{ready.length ? ` (${Math.min(6, ready.length)})` : ""}
            </button>
            <button type="button" disabled={!kept.length || tracked} onClick={track} className="rounded-xl bg-[color:var(--plus)] py-2.5 text-sm font-black text-black disabled:opacity-40">
              {tracked ? "Tracked ✓" : "Track it"}
            </button>
          </div>
          {kept.length > ready.length ? (
            <p className="text-[11px] text-zinc-500">
              {kept.length - ready.length} flagged row{kept.length - ready.length === 1 ? "" : "s"} stay out of the breakdown until fixed. Track it saves them as read.
            </p>
          ) : null}
          {tracked ? (
            <p className="text-xs text-zinc-300">
              Saved to your <Link href="/lines/portfolio" className="underline">Log</Link>.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
