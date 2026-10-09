"use client";

import Link from "next/link";
import { LegMeter, SlipCount } from "@/components/LegMeter";
import { useLiveHub } from "@/components/LiveHub";
import { PACE_NOTE } from "@/lib/motivation";

/** Log page: every open slip with a game attached, tracked live from the box score. */
export default function LiveSlips() {
  const { slips, snaps } = useLiveHub();
  const tracked = slips.filter((s) => s.legs.some((l) => snaps[`${l.league}/${l.gameId}`]));
  if (!tracked.length) return null;
  return (
    <section className="mb-6" aria-label="Live slips">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-[color:var(--gold)]">Live slips</h2>
        <span className="text-[10px] text-zinc-500">Updates on its own</span>
      </div>
      <p className="mb-3 text-[11px] text-zinc-500">{PACE_NOTE}</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {tracked.map((slip) => {
          const first = slip.legs[0];
          const snap = snaps[`${first.league}/${first.gameId}`];
          const games = [...new Set(slip.legs.map((l) => `${l.league}/${l.gameId}`))];
          return (
            <div key={slip.key} className="panel rounded-xl p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0 text-[11px] text-zinc-400">
                  {games.map((g) => {
                    const s = snaps[g];
                    return (
                      <Link key={g} href={`/games/${g}`} className="mr-2 font-bold text-zinc-200 hover:text-white">
                        {s ? `${s.awayAbbr} ${s.awayScore ?? 0}-${s.homeScore ?? 0} ${s.homeAbbr} · ${s.state === "in" ? s.detail : s.state === "post" ? "Final" : "Not started"}` : "Game"}
                      </Link>
                    );
                  })}
                </div>
                <SlipCount slip={slip} />
              </div>
              <ul className="space-y-2">
                {slip.legs.map((l) => (
                  <LegMeter key={l.pickId} leg={l} />
                ))}
              </ul>
              {snap?.state === "pre" ? <p className="mt-2 text-[11px] text-zinc-500">Tracking starts at tip.</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
