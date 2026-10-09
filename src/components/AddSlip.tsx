"use client";

import { useState } from "react";
import { addPick } from "@/lib/pickStore";
import { parseSlipText, type SlipDraft } from "@/lib/slip";
import { SPORT_LABEL, SPORT_ORDER, type Sport } from "@/lib/types";

const LEAGUE: Record<Sport, string> = { NFL: "nfl", NBA: "nba", MLB: "mlb", NHL: "nhl", SOCCER: "soccer" };

type Row = SlipDraft & { keep: boolean };

async function readPhoto(file: File): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(file);
    return data.text || "";
  } finally {
    await worker.terminate();
  }
}

export default function AddSlip() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sport, setSport] = useState<Sport>("NBA");
  const [gameId, setGameId] = useState("");
  const [link, setLink] = useState("");
  const [book, setBook] = useState("");
  const [pasted, setPasted] = useState("");

  function loadText(text: string) {
    const parsed = parseSlipText(text).map((r) => ({ ...r, keep: true }));
    if (!parsed.length) {
      setError("Nothing readable. A row needs a name, a number, and over/under or a market.");
      setRows(null);
      return;
    }
    setError("");
    setRows(parsed);
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setBusy("Reading the photo on this device…");
    setError("");
    try {
      loadText(await readPhoto(file));
    } catch {
      setError("The photo could not be read. Paste the text instead.");
    } finally {
      setBusy("");
    }
  }

  async function onLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy("Opening the link…");
    setError("");
    try {
      const res = await fetch("/api/slip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: link }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "The link did not load.");
        return;
      }
      loadText(String(data.text || ""));
    } catch {
      setError("The link did not load.");
    } finally {
      setBusy("");
    }
  }

  function save() {
    if (!rows) return;
    const chosen = rows.filter((r) => r.keep && r.subject.trim() && r.market.trim() && Number.isFinite(r.line));
    if (!chosen.length) {
      setError("Confirm at least one row with a name, a market, and a line.");
      return;
    }
    const gid = gameId.trim();
    if (gid && !/^\d+$/.test(gid)) {
      setError("Game id is the ESPN number, or leave it blank.");
      return;
    }
    for (const r of chosen) {
      addPick({
        id: crypto.randomUUID(),
        sport,
        subject: r.subject.trim(),
        line: r.line,
        odds: r.odds ?? 0,
        stake: 0,
        book: book.trim() || "Slip",
        date: new Date().toISOString().slice(0, 10),
        status: "open",
        createdAt: new Date().toISOString(),
        league: LEAGUE[sport],
        gameId: gid || undefined,
        market: r.market.trim(),
        selection: r.selection,
        link: link.trim() || undefined,
      });
    }
    setRows(null);
    setOpen(false);
    setError("");
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-xl border border-[color:var(--gold)]/50 bg-[color:var(--gold)]/10 px-4 py-2 text-sm font-bold text-[color:var(--flat)]"
      >
        Add slip
      </button>
      {open && (
        <div className="panel mt-3 rounded-2xl p-4">
          <p className="text-sm text-zinc-400">
            Photo or link. You confirm every row before it is saved on this device. Blank fields stay blank.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-zinc-200">
              Photo
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => onPhoto(e.target.files?.[0])}
              />
            </label>
            <form onSubmit={onLink} className="flex min-w-0 flex-1 gap-2">
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https:// link"
                className="field min-w-0 flex-1"
              />
              <button type="submit" className="rounded-lg bg-white/10 px-3 text-xs font-bold text-white">
                Read
              </button>
            </form>
          </div>
          <textarea
            className="field mt-2 min-h-16 w-full"
            placeholder="Or paste the slip text"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <button
            type="button"
            onClick={() => pasted.trim() && loadText(pasted)}
            className="mt-2 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white"
          >
            Read text
          </button>
          {busy ? <p className="mt-2 text-sm text-zinc-400">{busy}</p> : null}
          {error ? <p className="mt-2 text-sm text-[color:var(--minus)]">{error}</p> : null}
          {rows && (
            <div className="mt-4 space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Sport
                  <select className="field mt-1 w-full" value={sport} onChange={(e) => setSport(e.target.value as Sport)}>
                    {SPORT_ORDER.map((s) => (
                      <option key={s}>{SPORT_LABEL[s]}</option>
                    ))}
                  </select>
                </label>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Game id
                  <input className="field mt-1 w-full" value={gameId} onChange={(e) => setGameId(e.target.value)} placeholder="ESPN id" />
                </label>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Book
                  <input className="field mt-1 w-full" value={book} onChange={(e) => setBook(e.target.value)} placeholder="Where you logged it" />
                </label>
              </div>
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 p-2 sm:grid-cols-6">
                  <label className="col-span-2 text-[10px] text-zinc-500 sm:col-span-2">
                    Keep
                    <input type="checkbox" className="ml-2" checked={r.keep} onChange={(e) => setRows(rows.map((row, j) => (j === i ? { ...row, keep: e.target.checked } : row)))} />
                  </label>
                  <input className="field col-span-2" value={r.subject} onChange={(e) => setRows(rows.map((row, j) => (j === i ? { ...row, subject: e.target.value } : row)))} />
                  <input className="field" value={r.market} placeholder="Market" onChange={(e) => setRows(rows.map((row, j) => (j === i ? { ...row, market: e.target.value } : row)))} />
                  <input className="field" value={String(r.line)} inputMode="decimal" onChange={(e) => setRows(rows.map((row, j) => (j === i ? { ...row, line: Number(e.target.value) } : row)))} />
                  <select className="field" value={r.selection ?? ""} onChange={(e) => setRows(rows.map((row, j) => (j === i ? { ...row, selection: e.target.value === "Over" || e.target.value === "Under" ? e.target.value : null } : row)))}>
                    <option value="">Side</option>
                    <option value="Over">Over</option>
                    <option value="Under">Under</option>
                  </select>
                  <input
                    className="field"
                    placeholder="Price"
                    value={r.odds ?? ""}
                    onChange={(e) => setRows(rows.map((row, j) => (j === i ? { ...row, odds: e.target.value === "" ? null : Number(e.target.value) } : row)))}
                  />
                </div>
              ))}
              <button type="button" onClick={save} className="rounded-xl bg-[color:var(--plus)] px-4 py-2 text-sm font-black text-black">
                Save confirmed rows
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
