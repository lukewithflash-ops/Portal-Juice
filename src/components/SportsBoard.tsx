"use client";

import { useCallback, useEffect, useState } from "react";
import MatchRow from "@/components/MatchRow";
import { SPORT_LEAGUES, type GolfBoard, type SportSlate } from "@/lib/sports";

function Golf({ b }: { b: GolfBoard }) {
  return (
    <section className="foil-tile p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-lg font-black text-[color:var(--flat)]">{b.name}</h3>
        <span className={b.state === "in" ? "pill pill-win" : "text-[11px] text-zinc-400"}>{b.state === "in" ? "Live" : b.detail}</span>
      </div>
      {b.state === "in" ? <p className="text-[11px] text-zinc-400">{b.detail}</p> : null}
      <table className="mt-2 w-full text-[13px]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
            <th className="w-10 py-1">Pos</th>
            <th>Player</th>
            <th className="text-right">To par</th>
            <th className="text-right">Rd</th>
            <th className="text-right">Thru</th>
          </tr>
        </thead>
        <tbody>
          {b.rows.slice(0, 25).map((r) => (
            <tr key={r.name} className="border-t border-white/5">
              <td className="py-1 tabular text-zinc-400">{r.pos}</td>
              <td className="truncate font-semibold text-zinc-100">
                {r.flag ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.flag} alt="" width={14} height={14} className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
                ) : null}
                {r.name}
              </td>
              <td className={"text-right font-black tabular " + (r.score.startsWith("-") ? "text-[color:var(--plus)]" : "text-zinc-200")}>{r.score}</td>
              <td className="text-right tabular text-zinc-400">{r.today ?? "—"}</td>
              <td className="text-right tabular text-zinc-400">{r.thru ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-zinc-500">ESPN leaderboard, top 25. No win chance: ESPN posts no odds for golf here.</p>
    </section>
  );
}

/** Soccer, tennis, golf, MMA, more basketball. Polls ESPN every 15 seconds. */
export default function SportsBoard() {
  const [league, setLeague] = useState(SPORT_LEAGUES[0].id);
  const [slate, setSlate] = useState<SportSlate | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/sports/${id}`);
      if (!r.ok) throw new Error();
      setSlate((await r.json()) as SportSlate);
      setErr("");
    } catch {
      setErr("ESPN did not answer. Trying again.");
    }
  }, []);
  useEffect(() => {
    let stop = false;
    const tick = () => {
      if (!stop) void load(league);
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [league, load]);
  const cur = slate && slate.league.id === league ? slate : null;
  const groups = [...new Set(SPORT_LEAGUES.map((l) => l.group))];
  return (
    <section className="mt-10" aria-label="More sports" data-testid="more-sports">
      <h2 className="text-xl font-black tracking-tight text-[color:var(--flat)]">More sports</h2>
      <p className="mt-1 text-sm text-zinc-400">Soccer, tennis, golf, UFC, and more basketball. Scores and prices from ESPN when posted.</p>
      <div className="mt-3 space-y-1.5">
        {groups.map((g) => (
          <div key={g} className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
            <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{g}</span>
            {SPORT_LEAGUES.filter((l) => l.group === g).map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLeague(l.id)}
                aria-pressed={league === l.id}
                className={"shrink-0 rounded-full px-3 py-1 text-[12px] font-bold " + (league === l.id ? "bg-purple-500/25 text-white ring-1 ring-purple-300/40" : "bg-white/5 text-zinc-300")}
              >
                {l.label}
              </button>
            ))}
          </div>
        ))}
      </div>
      {err ? <p className="mt-3 text-sm text-zinc-400">{err}</p> : null}
      {!cur && !err ? <p className="mt-4 text-sm text-zinc-400">Loading…</p> : null}
      {cur ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {cur.golf.map((b) => (
            <div key={b.id} className="sm:col-span-2">
              <Golf b={b} />
            </div>
          ))}
          {cur.matches.map((m) => (
            <MatchRow key={m.id} m={m} href={`/sports/${cur.league.id}/${m.id}`} />
          ))}
          {!cur.golf.length && !cur.matches.length ? <p className="text-sm text-zinc-400">Nothing on ESPN&apos;s {cur.league.label} board right now.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
