"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { streaks } from "@/lib/myStats";

/** Win streak from the Log on this device: the header glow brightens with each straight win (2+). */
export default function StreakGlow() {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const n = useMemo(() => Math.max(0, streaks(picks).current), [picks]);
  const level = n >= 2 ? Math.min(5, n - 1) : 0;
  useEffect(() => {
    const el = document.documentElement;
    if (level) el.dataset.streak = String(level);
    else delete el.dataset.streak;
  }, [level]);
  if (n < 2) return null;
  return (
    <span key={n} className="streak-chip press tabular" title={`${n} logged wins in a row on this device`} aria-label={`${n} win streak`}>
      <span aria-hidden>🔥</span>{n}
    </span>
  );
}
