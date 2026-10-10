"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import AddSlip from "@/components/AddSlip";
import LogRow from "@/components/LogRow";
import { useLiveHub } from "@/components/LiveHub";
import { useLogLooks } from "@/components/useLogLeans";
import { checkHref, legFromLogged, type LegInput } from "@/lib/breakdown";
import SlipSummary from "@/components/SlipSummary";
import { pickKind, summarize } from "@/lib/ledger";
import SharePanel from "@/components/SharePanel";
import LiveSlips from "@/components/LiveSlips";
import AlertSettings from "@/components/AlertSettings";
import { validOdds } from "@/lib/odds";
import { addPick, getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { SPORT_LABEL, SPORT_ORDER, type Pick, type PickStatus, type Sport } from "@/lib/types";

type Filter = "all" | "live" | "pending" | "won" | "lost";
type KindFilter = "all" | "prop" | "team";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "pending", label: "Pending" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

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

  const sum = summarize(picks);
  const { legs: liveLegs, snaps } = useLiveHub();
  const looks = useLogLooks(picks);
  const [filter, setFilter] = useState<Filter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");

  const legOf = useMemo(() => new Map(liveLegs.map((l) => [l.pickId, l])), [liveLegs]);
  const isLive = (p: Pick) => p.status === "open" && !!p.league && !!p.gameId && snaps[`${p.league}/${p.gameId}`]?.state === "in";
  const shown = picks.filter((p) => {
    if (kindFilter !== "all" && pickKind(p) !== kindFilter) return false;
    if (filter === "live") return isLive(p);
    if (filter === "pending") return p.status === "open" && !isLive(p);
    if (filter === "won") return p.status === "win";
    if (filter === "lost") return p.status === "loss";
    return true;
  });
  // Open first, newest first inside each.
  shown.sort((a, b) => Number(b.status === "open") - Number(a.status === "open") || (b.createdAt > a.createdAt ? 1 : -1));

  // Open slips with 2+ legs tied to games: one tap to break down the whole slip.
  const slipChecks = useMemo(() => {
    const m = new Map<string, LegInput[]>();
    for (const p of picks) {
      if (!p.slipId) continue;
      const l = legFromLogged(p);
      if (l) m.set(p.slipId, [...(m.get(p.slipId) ?? []), l]);
    }
    return [...m.entries()];
  }, [picks]);

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
    if (!book) return setError("Which book holds it?");
    if (!date) return setError("Add the date.");
    addPick({
      id: crypto.randomUUID(),
      sport,
      subject,
      line,
      odds: Math.round(odds),
      stake: Number.isFinite(stake) && stake > 0 ? stake : 0,
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
      <Summary sum={sum} />
      <LiveSlips />
      <AlertSettings />
      <div className="mt-4 flex flex-wrap items-center gap-3">
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
          <Field label="Stake (optional, this device only)">
            <input name="stake" className="field" inputMode="decimal" type="number" step="0.01" min="0" placeholder="Optional" />
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

      <section className="mt-6" aria-label="Your picks">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="group" aria-label="Status filter">
          {FILTERS.map((f) => (
            <Chip key={f.id} on={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </Chip>
          ))}
        </div>
        <div className="mt-1 flex gap-1" role="group" aria-label="Type filter">
          {(["all", "prop", "team"] as KindFilter[]).map((k) => (
            <Chip key={k} on={kindFilter === k} onClick={() => setKindFilter(k)} small>
              {k === "all" ? "Props + Teams" : k === "prop" ? "Props" : "Teams"}
            </Chip>
          ))}
        </div>
        {slipChecks.length ? (
          <div className="mt-3 space-y-2">
            {slipChecks.slice(0, 8).map(([id, ls], i) => (
              <SlipSummary key={id} legs={ls} href={checkHref(ls)} auto={i < 4} />
            ))}
          </div>
        ) : null}
        {shown.length ? (
          <ul className="mt-3 space-y-1.5">
            {shown.map((p) => (
              <LogRow key={p.id} pick={p} leg={legOf.get(p.id) ?? null} live={isLive(p)} look={looks[p.id] ?? null} />
            ))}
          </ul>
        ) : (
          <p className="panel mt-3 rounded-xl px-4 py-5 text-sm text-zinc-400">
            {picks.length ? "Nothing in this filter." : "No picks logged yet."}
          </p>
        )}
      </section>
    </div>
  );
}

function Chip({ on, onClick, small, children }: { on: boolean; onClick: () => void; small?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`shrink-0 rounded-full border font-bold ${small ? "px-2.5 py-0.5 text-[10px]" : "px-3 py-1 text-[12px]"} ${
        on ? "border-[color:var(--plus)] bg-[color:var(--plus)]/15 text-white" : "border-zinc-700/70 text-zinc-400"
      }`}
    >
      {children}
    </button>
  );
}

/** Your tally: wins, losses, pushes, open. Private to this device; never on the leaderboard. */
function Summary({ sum }: { sum: ReturnType<typeof summarize> }) {
  return (
    <section aria-label="Your record" className="foil-tile mb-5 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-purple-200/80">Your tally</h2>
        <span className="text-[10px] text-zinc-500">Private · this device only</span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <Box label="Wins" tone="gold" value={String(sum.won)} />
        <Box label="Losses" tone="minus" value={String(sum.lost)} />
        <Box label="Pushes" tone="flat" value={String(sum.push)} />
        <Box label="Open" tone="flat" value={String(sum.open)} />
      </div>
    </section>
  );
}

function Box({ label, value, tone }: { label: string; value: string; tone: "gold" | "minus" | "flat" }) {
  const c = tone === "gold" ? "var(--gold)" : tone === "minus" ? "var(--minus)" : "var(--flat)";
  return (
    <div className="rounded-xl border border-purple-500/20 bg-black/30 px-2 py-1.5">
      <div className="tabular text-lg font-black" style={{ color: c }}>
        {value}
      </div>
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</div>
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
