"use client";

import { EntrySlip } from "@/components/EntrySlip";
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
          return (
            <div key={slip.key}>
              <EntrySlip slip={slip} snaps={snaps} />
              {snap?.state === "pre" ? <p className="mt-1 text-[11px] text-zinc-500">Tracking starts when the game does.</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
