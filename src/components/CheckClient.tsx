"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  LEAN_NOTE,
  STAT_OPTIONS,
  leanFill,
  legLabel,
  legsFromParam,
  statFromMarket,
  type LegInput,
  type LegKind,
  type LegReport,
  type ParlayReport,
} from "@/lib/breakdown";
import { americanNumber } from "@/lib/detail";
import { ptTime } from "@/lib/time";
import Mark from "@/components/Mark";
import SlipImport from "@/components/SlipImport";

type GameOpt = {
  id: string;
  league: string;
  leagueLabel: string;
  start: string;
  state: "pre" | "in" | "post";
  detail: string;
  day: string;
  away: { abbr: string; name: string; logo: string | null };
  home: { abbr: string; name: string; logo: string | null };
  price: {
    total: number | null;
    spreadHome: number | null;
    homeMl: string | null;
    awayMl: string | null;
    overJuice: string | null;
    underJuice: string | null;
    homeSpreadJuice: string | null;
    awaySpreadJuice: string | null;
  } | null;
};

type Roster = {
  players: { id: string; name: string; team: string; pos: string | null }[];
  props: { athleteId: string; name: string; team: string; market: string; line: string; openLine: string | null }[];
};

type Result = { reports: (LegReport | { error: string })[]; parlay: ParlayReport | null; fetchedAt: string };

const KINDS: { id: LegKind; label: string }[] = [
  { id: "spread", label: "Spread" },
  { id: "total", label: "Total" },
  { id: "moneyline", label: "Moneyline" },
  { id: "prop", label: "Player prop" },
];
const STORE = "pj-check-v1";
const PROP_LEAGUES = new Set(Object.keys(STAT_OPTIONS));

const firstNum = (s: string | null | undefined) => {
  const m = /-?\d+(?:\.\d+)?/.exec(s ?? "");
  return m ? Number(m[0]) : null;
};

export default function CheckClient() {
  const params = useSearchParams();
  const [games, setGames] = useState<GameOpt[] | null>(null);
  // Legs: link first, then this device. This component renders in the browser only (search params).
  const [legs, setLegs] = useState<LegInput[]>(() => {
    const fromLink = legsFromParam(params.get("l"));
    if (fromLink.length || typeof window === "undefined") return fromLink;
    try {
      return legsFromParam(localStorage.getItem(STORE));
    } catch {
      return [];
    }
  });
  const [gameKey, setGameKey] = useState("");
  const [kind, setKind] = useState<LegKind>("spread");
  const [side, setSide] = useState<"home" | "away">("home");
  const [pick, setPick] = useState<"over" | "under">("over");
  const [line, setLine] = useState("");
  const [odds, setOdds] = useState("");
  const [rosters, setRosters] = useState<Record<string, Roster>>({});
  const [athlete, setAthlete] = useState("");
  const [stat, setStat] = useState("");
  const [openLine, setOpenLine] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoRan = useRef(false);
  const [importOpen, setImportOpen] = useState(() => params.get("import") === "1");

  useEffect(() => {
    fetch("/api/check/games")
      .then((r) => r.json())
      .then((d: { games: GameOpt[] }) => {
        setGames(d.games ?? []);
        const want = new URLSearchParams(window.location.search).get("g");
        if (want && (d.games ?? []).some((g) => `${g.league}/${g.id}` === want)) setGameKey(want);
      })
      .catch(() => setGames([]));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(legs));
    } catch {
      /* ignore */
    }
  }, [legs]);

  const game = useMemo(() => games?.find((g) => `${g.league}/${g.id}` === gameKey) ?? null, [games, gameKey]);
  const gameOf = useCallback((l: LegInput) => games?.find((g) => g.league === l.league && g.id === l.gameId) ?? null, [games]);

  // Prefill line and price from the posted numbers when the leg type changes.
  function prefill(g: GameOpt | null, kind: LegKind, side: "home" | "away", pick: "over" | "under") {
    if (!g) return;
    const p = g.price;
    setOdds("");
    if (kind === "spread") {
      const s = p?.spreadHome;
      setLine(s != null ? String(side === "home" ? s : -s) : "");
      const j = side === "home" ? p?.homeSpreadJuice : p?.awaySpreadJuice;
      const n = americanNumber(j ?? null);
      setOdds(n != null ? String(n) : "");
    } else if (kind === "total") {
      setLine(p?.total != null ? String(p.total) : "");
      const n = americanNumber((pick === "over" ? p?.overJuice : p?.underJuice) ?? null);
      setOdds(n != null ? String(n) : "");
    } else if (kind === "moneyline") {
      setLine("");
      const n = americanNumber((side === "home" ? p?.homeMl : p?.awayMl) ?? null);
      setOdds(n != null ? String(n) : "");
    }
  }

  const rosterKey = game && kind === "prop" ? `${game.league}/${game.id}` : null;
  useEffect(() => {
    if (!rosterKey || rosters[rosterKey]) return;
    let dead = false;
    const [lg, id] = rosterKey.split("/");
    fetch(`/api/check/players?league=${lg}&id=${id}`)
      .then((r) => r.json())
      .then((d: Roster) => !dead && setRosters((m) => ({ ...m, [rosterKey]: { players: d.players ?? [], props: d.props ?? [] } })))
      .catch(() => !dead && setRosters((m) => ({ ...m, [rosterKey]: { players: [], props: [] } })));
    return () => {
      dead = true;
    };
  }, [rosterKey, rosters]);
  const roster = rosterKey ? rosters[rosterKey] ?? null : null;

  function chooseGame(key: string) {
    setGameKey(key);
    setAthlete("");
    const g = games?.find((x) => `${x.league}/${x.id}` === key) ?? null;
    const k = g && kind === "prop" && !PROP_LEAGUES.has(g.league) ? "spread" : kind;
    setKind(k);
    prefill(g, k, side, pick);
  }
  function chooseKind(k: LegKind) {
    setKind(k);
    prefill(game, k, side, pick);
  }
  function chooseSide(v: "home" | "away") {
    setSide(v);
    prefill(game, kind, v, pick);
  }
  function choosePick(v: "over" | "under") {
    setPick(v);
    if (kind !== "prop") prefill(game, kind, side, v);
  }

  const postedProps = useMemo(
    () => (roster && game ? roster.props.filter((p) => statFromMarket(game.league, p.market)) : []),
    [roster, game]
  );

  function choosePosted(i: string) {
    if (!game) return;
    const p = postedProps[Number(i)];
    if (!p) return;
    setAthlete(p.athleteId);
    setStat(statFromMarket(game.league, p.market) ?? "");
    const n = firstNum(p.line);
    setLine(n != null ? String(n) : "");
    setPick(/^u/i.test(p.line) ? "under" : "over");
    setOpenLine(firstNum(p.openLine));
  }

  function addLeg() {
    setError(null);
    if (!game) return setError("Pick a game first.");
    const n = line.trim() === "" ? null : Number(line);
    const o = odds.trim() === "" ? null : Number(odds);
    if (n !== null && !Number.isFinite(n)) return setError("Line must be a number.");
    if (o !== null && (!Number.isFinite(o) || (o > -100 && o < 100))) return setError("Odds are American: -110, +150…");
    const leg: LegInput = { league: game.league, gameId: game.id, kind, odds: o };
    if (kind === "spread" || kind === "moneyline") leg.side = side;
    if (kind === "spread") leg.line = n;
    if (kind === "total") {
      leg.pick = pick;
      leg.line = n;
    }
    if (kind === "prop") {
      const who = roster?.players.find((p) => p.id === athlete) ?? roster?.props.find((p) => p.athleteId === athlete);
      if (!athlete || !who) return setError("Pick a player.");
      if (!stat) return setError("Pick a stat.");
      if (n === null) return setError("Add the line.");
      Object.assign(leg, { athleteId: athlete, athleteName: who.name, stat, line: n, pick, openLine });
    }
    if (legs.length >= 6) return setError("Six legs max.");
    setLegs((ls) => [...ls, leg]);
    setResult(null);
  }

  const analyze = useCallback(
    async (list: LegInput[]) => {
      if (!list.length) return;
      setBusy(true);
      setError(null);
      try {
        const r = await fetch("/api/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ legs: list }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not check that.");
        setResult(d as Result);
        requestAnimationFrame(() => document.getElementById("check-results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not check that.");
      } finally {
        setBusy(false);
      }
    },
    []
  );

  // A link with legs runs right away.
  useEffect(() => {
    if (autoRan.current || !params.get("l") || !legs.length) return;
    autoRan.current = true;
    void analyze(legs);
  }, [legs, params, analyze]);

  const byDay = useMemo(() => {
    const m = new Map<string, GameOpt[]>();
    for (const g of games ?? []) {
      if (g.state === "post") continue;
      m.set(g.day, [...(m.get(g.day) ?? []), g]);
    }
    return [...m.entries()];
  }, [games]);

  const teamsOf = (l: LegInput) => {
    const g = gameOf(l);
    return g ? { home: g.home.abbr, away: g.away.abbr } : undefined;
  };

  return (
    <div className="space-y-5">
      <section className="foil-tile p-4" aria-label="Import a slip">
        <button type="button" className="flex w-full items-center justify-between text-left" aria-expanded={importOpen} onClick={() => setImportOpen((v) => !v)}>
          <span className="text-sm font-black text-white">📷 Import your slip</span>
          <span className="text-xs text-zinc-400">{importOpen ? "Hide" : "Photo, link, or text"}</span>
        </button>
        {importOpen ? (
          <div className="mt-3">
            <SlipImport
              compact
              onBreakDown={(ls) => {
                setLegs(ls);
                setResult(null);
                void analyze(ls);
              }}
            />
          </div>
        ) : null}
      </section>
      <section className="foil-tile space-y-3 p-4" aria-label="Build a leg">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Game</span>
          <select className="field w-full" value={gameKey} onChange={(e) => chooseGame(e.target.value)} aria-label="Game">
            <option value="">{games === null ? "Loading the slate…" : byDay.length ? "Pick a game" : "No games on the slate"}</option>
            {byDay.map(([day, gs]) => (
              <optgroup key={day} label={day}>
                {gs.map((g) => (
                  <option key={`${g.league}/${g.id}`} value={`${g.league}/${g.id}`}>
                    {g.leagueLabel} · {g.away.abbr} @ {g.home.abbr} · {g.state === "in" ? "Live" : ptTime(g.start)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-4 gap-1" role="group" aria-label="Leg type">
          {KINDS.map((k) => {
            const off = k.id === "prop" && game !== null && !PROP_LEAGUES.has(game.league);
            return (
              <button
                key={k.id}
                type="button"
                disabled={off}
                onClick={() => chooseKind(k.id)}
                aria-pressed={kind === k.id}
                className={`rounded-lg border px-1 py-2 text-[11px] font-bold ${
                  kind === k.id ? "border-[color:var(--plus)] bg-[color:var(--plus)]/15 text-white" : "border-zinc-700/70 text-zinc-400"
                } disabled:opacity-30`}
              >
                {k.label}
              </button>
            );
          })}
        </div>

        {game && (kind === "spread" || kind === "moneyline") ? (
          <Seg
            value={side}
            onChange={(v) => chooseSide(v as "home" | "away")}
            options={[
              { id: "away", label: game.away.abbr },
              { id: "home", label: game.home.abbr },
            ]}
          />
        ) : null}

        {kind === "prop" && game ? (
          <div className="space-y-2">
            {postedProps.length ? (
              <select className="field w-full" defaultValue="" onChange={(e) => choosePosted(e.target.value)} aria-label="Posted prop">
                <option value="">Posted props ({postedProps.length})</option>
                {postedProps.map((p, i) => (
                  <option key={`${p.athleteId}-${p.market}`} value={i}>
                    {p.name} · {p.market} {p.line}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <select className="field" value={athlete} onChange={(e) => setAthlete(e.target.value)} aria-label="Player">
                <option value="">{roster ? "Player" : "Loading players…"}</option>
                {[game.away.abbr, game.home.abbr].map((t) => (
                  <optgroup key={t} label={t}>
                    {(roster?.players ?? [])
                      .filter((p) => p.team === t)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.pos ? ` · ${p.pos}` : ""}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <select className="field" value={stat} onChange={(e) => setStat(e.target.value)} aria-label="Stat">
                <option value="">Stat</option>
                {(STAT_OPTIONS[game.league] ?? []).map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {kind === "total" || kind === "prop" ? (
          <Seg
            value={pick}
            onChange={(v) => choosePick(v as "over" | "under")}
            options={[
              { id: "over", label: "Over" },
              { id: "under", label: "Under" },
            ]}
          />
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          {kind !== "moneyline" ? (
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Line</span>
              <input className="field w-full" inputMode="decimal" value={line} onChange={(e) => setLine(e.target.value)} placeholder={kind === "spread" ? "-3.5" : "24.5"} />
            </label>
          ) : (
            <span />
          )}
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Odds (optional)</span>
            <input className="field w-full" inputMode="numeric" value={odds} onChange={(e) => setOdds(e.target.value)} placeholder="-110" />
          </label>
        </div>

        <button
          type="button"
          onClick={addLeg}
          className="w-full rounded-xl border border-purple-400/60 bg-purple-500/20 px-4 py-2.5 text-sm font-bold text-white hover:bg-purple-500/30"
        >
          Add leg
        </button>
      </section>

      {legs.length ? (
        <section aria-label="Legs" className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-purple-200/80">{legs.length > 1 ? `Parlay · ${legs.length} legs` : "Leg"}</h2>
            <button type="button" className="text-[11px] text-zinc-500 hover:text-zinc-300" onClick={() => (setLegs([]), setResult(null))}>
              Clear
            </button>
          </div>
          <ul className="space-y-1.5">
            {legs.map((l, i) => {
              const g = gameOf(l);
              return (
                <li key={i} className="panel flex items-center gap-2 rounded-xl px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-[color:var(--flat)]">{legLabel(l, teamsOf(l))}</div>
                    <div className="truncate text-[11px] text-zinc-500">
                      {g ? `${g.leagueLabel} · ${g.away.abbr} @ ${g.home.abbr}` : l.league.toUpperCase()}
                      {l.odds != null ? ` · ${l.odds > 0 ? "+" : ""}${l.odds}` : ""}
                    </div>
                  </div>
                  {l.kind !== "moneyline" ? (
                    <input
                      key={`${i}-${l.line ?? ""}`}
                      className="field flex-none text-center"
                      style={{ width: 76 }}
                      inputMode="decimal"
                      placeholder="Line"
                      aria-label="Line"
                      defaultValue={l.line ?? ""}
                      onBlur={(e) => {
                        const t = e.target.value.trim();
                        const v = t === "" ? null : Number(t);
                        if (v !== l.line && (v === null || Number.isFinite(v))) {
                          setLegs((ls) => ls.map((x, j) => (j === i ? { ...x, line: v } : x)));
                          setResult(null);
                        }
                      }}
                    />
                  ) : null}
                  <button
                    type="button"
                    aria-label="Remove leg"
                    className="px-2 text-zinc-500 hover:text-white"
                    onClick={() => (setLegs((ls) => ls.filter((_, j) => j !== i)), setResult(null))}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => analyze(legs)}
            disabled={busy}
            className="w-full rounded-xl bg-[color:var(--plus)] px-4 py-3 text-sm font-black text-black disabled:opacity-60"
          >
            {busy ? "Pulling the numbers…" : legs.length > 1 ? "Break down the parlay" : "Break it down"}
          </button>
        </section>
      ) : null}

      {error ? <p className="text-sm text-[color:var(--minus)]">{error}</p> : null}

      {result ? (
        <section id="check-results" className="scroll-mt-28 space-y-3" aria-label="Breakdown">
          {result.parlay && result.parlay.legs > 1 ? <ParlayPanel p={result.parlay} reports={result.reports} /> : null}
          {result.reports.map((r, i) =>
            "error" in r ? (
              <p key={i} className="panel rounded-xl px-4 py-3 text-sm text-zinc-400">
                Leg {i + 1}: {r.error}
              </p>
            ) : (
              <LegPanel
                key={i}
                r={r}
                flag={result.parlay?.weakest === i ? "weakest" : result.parlay?.strongest === i ? "strongest" : null}
              />
            )
          )}
          <p className="text-[11px] text-zinc-500">Numbers pulled {ptTime(result.fetchedAt)} from ESPN.</p>
        </section>
      ) : null}
    </div>
  );
}

function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { id: string; label: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-1" role="group">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`rounded-lg border px-2 py-2 text-sm font-bold ${
            value === o.id ? "border-purple-400 bg-purple-500/25 text-white" : "border-zinc-700/70 text-zinc-400"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const LEAN_WORD: Record<LegReport["lean"], string> = {
  strong: "Strongest lean",
  good: "Leans good",
  neutral: "Even",
  bad: "Leans bad",
  none: "Not enough data",
};

function leanColor(lean: LegReport["lean"]) {
  return lean === "strong" ? "var(--gold)" : lean === "good" ? "var(--plus)" : lean === "bad" ? "var(--minus)" : "var(--push)";
}

export function LeanMeter({ r }: { r: LegReport }) {
  const c = leanColor(r.lean);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: c }}>
          {LEAN_WORD[r.lean]}
        </span>
        {r.lean !== "none" ? (
          <span className="tabular text-[11px] text-zinc-500">
            {r.pros.length} pro{r.pros.length === 1 ? "" : "s"} · {r.cons.length} con{r.cons.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-zinc-800" role="meter" aria-valuemin={-5} aria-valuemax={5} aria-valuenow={r.score} aria-label="Lean">
        <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-600" />
        {r.lean !== "none" ? (
          <div className="h-full rounded-full transition-all" style={{ width: `${leanFill(r.score)}%`, background: c, boxShadow: `0 0 10px ${c}` }} />
        ) : null}
      </div>
      <p className="mt-1 text-[10px] text-zinc-500">{LEAN_NOTE}</p>
    </div>
  );
}

function LegPanel({ r, flag }: { r: LegReport; flag: "weakest" | "strongest" | null }) {
  const [open, setOpen] = useState(false);
  const edge = flag === "strongest" ? "gold-edge" : "";
  return (
    <article className={`rounded-2xl ${edge}`} style={flag === "weakest" ? { boxShadow: "0 0 0 1.5px var(--minus)" } : undefined}>
      <div className="foil-tile space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          {r.mark ? <Mark team={r.mark.abbr} headshotUrl={r.mark.img} label={r.title} size={40} contain={r.mark.logo} /> : null}
          <div className="min-w-0 flex-1">
            {flag ? (
              <span className={`block text-[10px] font-black uppercase tracking-[0.2em] ${flag === "strongest" ? "tone-gold" : "text-[color:var(--minus)]"}`}>
                {flag === "strongest" ? "Strongest leg" : "Weakest leg"}
              </span>
            ) : null}
            <h3 className="text-[15px] font-bold text-[color:var(--flat)]">{r.title}</h3>
            <p className="text-[11px] text-zinc-500">{r.sub}</p>
          </div>
          {r.implied != null ? (
            <div className="text-right">
              <span className="tabular block text-lg font-black text-[color:var(--flat)]">{Math.round(r.implied * 100)}%</span>
              <span className="block text-[10px] uppercase tracking-wider text-zinc-500">
                implied {r.odds != null ? `(${r.odds > 0 ? "+" : ""}${r.odds})` : ""}
              </span>
            </div>
          ) : null}
        </div>
        <LeanMeter r={r} />
        <div className="grid gap-3 sm:grid-cols-2">
          <PointList title="Pros" tone="plus" items={r.pros.map((p) => p.text)} empty="No pros from the numbers." />
          <PointList title="Cons" tone="minus" items={r.cons.map((p) => p.text)} empty="No cons from the numbers." />
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-[12px] font-semibold text-purple-200/80">
          {open ? "Hide the numbers" : `The numbers (${r.facts.length})`}
        </button>
        {open ? (
          <dl className="space-y-1.5 border-t border-zinc-800 pt-2">
            {r.facts.map((f, i) => (
              <div key={i} className="text-[12px] leading-snug">
                <dt className="font-bold text-zinc-300">{f.label}</dt>
                <dd className="tabular text-zinc-400">{f.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </article>
  );
}

function PointList({ title, tone, items, empty }: { title: string; tone: "plus" | "minus"; items: string[]; empty: string }) {
  const color = tone === "plus" ? "var(--plus)" : "var(--minus)";
  return (
    <div>
      <h4 className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color }}>
        {title}
      </h4>
      {items.length ? (
        <ul className="mt-1 space-y-1">
          {items.map((t, i) => (
            <li key={i} className="flex gap-1.5 text-[13px] leading-snug text-zinc-200">
              <span className="font-black" style={{ color }}>
                {tone === "plus" ? "+" : "−"}
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[12px] text-zinc-500">{empty}</p>
      )}
    </div>
  );
}

function ParlayPanel({ p, reports }: { p: ParlayReport; reports: Result["reports"] }) {
  const name = (i: number | null) => {
    if (i === null) return null;
    const r = reports.filter((x): x is LegReport => !("error" in x))[i];
    return r?.title ?? null;
  };
  return (
    <article className="foil-tile space-y-2 p-4">
      <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-purple-200/80">Parlay</span>
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="tabular block text-4xl font-black text-[color:var(--flat)]">{p.combined != null ? `${(p.combined * 100).toFixed(1)}%` : "—"}</span>
          <span className="block text-[10px] uppercase tracking-wider text-zinc-500">combined implied</span>
        </div>
        <span className="text-right text-[11px] text-zinc-500">
          {p.priced} of {p.legs} legs priced
        </span>
      </div>
      <p className="text-[13px] leading-snug text-zinc-300">{p.summary}</p>
      {name(p.strongest) ? (
        <p className="text-[12px]">
          <span className="font-black tone-gold">Strongest:</span> <span className="text-zinc-200">{name(p.strongest)}</span>
        </p>
      ) : null}
      {name(p.weakest) ? (
        <p className="text-[12px]">
          <span className="font-black text-[color:var(--minus)]">Weakest:</span> <span className="text-zinc-200">{name(p.weakest)}</span>
        </p>
      ) : null}
      {p.sameGame ? <p className="text-[11px] text-zinc-500">Same-game legs move together; the product is a rough guide only.</p> : null}
    </article>
  );
}
