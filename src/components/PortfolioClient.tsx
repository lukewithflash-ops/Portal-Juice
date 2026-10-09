"use client";

import { useState, useSyncExternalStore } from "react";
import AddSlip from "@/components/AddSlip";
import CountUp from "@/components/CountUp";
import PickTile from "@/components/PickTile";
import SharePanel from "@/components/SharePanel";
import { validOdds } from "@/lib/odds";
import { addPick, getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { UNIT_NOTE, unitHint } from "@/lib/units";
import { SPORT_LABEL, SPORT_ORDER, type PickStatus, type Sport } from "@/lib/types";

const BOOKS = ["DraftKings", "FanDuel", "BetMGM", "Caesars", "ESPN BET", "BetRivers", "Fanatics", "Hard Rock"];

function todayLocal() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function PortfolioClient() {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = picks.filter((p) => p.status === "open");
  const settled = picks.filter((p) => p.status !== "open");
  const units = unitHint(picks);
  const count = (s: PickStatus) => picks.filter((p) => p.status === s).length;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const subject = String(f.get("subject") ?? "").trim();
    const line = Number(f.get("line"));
    const odds = Number(f.get("odds"));
    const stake = Number(f.get("stake"));
    const book = String(f.get("book") ?? "").trim();
    const date = String(f.get("date") ?? "");
    const sport = String(f.get("sport")) as Sport;
    const status = String(f.get("status")) as PickStatus;
    if (!subject) return setError("Add the player or side.");
    if (!Number.isFinite(line)) return setError("Line must be a number.");
    if (!validOdds(odds)) return setError("Odds are American: -110, +150…");
    if (!Number.isFinite(stake) || stake <= 0) return setError("Stake must be above 0.");
    if (!book) return setError("Which book holds it?");
    if (!date) return setError("Add the date.");
    addPick({
      id: crypto.randomUUID(),
      sport,
      subject,
      line,
      odds: Math.round(odds),
      stake,
      book,
      date,
      status,
      createdAt: new Date().toISOString(),
    });
    setError(null);
    e.currentTarget.reset();
    setFormOpen(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          aria-expanded={formOpen}
          className="rounded-xl border border-purple-400/60 bg-purple-500/20 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500/30"
        >
          Log a pick.
        </button>
        <p className="text-xs text-zinc-500">For picks you already made at a book. Saved on this device only.</p>
      </div>
      <AddSlip />

      <section aria-label="Suggested unit" className="panel mt-4 rounded-2xl p-4">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-purple-200/80">Suggested unit</h2>
        {units ? (
          <>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="tabular text-2xl font-black text-[color:var(--gold)]">{units.unit}</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">1 unit</div>
              </div>
              <div>
                <div className="tabular text-2xl font-black text-[color:var(--flat)]">{units.totalUnits}u</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Total logged</div>
              </div>
              <div>
                <div className="tabular text-2xl font-black text-[color:var(--flat)]">{units.openUnits}u</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Open now</div>
              </div>
            </div>
            <p className="mt-2 text-[12px] leading-snug text-zinc-400">
              1 unit = the median stake across your {units.count} logged {units.count === 1 ? "slip" : "slips"}. Total logged{" "}
              {units.total} = {units.totalUnits} units.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-zinc-400">No stakes logged yet. Log a pick with a stake and your unit shows here.</p>
        )}
        <p className="mt-2 text-[11px] text-zinc-500">{UNIT_NOTE}</p>
      </section>

      {formOpen && (
        <form onSubmit={onSubmit} className="panel mt-4 grid gap-3 rounded-2xl p-4 sm:grid-cols-2 lg:grid-cols-4" noValidate>
          <Field label="Sport">
            <select name="sport" className="field" defaultValue="NFL">
              {SPORT_ORDER.map((s) => (
                <option key={s} value={s}>
                  {SPORT_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Player or side" wide>
            <input name="subject" className="field" placeholder="e.g. CeeDee Lamb rec yds over" autoComplete="off" />
          </Field>
          <Field label="Line">
            <input name="line" className="field" inputMode="decimal" type="number" step="0.5" placeholder="83.5" />
          </Field>
          <Field label="Odds">
            <input name="odds" className="field" inputMode="numeric" type="number" step="1" placeholder="-110" />
          </Field>
          <Field label="Stake">
            <input name="stake" className="field" inputMode="decimal" type="number" step="0.01" min="0" placeholder="25" />
          </Field>
          <Field label="Book">
            <input name="book" className="field" list="books" placeholder="DraftKings" autoComplete="off" />
            <datalist id="books">
              {BOOKS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field label="Date">
            <input name="date" className="field" type="date" defaultValue={todayLocal()} />
          </Field>
          <Field label="Status">
            <select name="status" className="field" defaultValue="open">
              <option value="open">Open</option>
              <option value="win">Win</option>
              <option value="loss">Loss</option>
              <option value="push">Push</option>
            </select>
          </Field>
          <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              className="rounded-xl border border-purple-400/60 bg-purple-500/25 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500/35"
            >
              Log a pick.
            </button>
            {error && <p className="text-sm text-[color:var(--minus)]">{error}</p>}
          </div>
        </form>
      )}

      <SharePanel picks={picks} />

      <Group title="Open" empty="No open picks.">
        {open.map((p) => (
          <PickTile key={p.id} pick={p} />
        ))}
      </Group>
      <Group title="Settled" empty="No settled picks.">
        {settled.map((p) => (
          <PickTile key={p.id} pick={p} />
        ))}
      </Group>

      {/* Tally — counts only, sticky to the bottom of the screen. */}
      <section aria-label="Tally" className="tally-bar sticky bottom-0 z-30 -mx-4 mt-10 rounded-t-2xl">
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
          <h2 className="mr-auto text-[10px] font-bold uppercase tracking-[0.22em] text-purple-200/80">Tally</h2>
          <Stat label="Open" value={count("open")} tone="open" />
          <Stat label="Wins" value={count("win")} tone="win" />
          <Stat label="Losses" value={count("loss")} tone="loss" />
          <Stat label="Pushes" value={count("push")} tone="push" />
        </div>
      </section>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2 lg:col-span-1" : ""}`}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function Group({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="mt-8" aria-label={title}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-purple-200/80">{title}</h2>
        {children.length > 0 && <span className="tabular text-[11px] text-zinc-500">{children.length}</span>}
      </div>
      {children.length === 0 ? (
        <p className="panel rounded-xl px-4 py-5 text-sm text-zinc-400">{empty}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      )}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: PickStatus }) {
  const color =
    tone === "win"
      ? "text-[color:var(--plus)]"
      : tone === "loss"
        ? "text-[color:var(--minus)]"
        : tone === "push"
          ? "text-[color:var(--push)]"
          : "text-[color:var(--flat)]";
  return (
    <div className="min-w-[4.25rem] rounded-xl border border-purple-500/20 bg-black/30 px-3 py-1.5 text-center">
      <CountUp value={value} kind="int" className={`big-num block text-2xl font-black ${color}`} />
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</div>
    </div>
  );
}
