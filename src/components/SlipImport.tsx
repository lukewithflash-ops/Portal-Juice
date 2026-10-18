"use client";
import { isPickem } from "@/lib/plusLegs";
import SlipCheck, { checkLegOf } from "@/components/SlipCheck";

import Link from "next/link";
import { useState } from "react";
import { checkHref, type LegInput } from "@/lib/breakdown";
import { pickFromLeg, sportOf } from "@/lib/legPick";
import { addPick } from "@/lib/pickStore";
import { StatTipLine } from "@/components/StatsExtras";
import { STAT_CHOICES, sportGroupOf, type GameRef, type ImportLeg, type SlipKind, type SlipRow } from "@/lib/slipImport";
import { marketTerms, FANTASY_NOTE } from "@/lib/tracker";
import { statFromMarket } from "@/lib/breakdown";
import { ptTime } from "@/lib/time";

type Item = ImportLeg & { keep: boolean; dirty: boolean };

/** Leagues you can put a leg in, one tap from the leg. */
const LEAGUE_CHOICES: [string, string][] = [
  ["nfl", "NFL"], ["ncaaf", "NCAAF"], ["nba", "NBA"], ["wnba", "WNBA"], ["ncaam", "NCAAM"], ["ncaaw", "NCAAW"], ["mlb", "MLB"], ["nhl", "NHL"],
  ["mls", "MLS"], ["epl", "EPL"], ["ucl", "UCL"], ["laliga", "La Liga"], ["seriea", "Serie A"], ["bundesliga", "Bundesliga"], ["atp", "ATP"], ["wta", "WTA"], ["ufc", "UFC"],
];

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

/** Local calendar date of a game start (YYYY-MM-DD), so a future game logs on its own day. */
function localDay(iso: string | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const t = Number.isNaN(d.getTime()) ? new Date() : d;
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

const RESULT_LABEL = { win: "W", loss: "L", push: "P" } as const;

/** Tie a row to a game you picked. Props keep the printed name; sides pick the team the row names (or home). */
function legFor(row: SlipRow, g: GameRef, side: "home" | "away"): LegInput {
  const pick = row.selection === "Under" ? "under" : "over";
  if (row.kind === "prop") return { league: g.league, gameId: g.id, kind: "prop", athleteName: row.subject, market: row.market, stat: statFromMarket(g.league, row.market) ?? undefined, line: row.line, pick, odds: row.odds };
  if (row.kind === "total") return { league: g.league, gameId: g.id, kind: "total", line: row.line, pick, odds: row.odds };
  const team = side === "home" ? g.homeName ?? g.home : g.awayName ?? g.away;
  return row.kind === "spread"
    ? { league: g.league, gameId: g.id, kind: "spread", side, team: side === "home" ? g.home : g.away, line: row.line, odds: row.odds }
    : { league: g.league, gameId: g.id, kind: "moneyline", side, team: team && team.length <= 4 ? team : side === "home" ? g.home : g.away, odds: row.odds };
}

function guessSide(row: SlipRow, g: GameRef): "home" | "away" {
  const t = (row.subject + " " + (row.team ?? "")).toLowerCase();
  const hit = (abbr: string, name?: string) => t.includes(abbr.toLowerCase()) || (!!name && name.toLowerCase().split(" ").some((w) => w.length > 3 && t.includes(w)));
  return hit(g.away, g.awayName) && !hit(g.home, g.homeName) ? "away" : "home";
}

const optLabel = (g: GameRef) => `${g.league.toUpperCase()} · ${g.away} @ ${g.home} · ${g.state === "post" ? "Final, " : g.state === "in" ? "Live, " : ""}${ptTime(g.start)}`;

type ReadReply = { legs?: ImportLeg[]; options?: GameRef[]; stake?: number | null; book?: string | null; error?: string; vision?: boolean; failed?: boolean; reason?: string };

async function post(body: unknown, timeoutMs = 95_000): Promise<ReadReply> {
  const res = await fetch("/api/slip/read", { method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  // A timeout or a gateway page is not JSON: report it as a hiccup, never as "reader off".
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return { failed: true, vision: true, reason: `http-${res.status}` };
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

  function load(r: { legs?: ImportLeg[]; stake?: number | null; book?: string | null; error?: string }, how: string) {
    setTracked(false);
    if (r.error) return setError(r.error);
    const legs = r.legs ?? [];
    if (!legs.length) {
      setItems(null);
      return setError("No legs found. A row needs a name and a line, side, or price. Paste the slip text to try again.");
    }
    setError("");
    setNote(how);
    if (r.book) setBook(r.book);
    setItems(legs.map((l) => ({ ...l, keep: true, dirty: false })));
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy("Reading the photo…");
    try {
      const image = await shrink(file);
      let r: ReadReply = await post({ image }).catch(() => ({ failed: true, vision: true, reason: "network" }));
      if (r.failed && r.vision !== false) {
        setBusy("Reading the photo again…");
        r = await post({ image }).catch(() => ({ failed: true, vision: true, reason: "network" }));
      }
      if (r.vision === false || r.failed || (!r.legs && !r.error)) {
        setBusy(r.vision === false ? "Photo reading isn’t set up here. Reading on this device…" : "The photo reader didn’t answer. Reading on this device…");
        const text = await ocr(file);
        load(await post({ text }), r.vision === false ? "Read on this device. Check each row." : "The photo reader was busy, so this was read on this device. Check each row.");
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

  /** One tap on the league: match this leg again inside that league only ("" = let the reader decide). */
  async function setLeague(i: number, league: string) {
    if (!items) return;
    const x = items[i];
    const row: SlipRow = { ...x.row, league: league || null, leagueLocked: !!league, slipLeagues: undefined };
    setBusy("Matching to games…");
    try {
      const r = await post({ rows: [row] });
      const m = r.legs?.[0];
      setItems((xs) => (xs ? xs.map((y, j) => (j === i ? { ...(m ?? { ...y, row }), keep: y.keep, dirty: false } : y)) : xs));
    } finally {
      setBusy("");
    }
  }

  async function loadOptions(i: number) {
    if (!items) return;
    const x = items[i];
    if (x.options?.length) return;
    try {
      const r = await post({ options: x.row });
      setItems((xs) => (xs ? xs.map((y, j) => (j === i ? { ...y, options: r.options ?? [] } : y)) : xs));
    } catch {
      /* keep the row as a manual leg */
    }
  }

  function matchTo(i: number, key: string, side?: "home" | "away") {
    setItems((xs) =>
      xs
        ? xs.map((x, j) => {
            if (j !== i) return x;
            const g = x.options?.find((o) => `${o.league}/${o.id}` === key) ?? (x.game && `${x.game.league}/${x.game.id}` === key ? x.game : null);
            if (!g) return { ...x, leg: null, game: null, result: null, issue: "Not tied to a game. Saves as a manual leg you grade.", manual: true };
            const s2 = side ?? guessSide(x.row, g);
            return { ...x, game: g, leg: legFor(x.row, g, s2), result: null, dirty: false, manual: x.row.kind === "prop" && marketTerms(x.row.market).length === 0, issue: g.state === "post" ? "Matched by you. A finished game grades in your Log within a couple of minutes." : null };
          })
        : xs
    );
  }

  /** Name or type changes need a new match. Stat, line, side, and price edits apply right here. */
  const edit = (i: number, patch: Partial<SlipRow>) =>
    setItems((xs) =>
      xs
        ? xs.map((x, j) => {
            if (j !== i) return x;
            const row = { ...x.row, ...patch };
            const needsMatch = "subject" in patch || "kind" in patch || !x.leg;
            if (needsMatch) return { ...x, row, dirty: true };
            const leg: LegInput = {
              ...(x.leg as LegInput),
              market: row.kind === "prop" ? row.market : (x.leg as LegInput).market,
              stat: row.kind === "prop" ? statFromMarket(x.game?.league ?? "", row.market) ?? undefined : (x.leg as LegInput).stat,
              line: row.line,
              pick: row.selection === "Under" ? "under" : "over",
              odds: row.odds,
            };
            const live = row.kind !== "prop" || marketTerms(row.market).length > 0;
            const issue =
              row.kind === "prop" && !row.market
                ? "Pick the stat. Until then it saves as a manual leg."
                : row.line == null && row.kind !== "moneyline"
                  ? "Add the line."
                  : (row.kind === "prop" || row.kind === "total") && !row.selection
                    ? "Pick over or under."
                    : !live
                      ? "No live meter for this stat. It saves as a manual leg you grade."
                      : null;
            return { ...x, row, leg, issue, manual: !live };
          })
        : xs
    );

  const kept = items?.filter((x) => x.keep) ?? [];
  // Break it down takes every kept row. Rows without a game go as manual legs; the server reads what it can.
  const asLeg = (x: Item): LegInput =>
    x.leg && !x.dirty
      ? { ...x.leg, market: x.row.kind === "prop" ? x.row.market : x.leg.market }
      : {
          league: x.game?.league ?? "",
          gameId: x.game?.id ?? "",
          kind: x.row.kind,
          athleteName: x.row.kind === "prop" ? x.row.subject : undefined,
          team: x.row.kind === "prop" ? undefined : x.row.subject,
          market: x.row.kind === "prop" ? x.row.market : undefined,
          line: x.row.line,
          pick: x.row.selection === "Under" ? "under" : "over",
          odds: x.row.odds,
        };
  const ready = kept;
  const dirty = items?.some((x) => x.dirty) ?? false;

  function breakDown() {
    const legs = ready.map(asLeg).slice(0, 6);
    if (!legs.length) return;
    if (onBreakDown) onBreakDown(legs);
    else window.location.assign(checkHref(legs));
  }

  function track() {
    if (!kept.length) return;
    const slipId = crypto.randomUUID();
    const amount = Number(stake);
    kept.forEach((x0, i) => {
      // Pick'em slips have no whole-number pushes: a whole-number over saves as at least (N+) unless you picked plain Over.
      const pe = x0.row.kind === "prop" && x0.row.selection === "Over" && x0.row.plus === undefined && x0.row.line != null && x0.row.line > 0 && Number.isInteger(x0.row.line) && isPickem(book);
      const x = pe ? { ...x0, result: x0.result === "push" ? null : x0.result, row: { ...x0.row, plus: true, line: x0.row.line! - 0.5 }, leg: x0.leg ? { ...x0.leg, line: x0.row.line! - 0.5 } : x0.leg } : x0;
      const plus = x.row.plus ? { plus: true } : x.row.plus === false ? { plus: false } : {};
      const extra = { slipId, book: book || "Slip", stake: i === 0 && amount > 0 ? amount : 0, odds: x.row.odds };
      if (x.leg && x.game && !x.dirty) {
        // Tied to a game: the Log can follow it live when the stat is trackable. Finished games land graded.
        const p = pickFromLeg(x.row.kind === "prop" ? { ...x.leg, market: x.row.market } : x.leg, { home: x.game.home, away: x.game.away }, { ...extra, date: localDay(x.game.start) });
        addPick({ ...p, ...plus, status: x.result ?? "open", link: link.trim() || undefined });
        return;
      }
      // Not tied to a game: saved as read, so you can fix it in the Log.
      addPick({
        id: crypto.randomUUID(),
        slipId,
        sport: sportOf(x.game?.league ?? x.row.league ?? (x.row.sport === "tennis" ? "atp" : x.row.sport === "mma" ? "ufc" : "")),
        subject: x.row.subject,
        line: x.row.line ?? 0,
        odds: x.row.odds ?? 0,
        stake: extra.stake,
        book: extra.book,
        date: new Date().toISOString().slice(0, 10),
        status: "open",
        createdAt: new Date().toISOString(),
        market: x.row.kind === "prop" ? x.row.market : `${KIND_LABEL[x.row.kind]}${x.row.opponent ? ` vs ${x.row.opponent.replace(/^(vs\.?|@)\s*/i, "")}` : ""}`,
        selection: x.row.selection,
        ...plus,
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
              <li key={i} className={"rounded-xl border p-2 " + (x.issue || !x.leg ? "border-[color:var(--gold)]/40 bg-[color:var(--gold)]/5" : "border-white/10")}>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <label className="flex items-center gap-1.5 text-zinc-400">
                    <input type="checkbox" checked={x.keep} onChange={(e) => setItems(items.map((y, j) => (j === i ? { ...y, keep: e.target.checked } : y)))} />
                    Keep
                  </label>
                  <select
                    className="field ml-auto shrink-0 font-bold text-[color:var(--plus)]"
                    style={{ width: "4.9rem", padding: "0.2rem 0.35rem", fontSize: "11px" }}
                    aria-label="League"
                    data-testid="leg-league"
                    value={x.row.leagueLocked ? (x.row.league ?? "") : (x.game?.league ?? x.row.league ?? "")}
                    onChange={(e) => setLeague(i, e.target.value)}
                  >
                    {x.game || x.row.league ? null : <option value="">League?</option>}
                    {LEAGUE_CHOICES.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <span className={"flex items-center gap-1.5 " + (x.game ? "font-bold text-[color:var(--plus)]" : "font-bold tone-gold")} data-testid="slip-match">
                    {x.game ? `${x.game.away} @ ${x.game.home} · ${x.game.state === "post" ? "Final" : x.game.state === "in" ? "Live" : ptTime(x.game.start)}` : "Manual leg"}
                    {x.result ? (
                      <span className="rounded px-1 text-[10px] font-black text-black" style={{ background: x.result === "win" ? "var(--gold)" : x.result === "loss" ? "var(--minus)" : "#a1a1aa" }} title="Graded from the final ESPN score or box">
                        {RESULT_LABEL[x.result]}
                      </span>
                    ) : x.game?.state === "pre" ? (
                      <span className="text-[10px] text-zinc-400">open</span>
                    ) : null}
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
                    <select className="field col-span-6" value={x.row.market} aria-label="Stat" onChange={(e) => edit(i, { market: e.target.value })}>
                      {(() => {
                        const choices = STAT_CHOICES[sportGroupOf(x.game?.league ?? x.leg?.league ?? "")] ?? STAT_CHOICES.football;
                        const all = [...new Set([...(x.row.market && !choices.includes(x.row.market) ? [x.row.market] : []), ...choices])];
                        return (
                          <>
                            <option value="">Pick the stat…</option>
                            {all.map((c) => (
                              <option key={c} value={c}>
                                {c === x.row.market && !choices.includes(c) ? `${c} (as printed)` : c}
                                {c === "fantasy score" ? ` · ${FANTASY_NOTE}` : ""}
                              </option>
                            ))}
                          </>
                        );
                      })()}
                    </select>
                  ) : null}
                  {x.row.kind === "prop" && x.row.market ? <StatTipLine market={x.row.market} /> : null}
                  {x.row.kind === "prop" || x.row.kind === "total" ? (
                    <select
                      className="field col-span-2 min-w-0"
                      value={x.row.plus ? "+" : x.row.selection ?? ""}
                      aria-label="Side"
                      data-testid="import-side"
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "+") edit(i, { selection: "Over", plus: true, line: x.row.line == null ? null : Number.isInteger(x.row.line) ? x.row.line - 0.5 : x.row.line });
                        else edit(i, { selection: v === "Over" || v === "Under" ? v : null, plus: false, line: x.row.plus && x.row.line != null ? x.row.line + 0.5 : x.row.line });
                      }}
                    >
                      <option value="">—</option>
                      <option value="Over">Over</option>
                      <option value="Under">Under</option>
                      {x.row.kind === "prop" ? <option value="+">At least (+)</option> : null}
                    </select>
                  ) : null}
                  {x.row.kind !== "moneyline" ? (
                    <input
                      className={"field min-w-0 " + (x.row.kind === "prop" || x.row.kind === "total" ? "col-span-2" : "col-span-3") + (!x.dirty && x.issue?.startsWith("Check this line") ? " ring-2 ring-[color:var(--minus)]" : "")}
                      value={x.row.plus && x.row.line != null ? x.row.line + 0.5 : x.row.line ?? ""}
                      placeholder={x.row.plus ? "At least" : "Line"}
                      inputMode="decimal"
                      aria-label="Line"
                      onChange={(e) => {
                        const n = e.target.value === "" || !Number.isFinite(Number(e.target.value)) ? null : Number(e.target.value);
                        edit(i, { line: n == null ? null : x.row.plus ? Math.ceil(n) - 0.5 : n });
                      }}
                    />
                  ) : null}
                  <input
                    className={"field min-w-0 " + (x.row.kind === "spread" ? "col-span-3" : x.row.kind === "moneyline" ? "col-span-6" : "col-span-2")}
                    value={x.row.odds ?? ""}
                    placeholder="Price"
                    aria-label="Price"
                    onChange={(e) => edit(i, { odds: e.target.value === "" || !Number.isFinite(Number(e.target.value)) ? null : Number(e.target.value) })}
                  />
                  {(x.row.kind === "moneyline" || x.row.kind === "spread") && (x.row.opponent != null || x.row.sport === "tennis" || x.row.sport === "mma") ? (
                    <input
                      className="field col-span-6 min-w-0 text-[13px]"
                      value={x.row.opponent ?? ""}
                      placeholder="Opponent"
                      aria-label="Opponent"
                      data-testid="import-opponent"
                      onChange={(e) => edit(i, { opponent: e.target.value || null })}
                    />
                  ) : null}
                </div>
                {!x.game || x.options?.length ? (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <select
                      className="field min-w-0 flex-1 text-[12px]"
                      aria-label="Match it to a game"
                      value={x.game ? `${x.game.league}/${x.game.id}` : ""}
                      onFocus={() => loadOptions(i)}
                      onPointerDown={() => loadOptions(i)}
                      onChange={(e) => matchTo(i, e.target.value)}
                      data-testid="match-it"
                    >
                      <option value="">{x.game ? "Not tied to a game" : "Match it: pick the game…"}</option>
                      {(x.options ?? []).map((o) => (
                        <option key={o.league + o.id} value={`${o.league}/${o.id}`}>
                          {optLabel(o)}
                        </option>
                      ))}
                    </select>
                    {x.game && x.leg && (x.row.kind === "spread" || x.row.kind === "moneyline") ? (
                      <select className="field w-20 text-[12px]" aria-label="Side" value={x.leg.side ?? "home"} onChange={(e) => matchTo(i, `${x.game!.league}/${x.game!.id}`, e.target.value as "home" | "away")}>
                        <option value="away">{x.game.away}</option>
                        <option value="home">{x.game.home}</option>
                      </select>
                    ) : null}
                  </div>
                ) : null}
                {x.dirty ? (
                  <p className="mt-1 text-[11px] text-zinc-400">Edited. Tap Match again.</p>
                ) : x.issue ? (
                  <p className="mt-1 text-[11px] text-amber-200/90">ⓘ {x.issue}</p>
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
          <SlipCheck legs={kept.map(checkLegOf)} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={!ready.length} onClick={breakDown} className="rounded-xl bg-[color:var(--gold)] py-2.5 text-sm font-black text-black disabled:opacity-40">
              Break it down{ready.length ? ` (${Math.min(6, ready.length)})` : ""}
            </button>
            <button type="button" disabled={!kept.length || tracked} onClick={track} className="rounded-xl bg-[color:var(--plus)] py-2.5 text-sm font-black text-black disabled:opacity-40">
              {tracked ? "Tracked ✓" : "Track it"}
            </button>
          </div>
          <p className="text-[11px] text-zinc-500">Break it down works without saving. Track it is optional: it saves the slip to your Log.</p>
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
