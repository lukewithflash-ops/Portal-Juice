"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Why } from "@/lib/why";

const LV: Record<string, string> = { out: "text-rose-300", doubtful: "text-orange-300", questionable: "text-amber-200" };
const sg = (n: number) => (n > 0 ? `+${n}` : String(n));

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-purple-200/70">{children}</h3>;
}

/** Compact "Why" panel: injuries, line move, DK money splits, recent trends, and Portal's record in similar spots. */
export default function WhyPanel({ league, id }: { league: string; id: string }) {
  const [w, setW] = useState<Why | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let on = true;
    const load = () =>
      fetch(`/api/why?lg=${league}&id=${id}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((x) => on && setW(x))
        .catch(() => on && setErr(true));
    load();
    const t = setInterval(load, 120_000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [league, id]);
  if (err && !w) return null;
  if (!w) return <p className="foil-tile mt-4 p-4 text-sm text-zinc-400">Loading the why…</p>;
  const m = w.move;
  const moves: string[] = [];
  if (m?.spreadHome != null && m.spreadHomeOpen != null && m.spreadHome !== m.spreadHomeOpen) moves.push(`${w.home} spread ${sg(m.spreadHomeOpen)} → ${sg(m.spreadHome)}`);
  if (m?.total != null && m.totalOpen != null && m.total !== m.totalOpen) moves.push(`Total ${m.totalOpen} → ${m.total}`);
  const inj = w.injuries.slice(0, 8);
  return (
    <section className="foil-tile mt-4 p-4" aria-label="Why" data-testid="why-panel">
      <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200/80">Why</h2>

      <H>Injuries</H>
      {inj.length ? (
        <ul className="mt-1 space-y-0.5 text-[13px]">
          {inj.map((i) => (
            <li key={i.team + i.name} className="flex justify-between gap-2">
              <span className="text-zinc-200">
                <span className="text-zinc-500">{i.team}</span> {i.name}
                {i.key ? <span className="ml-1.5 rounded bg-fuchsia-500/20 px-1 text-[10px] font-black text-fuchsia-200">KEY</span> : null}
              </span>
              <span className={`font-bold ${LV[i.level] ?? "text-zinc-400"}`}>{i.status}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[13px] text-zinc-400">No one listed Out, Doubtful or Questionable on ESPN.</p>
      )}

      <H>Line move{w.provider ? ` · ${w.provider}` : ""}</H>
      <p className="mt-1 text-[13px] text-zinc-200">{moves.length ? moves.join(" · ") : "No move since open."}</p>

      <H>Money splits · DraftKings</H>
      {w.locked ? (
        <p className="mt-1 text-[13px] text-zinc-400">
          <Link href="/vip" className="font-bold text-purple-200">VIP</Link> shows where the money and tickets are.
        </p>
      ) : w.splits?.length ? (
        <div className="mt-1 space-y-1.5">
          {w.splits.map((s) => (
            <div key={s.market} className="text-[12px]">
              <p className="font-bold text-zinc-300">{s.market}</p>
              {s.rows.map((r) => (
                <div key={r.side} className="flex items-center gap-2">
                  <span className="w-28 truncate text-zinc-300">{r.side}</span>
                  <div className="relative h-1.5 flex-1 rounded bg-white/10">
                    <div className="absolute inset-y-0 left-0 rounded bg-gradient-to-r from-fuchsia-500 to-cyan-400" style={{ width: `${r.handle}%` }} />
                  </div>
                  <span className="tabular w-24 text-right text-zinc-400">
                    {r.handle}% $ · {r.bets}% bets
                  </span>
                </div>
              ))}
              {s.rlm ? <p className="mt-0.5 text-[11px] font-bold text-amber-200">{s.rlm}</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[13px] text-zinc-400">DraftKings hasn’t posted splits for this game yet.</p>
      )}

      <H>Recent trends</H>
      {w.locked ? (
        <p className="mt-1 text-[13px] text-zinc-400">
          <Link href="/vip" className="font-bold text-purple-200">VIP</Link> shows last 10, ATS, O/U, home/away and rest.
        </p>
      ) : w.trends?.length ? (
        <table className="mt-1 w-full text-[12px] tabular">
          <thead className="text-zinc-500">
            <tr>
              <th className="text-left font-bold"></th>
              <th className="font-bold">L5</th>
              <th className="font-bold">L10</th>
              <th className="font-bold">ATS</th>
              <th className="font-bold">O/U</th>
              <th className="text-right font-bold">Spot</th>
            </tr>
          </thead>
          <tbody>
            {w.trends.map((t) => (
              <tr key={t.team} className="text-zinc-200">
                <td className="font-black">{t.team}</td>
                <td className="text-center">{t.last5}</td>
                <td className="text-center">{t.last10}</td>
                <td className="text-center">{t.ats10}</td>
                <td className="text-center">{t.ou10}</td>
                <td className="text-right text-zinc-400">{[t.venue, t.rest].filter(Boolean).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-1 text-[13px] text-zinc-400">No season results with DraftKings lines for these teams yet.</p>
      )}

      <H>Portal record in similar spots</H>
      <ul className="mt-1 space-y-0.5 text-[13px]" data-testid="similar-record">
        {w.similar.map((r) => (
          <li key={r.label} className="flex justify-between gap-2">
            <span className="text-zinc-300">{r.label}</span>
            <span className="tabular shrink-0 whitespace-nowrap font-bold text-zinc-100">
              {r.n ? `${r.w}-${r.l}${r.p ? `-${r.p}` : ""}` : "—"}
              {r.note ? <span className="ml-1.5 text-[10px] font-semibold text-zinc-500">{r.note}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-zinc-500">Graded VIP picks and daily Portal Picks only. Past results, not a guarantee.</p>
    </section>
  );
}
