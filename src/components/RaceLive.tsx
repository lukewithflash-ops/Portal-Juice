"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { addPick, getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { fastestId, gapText, h2hMarket, intervalText, RACE_MARKETS, type RunRow } from "@/lib/racing";
import type { DriverInfo, RacePage } from "@/lib/racingFetch";
import { ptDayTime } from "@/lib/time";
import { usePoll, POLL_ERROR_MS } from "@/components/usePoll";

const ROW_H = 46;
const GOLD = "#f5c542";
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/** Race page body: live running order (positions animate), a track view, ESPN-based reads, and racing picks. */
export default function RaceLive({ initial }: { initial: RacePage }) {
  const [page, setPage] = useState(initial);
  const live = page.event.state === "in";
  const sessionId = page.session?.id ?? null;
  usePoll(async (signal) => {
    if (page.event.state !== "in") return 60_000;
    const res = await fetch(`/api/racing/${page.league}/${page.event.id}${sessionId ? `?s=${sessionId}` : ""}`, { cache: "no-store", signal });
    if (!res.ok) return POLL_ERROR_MS;
    setPage((await res.json()) as RacePage);
    return 3_000;
  }, `race-${page.event.id}`);

  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const mine = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of picks) {
      if (p.status !== "open" || p.league !== page.league || p.gameId !== page.event.id) continue;
      const k = norm(p.subject);
      m.set(k, [...(m.get(k) ?? []), p.market ?? "Pick"]);
    }
    return m;
  }, [picks, page.league, page.event.id]);
  const isMine = (name: string) => mine.has(norm(name));

  // Position changes since the last pull, for the green/red flash.
  const prev = useRef<Map<string, number>>(new Map());
  const [moved, setMoved] = useState<Record<string, number>>({});
  useEffect(() => {
    const next = new Map(page.rows.map((r) => [r.id, r.pos]));
    const delta: Record<string, number> = {};
    if (prev.current.size) for (const r of page.rows) {
      const was = prev.current.get(r.id);
      if (was && was !== r.pos) delta[r.id] = was - r.pos;
    }
    prev.current = next;
    if (!Object.keys(delta).length) return;
    const t0 = setTimeout(() => setMoved(delta), 0);
    const t = setTimeout(() => setMoved({}), 1800);
    return () => {
      clearTimeout(t0);
      clearTimeout(t);
    };
  }, [page.rows]);

  const [open, setOpen] = useState<string | null>(null);
  const ev = page.event;
  const st = page.status;
  const fl = fastestId(page.rows);
  const anyPits = page.rows.some((r) => (r.pits ?? 0) > 0);
  const anyLed = page.rows.some((r) => (r.lapsLed ?? 0) > 0);
  const infos = useMemo(() => new Map(page.drivers.map((d) => [d.id, d])), [page.drivers]);

  return (
    <div className="max-w-2xl">
      <p className="mb-3 text-[11px]">
        <Link href={`/racing/${page.league}`} className="font-bold uppercase tracking-[0.16em] text-purple-200/80 hover:text-white">
          Racing · Schedule
        </Link>
      </p>
      <h1 className="big-num text-[1.9rem] font-black leading-tight tracking-tight text-[color:var(--flat)]">{ev.name}</h1>
      <p className="mt-1 text-sm text-zinc-400">{[ev.circuit, ev.city].filter(Boolean).join(" · ")}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="race-status">
        <span className={live ? "pill pill-win" : "pill"}>{live ? "Live" : ev.state === "post" ? "Final" : "Upcoming"}</span>
        {page.session ? <span className="text-[13px] font-bold text-white">{page.session.label}</span> : null}
        {st?.lap ? (
          <span className="tabular text-[13px] font-black text-[color:var(--plus)]">
            Lap {st.lap}
            {st.laps ? `/${st.laps}` : ""}
          </span>
        ) : null}
        {st?.detail && live ? <span className="text-[12px] text-zinc-300">{st.detail}</span> : null}
      </div>

      <nav className="mt-3 flex gap-1.5 overflow-x-auto pb-1" aria-label="Sessions">
        {ev.sessions.map((s) => {
          const on = s.id === sessionId;
          const has = s.finishers.length > 0 || s.state === "in";
          return has ? (
            <Link key={s.id} href={`/racing/${page.league}/${ev.id}?s=${s.id}`} className={"shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black " + (on ? "border-[color:var(--plus)] text-white" : "border-white/15 text-zinc-400")}>
              {s.label}
            </Link>
          ) : (
            <span key={s.id} className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-bold text-zinc-500">
              {s.label} · {ptDayTime(s.date)}
            </span>
          );
        })}
      </nav>

      {page.odds.length ? (
        <p className="mt-2 text-[12px] text-zinc-300">
          <span className="font-black text-white">DraftKings</span> {page.odds[0].text}
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-zinc-500">No DraftKings race lines on ESPN for this one, so no price here.</p>
      )}

      {page.rows.length ? (
        <>
          <TrackView rows={page.rows} isMine={isMine} live={live} />
          <section className="foil-tile mt-4 p-3" aria-label="Running order">
            <div className="mb-1 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-zinc-500">
              <span>{ev.state === "post" && page.session?.type === "Race" ? "Result" : "Running order"}</span>
              <span>Gap · Int{anyPits ? " · Pits" : ""}</span>
            </div>
            <div className="relative" style={{ height: page.rows.length * ROW_H }} data-testid="race-order">
              {page.rows.map((r, i) => (
                <OrderRow
                  key={r.id}
                  r={r}
                  i={i}
                  rows={page.rows}
                  mine={isMine(r.name)}
                  moved={moved[r.id] ?? 0}
                  fastest={r.id === fl}
                  anyPits={anyPits}
                  anyLed={anyLed}
                  onTap={() => setOpen(open === r.id ? null : r.id)}
                />
              ))}
            </div>
            <p className="mt-2 text-[10px] text-zinc-500">
              ESPN running order{fl ? " · ⚡ fastest lap" : ""}. Gaps show only when ESPN posts them{anyPits ? "" : "; ESPN posts no pit stops for this session"}.
            </p>
          </section>
        </>
      ) : (
        <p className="foil-tile mt-4 p-4 text-sm text-zinc-400">
          {ev.state === "pre" ? `The field and running order post when ESPN does. ${page.session ? `${page.session.label}: ${ptDayTime(page.session.date)}.` : ""}` : "ESPN has no running order for this session."}
        </p>
      )}

      {open && infos.get(open) ? <DriverPanel d={infos.get(open)!} page={page} mine={mine.get(norm(infos.get(open)!.name)) ?? []} onClose={() => setOpen(null)} /> : null}

      {page.reads.length ? (
        <section className="foil-tile mt-4 p-4" aria-label="Reads" data-testid="race-reads">
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200/80">Reads from the numbers</h2>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {page.reads.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-16 shrink-0 text-[10px] font-black uppercase tracking-wider text-zinc-500">{READ_LABEL[r.kind]}</span>
                <button type="button" className={"text-left " + (isMine(r.name) ? "font-black" : "")} style={isMine(r.name) ? { color: GOLD } : undefined} onClick={() => setOpen(r.driverId)}>
                  <b className="text-white">{r.name}</b> · <span className="text-zinc-300">{r.text}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-zinc-500">From ESPN results: this season, earlier races at this track, the grid and teammates. Not a price, not a promise. Tap a driver for more.</p>
        </section>
      ) : null}

      {!page.rows.length && page.drivers.length ? (
        <section className="foil-tile mt-4 p-4" aria-label="Field">
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200/80">Drivers · season form</h2>
          <ul className="mt-2 divide-y divide-white/5 text-[13px]">
            {page.drivers.slice(0, 24).map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => setOpen(d.id)} className="flex w-full items-center justify-between gap-2 py-1.5 text-left" style={isMine(d.name) ? { color: GOLD } : undefined}>
                  <span className="truncate font-bold">{d.name}</span>
                  <span className="tabular shrink-0 text-[11px] text-zinc-400">
                    {d.form.starts ? `avg P${d.form.avg} · ${d.form.wins}W · ${d.form.top5} top-5` : "no starts yet"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {page.standings.length ? (
        <section className="foil-tile mt-4 p-4" aria-label="Standings">
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200/80">Championship</h2>
          <ol className="mt-2 space-y-0.5 text-[13px]">
            {page.standings.map((s) => (
              <li key={s.id} className="flex justify-between gap-2" style={isMine(s.name) ? { color: GOLD } : undefined}>
                <span>
                  <span className="tabular mr-2 text-zinc-500">{s.rank}</span>
                  {s.name}
                </span>
                <span className="tabular text-zinc-300">{s.points ?? "—"}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

const READ_LABEL: Record<string, string> = { form: "Form", track: "Track", grid: "Grid", trend: "Trend", teammate: "Mate", wins: "Wins" };

function OrderRow({ r, i, rows, mine, moved, fastest, anyPits, anyLed, onTap }: { r: RunRow; i: number; rows: RunRow[]; mine: boolean; moved: number; fastest: boolean; anyPits: boolean; anyLed: boolean; onTap: () => void }) {
  const gain = r.start && r.pos < 999 ? r.start - r.pos : null;
  const gap = gapText(r);
  const int = i > 0 ? intervalText(rows, i) : null;
  return (
    <button
      type="button"
      onClick={onTap}
      className={"race-row absolute inset-x-0 flex items-center gap-2 rounded-lg px-2 text-left " + (moved > 0 ? "race-up " : moved < 0 ? "race-down " : "") + (mine ? "race-mine" : "")}
      style={{ height: ROW_H - 4, transform: `translateY(${i * ROW_H}px)` }}
      data-testid="race-row"
      data-mine={mine ? "1" : undefined}
    >
      <span className="w-7 shrink-0 text-center font-display text-[15px] font-black tabular text-white">{r.pos < 999 ? r.pos : "—"}</span>
      <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: r.color ?? "rgba(255,255,255,0.3)" }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-black" style={mine ? { color: GOLD } : { color: "#fff" }}>
          {r.number ? <span className="mr-1 text-zinc-400">#{r.number}</span> : null}
          {r.name}
          {fastest ? <span className="ml-1" title="Fastest lap">⚡</span> : null}
        </span>
        <span className="block truncate text-[10px] text-zinc-400">
          {r.team ?? ""}
          {gain !== null && gain !== 0 ? <span className={gain > 0 ? "ml-1 text-[color:var(--plus)]" : "ml-1 text-[color:var(--minus)]"}>{gain > 0 ? `▲${gain}` : `▼${-gain}`} from P{r.start}</span> : r.start ? <span className="ml-1">started P{r.start}</span> : null}
          {anyLed && r.lapsLed ? <span className="ml-1">· led {r.lapsLed}</span> : null}
          {fastest && r.fastestLapText ? <span className="ml-1">· {r.fastestLapText}</span> : null}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="tabular block text-[12px] font-black text-zinc-100">{gap ?? "—"}</span>
        <span className="tabular block text-[10px] text-zinc-500">
          {int ?? ""}
          {anyPits ? ` · ${r.pits ?? 0} pit` : ""}
        </span>
      </span>
    </button>
  );
}

/** A loop with every car on it: order around the loop from ESPN's running order, spacing from ESPN's gaps when given. */
function TrackView({ rows, isMine, live }: { rows: RunRow[]; isMine: (n: string) => boolean; live: boolean }) {
  const lead = rows.filter((r) => !r.behindLaps);
  const maxGap = Math.max(0, ...lead.map((r) => r.behindTime ?? 0));
  const useGaps = maxGap > 0 && lead.filter((r) => r.behindTime).length >= Math.min(3, lead.length - 1);
  const frac = (r: RunRow, i: number) => {
    if (useGaps && !r.behindLaps) return r.pos === 1 ? 0 : Math.min(0.8, ((r.behindTime ?? 0) / maxGap) * 0.8);
    if (useGaps) return 0.82 + Math.min(0.16, (i / rows.length) * 0.16);
    return (i / Math.max(1, rows.length)) * 0.92;
  };
  const W = 320;
  const H = 150;
  const at = (f: number) => {
    const a = -Math.PI / 2 - f * Math.PI * 2;
    return { x: W / 2 + Math.cos(a) * 138, y: H / 2 + Math.sin(a) * 56 };
  };
  return (
    <section className="foil-tile mt-4 overflow-hidden p-2" aria-label="Track" data-testid="race-track">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Track view, ${rows[0]?.name ?? ""} leads`}>
        <ellipse cx={W / 2} cy={H / 2} rx={138} ry={56} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={16} />
        <ellipse cx={W / 2} cy={H / 2} rx={138} ry={56} fill="none" stroke="rgba(168,85,247,0.55)" strokeWidth={1.5} strokeDasharray="4 6" />
        <line x1={W / 2} y1={H / 2 - 66} x2={W / 2} y2={H / 2 - 46} stroke="#fff" strokeWidth={2} />
        {[...rows].reverse().map((r) => {
          const i = rows.indexOf(r);
          const p = at(frac(r, i));
          const mine = isMine(r.name);
          return (
            <g key={r.id} className="race-car" style={{ transform: `translate(${p.x}px, ${p.y}px)` }} data-mine={mine ? "1" : undefined}>
              {mine ? <circle r={9} fill="none" stroke={GOLD} strokeWidth={2} className="viz-portal" /> : null}
              <circle r={mine ? 6 : r.pos <= 3 ? 5 : 4} fill={mine ? GOLD : r.color ?? "#a1a1aa"} stroke="#000" strokeWidth={1} />
              {mine || r.pos === 1 ? (
                <text y={-11} textAnchor="middle" fontSize={9} fontWeight={900} fill={mine ? GOLD : "#fff"} stroke="#000" strokeWidth={2.5} paintOrder="stroke">
                  {r.pos === 1 ? "P1 " : ""}
                  {r.short}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <p className="px-1 text-[10px] text-zinc-500">{live ? "Moves each update. " : ""}Order from ESPN; {useGaps ? "spacing from ESPN's time gaps, lapped cars at the back" : "even spacing (ESPN gives no time gaps here)"}. Not a car-position feed.</p>
    </section>
  );
}

function DriverPanel({ d, page, mine, onClose }: { d: DriverInfo; page: RacePage; mine: string[]; onClose: () => void }) {
  const [market, setMarket] = useState<string>("Race Winner");
  const [rival, setRival] = useState<string>("");
  const [odds, setOdds] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const rivals = page.drivers.filter((x) => x.id !== d.id);
  const canLog = page.event.state !== "post";
  function save() {
    const m = market === "H2H" ? (rival ? h2hMarket(rival) : null) : market;
    if (!m) return;
    const o = Number(odds);
    const now = new Date();
    const top = m.match(/^Top (\d+)$/);
    addPick({
      id: crypto.randomUUID(),
      sport: "RACING",
      subject: d.name,
      line: m === "Race Winner" ? 1 : top ? Number(top[1]) : 0,
      odds: Number.isFinite(o) && Math.abs(o) >= 100 ? Math.round(o) : 0,
      stake: 0,
      book: "Not set",
      date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      status: "open",
      createdAt: now.toISOString(),
      league: page.league,
      gameId: page.event.id,
      market: m,
      selection: null,
    });
    setSaved(m);
  }
  const f = d.form;
  return (
    <section className={"foil-tile mt-4 p-4 " + (mine.length ? "race-mine-panel" : "")} aria-label={d.name} data-testid="driver-panel">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-black" style={mine.length ? { color: GOLD } : { color: "#fff" }}>{d.name}</h2>
          <p className="text-[11px] text-zinc-400">{[d.team, d.start ? `starts P${d.start}` : null].filter(Boolean).join(" · ")}</p>
        </div>
        <button type="button" onClick={onClose} className="text-[12px] font-bold text-zinc-400">Close</button>
      </div>
      {mine.length ? <p className="mt-1 text-[11px] font-black" style={{ color: GOLD }}>Your picks: {mine.join(", ")}</p> : null}
      <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
        {[
          ["Starts", f.starts],
          ["Avg fin", f.avg ?? "—"],
          ["Wins", f.wins],
          ["Top 5", f.top5],
          ["Top 3", f.top3],
          ["Top 10", f.top10],
          ["Best", f.best ? `P${f.best}` : "—"],
          ["Trend", f.trend === "up" ? "▲" : f.trend === "down" ? "▼" : f.trend === "flat" ? "→" : "—"],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-lg bg-white/5 py-1">
            <dt className="text-[9px] font-black uppercase tracking-wider text-zinc-500">{k}</dt>
            <dd className="tabular text-[14px] font-black text-white">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[12px] text-zinc-300">
        <b className="text-white">Last 5:</b> {f.last.length ? f.last.map((l) => `P${l.pos}`).join(" · ") : "no finishes this season"}
      </p>
      <p className="mt-1 text-[12px] text-zinc-300">
        <b className="text-white">This track:</b> {d.track.length ? d.track.map((t) => `P${t.pos} (${t.year})`).join(" · ") : "no earlier ESPN results here in the last 3 seasons"}
      </p>
      {d.mate ? (
        <p className="mt-1 text-[12px] text-zinc-300">
          <b className="text-white">Teammate:</b> ahead of {d.mate.name} in {d.mate.ahead} of {d.mate.races} races this season
        </p>
      ) : null}
      <p className="mt-1 text-[10px] text-zinc-500">DNFs aren&apos;t split out: ESPN&apos;s race results list a finishing order without retirement reasons.</p>
      {canLog ? (
        <div className="mt-3 border-t border-white/10 pt-3">
          <p className="text-[11px] font-black uppercase tracking-wider text-purple-200/80">Log a pick</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...RACE_MARKETS, "H2H"].map((m) => (
              <button key={m} type="button" aria-pressed={market === m} onClick={() => setMarket(m)} className={"rounded-full border px-2.5 py-1 text-[11px] font-black " + (market === m ? "border-[color:var(--plus)] text-white" : "border-white/15 text-zinc-400")}>
                {m}
              </button>
            ))}
          </div>
          {market === "H2H" ? (
            <select className="field mt-2 w-full" value={rival} onChange={(e) => setRival(e.target.value)} aria-label="Rival driver">
              <option value="">Finishes ahead of…</option>
              {rivals.map((x) => (
                <option key={x.id} value={x.name}>{x.name}</option>
              ))}
            </select>
          ) : null}
          <input className="field mt-2 w-full" inputMode="numeric" placeholder="Your price, optional (e.g. +450)" value={odds} onChange={(e) => setOdds(e.target.value)} aria-label="Your price" />
          <button type="button" onClick={save} disabled={market === "H2H" && !rival} className="mt-2 w-full rounded-xl bg-[color:var(--plus)] py-2 text-[13px] font-black text-black disabled:opacity-40" data-testid="race-log">
            Log {d.name} · {market === "H2H" ? (rival ? `ahead of ${rival}` : "pick a rival") : market}
          </button>
          {saved ? <p className="mt-1 text-[12px] font-bold text-[color:var(--plus)]">Logged: {saved}. It grades from ESPN&apos;s final order.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
