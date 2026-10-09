"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import AddSlip from "@/components/AddSlip";
import CountUp from "@/components/CountUp";
import LogRow from "@/components/LogRow";
import { useLiveHub } from "@/components/LiveHub";
import { useLogLooks } from "@/components/useLogLeans";
import { checkHref, legFromLogged, type LegInput } from "@/lib/breakdown";
import { baseUnit, medianStake, money, pickKind, summarize, unitsText } from "@/lib/ledger";
import { getBaseUnit, getServerBaseUnit, setBaseUnit, subscribeBaseUnit } from "@/lib/unitStore";
import SharePanel from "@/components/SharePanel";
import LiveSlips from "@/components/LiveSlips";
import AlertSettings from "@/components/AlertSettings";
import { validOdds } from "@/lib/odds";
import { addPick, getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { UNIT_NOTE } from "@/lib/units";
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

  const setUnit = useSyncExternalStore(subscribeBaseUnit, getBaseUnit, getServerBaseUnit);
  const unit = baseUnit(picks, setUnit);
  const sum = summarize(picks, unit);
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
      if (p.status !== "open" || !p.slipId) continue;
      const l = legFromLogged(p);
      if (l) m.set(p.slipId, [...(m.get(p.slipId) ?? []), l]);
    }
    return [...m.entries()].filter(([, ls]) => ls.length > 1);
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
      <Summary sum={sum} picksCount={picks.filter((p) => p.stake > 0).length} setUnit={setUnit} median={medianStake(picks)} />
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
          <div className="mt-3 flex flex-wrap gap-2">
            {slipChecks.map(([id, ls]) => (
              <Link key={id} href={checkHref(ls)} className="rounded-lg border border-purple-400/50 px-2.5 py-1 text-[11px] font-bold text-purple-100 hover:bg-purple-500/20">
                Break down {ls.length}-leg slip →
              </Link>
            ))}
          </div>
        ) : null}
        {shown.length ? (
          <ul className="mt-3 space-y-1.5">
            {shown.map((p) => (
              <LogRow key={p.id} pick={p} leg={legOf.get(p.id) ?? null} live={isLive(p)} look={looks[p.id] ?? null} unit={unit} />
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

/** Your own numbers. Private to this device; never on the leaderboard. */
function Summary({ sum, picksCount, setUnit, median }: { sum: ReturnType<typeof summarize>; picksCount: number; setUnit: number | null; median: number | null }) {
  const [editing, setEditing] = useState(false);
  const hit = sum.hitRate;
  return (
    <section aria-label="Your record" className="foil-tile mb-5 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-purple-200/80">Your record</h2>
        <span className="text-[10px] text-zinc-500">Private · this device only</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="tabular text-3xl font-black text-[color:var(--flat)]">
            <span className="text-[color:var(--gold)]">{sum.won}</span>-<span className="text-[color:var(--minus)]">{sum.lost}</span>
            {sum.push ? <span className="text-[color:var(--push)]">-{sum.push}</span> : null}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            Won-lost{sum.push ? "-push" : ""} · {sum.open} open
          </div>
        </div>
        <div className="text-right">
          {hit !== null ? (
            <CountUp value={Math.round(hit * 1000) / 10} kind="pct" className={`big-num block text-3xl font-black ${hit >= 0.5 ? "text-[color:var(--plus)]" : "text-[color:var(--minus)]"}`} />
          ) : (
            <span className="block text-3xl font-black text-zinc-600">—</span>
          )}
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Hit rate</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Box label="Net" tone={sum.net > 0 ? "plus" : sum.net < 0 ? "minus" : "flat"} value={money(sum.net)} />
        <Box label="Units" tone={(sum.netUnits ?? 0) > 0 ? "plus" : (sum.netUnits ?? 0) < 0 ? "minus" : "flat"} value={unitsText(sum.netUnits, true)} />
        <Box label="Avg size" tone="flat" value={unitsText(sum.avgUnits)} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/5 pt-2 text-[12px]">
        {editing ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = Number(new FormData(e.currentTarget).get("unit"));
              setBaseUnit(Number.isFinite(v) && v > 0 ? v : null);
              setEditing(false);
            }}
          >
            <label className="text-zinc-400" htmlFor="base-unit">
              1 unit =
            </label>
            <input id="base-unit" name="unit" className="field w-24" inputMode="decimal" defaultValue={setUnit ?? median ?? ""} autoFocus />
            <button type="submit" className="rounded-lg border border-purple-400/60 px-2 py-1 text-[11px] font-bold text-white">
              Save
            </button>
            {setUnit !== null ? (
              <button type="button" className="text-[11px] text-zinc-500" onClick={() => (setBaseUnit(null), setEditing(false))}>
                Use median
              </button>
            ) : null}
          </form>
        ) : (
          <>
            <span className="text-zinc-400">
              1 unit = <b className="tabular text-[color:var(--gold)]">{sum.unit ?? "—"}</b>{" "}
              <span className="text-zinc-500">
                {setUnit !== null ? "(set by you)" : sum.unit !== null ? `(median of ${picksCount} stakes)` : "(log a stake or set one)"}
              </span>
            </span>
            <button type="button" className="text-[11px] font-bold text-purple-200/90" onClick={() => setEditing(true)}>
              Set unit
            </button>
          </>
        )}
      </div>
      <p className="mt-1 text-[10px] text-zinc-500">Suggested sizes on open picks: {UNIT_NOTE}</p>
    </section>
  );
}

function Box({ label, value, tone }: { label: string; value: string; tone: "plus" | "minus" | "flat" }) {
  const c = tone === "plus" ? "var(--plus)" : tone === "minus" ? "var(--minus)" : "var(--flat)";
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
