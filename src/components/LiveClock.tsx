"use client";
import { useEffect, useRef, useState } from "react";
import type { LiveSnap } from "@/lib/live";
import { clockAt, nextClock, stopReason, type ClockModel } from "@/lib/liveClock";

/** The game clock, ticking between ESPN updates only when ESPN's own updates show it running. */
export default function LiveClock({ league, snap }: { league: string; snap: LiveSnap }) {
  const model = useRef<ClockModel | null>(null);
  const key = `${snap.state}|${snap.clock}|${snap.detail}|${snap.period}|${snap.plays.length ? snap.plays[snap.plays.length - 1].id : ""}`;
  const [st, setSt] = useState<{ m: ClockModel; now: number } | null>(null);
  const m = st?.m ?? null;
  useEffect(() => {
    const last = snap.plays.length ? snap.plays[snap.plays.length - 1] : null;
    const next = nextClock(model.current, { league, state: snap.state, clock: snap.clock, detail: snap.detail, period: snap.period, lastPlay: last ? { typeText: last.typeText, text: last.text } : null, servedAt: snap.servedAt ?? null }, Date.now());
    model.current = next;
    setSt({ m: next, now: Date.now() });
    // Re-anchor only on a new ESPN value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, league]);
  const running = !!m && m.dir !== 0;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSt((x) => (x ? { ...x, now: Date.now() } : x)), 250);
    return () => clearInterval(t);
  }, [running, m]);
  const text = st ? clockAt(st.m, st.now) : snap.clock;
  // Ticked as far as allowed without a new feed value: say so instead of looking stuck.
  const capped = running && !!st && (st.now - st.m.at) / 1000 >= st.m.cap;
  const why = !running && snap.state === "in" ? stopReason(league, snap) : null;
  const last = snap.plays.length ? snap.plays[snap.plays.length - 1] : null;
  return (
    <>
      <span data-testid="live-clock" data-running={running ? "1" : "0"} title={running ? "Ticking from ESPN's last clock" : "ESPN's clock"}>
        {text ?? ""}
      </span>
      {why ? (
        <span className={"clock-chip" + (why.known ? "" : " clock-chip-dim")} data-testid="clock-why" title={!why.known && last ? `Last play: ${last.text}` : why.label}>
          ⏸ {why.label}
        </span>
      ) : capped ? <span className="clock-chip clock-chip-dim" data-testid="clock-why">Syncing</span> : null}
    </>
  );
}
