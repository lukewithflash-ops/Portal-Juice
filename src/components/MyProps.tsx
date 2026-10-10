"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import type { LiveSnap } from "@/lib/live";
import type { TrackRow } from "@/lib/tracker";
import { groupSlips, legFromPick, PACE_NOTE, type Leg } from "@/lib/motivation";
import { LegMeter, SlipCount } from "@/components/LegMeter";
import { alertsOn, enablePush } from "@/lib/pushClient";

type Toast = { id: string; text: string; tone: TrackRow["tone"] };

export default function MyProps({ gameId, snap }: { league: string; gameId: string; snap: LiveSnap | null }) {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const mine = picks.filter((p) => p.status === "open" && p.gameId === gameId && p.market);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [alerts, setAlerts] = useState(false);
  const [pushNote, setPushNote] = useState("");
  const prev = useRef<Record<string, string>>({});

  // Previous snapshot, kept so "+2 just now" reads off a real change between pulls.
  const [pair, setPair] = useState<{ cur: LiveSnap | null; prev: LiveSnap | null }>({ cur: snap, prev: null });
  if (pair.cur !== snap) setPair({ cur: snap, prev: pair.cur });
  const prevSnap = pair.prev;
  const rows = useMemo(() => {
    const out: Leg[] = [];
    for (const pick of mine) {
      const before = prevSnap ? legFromPick(pick, prevSnap)?.value ?? null : null;
      const leg = legFromPick(pick, snap, before);
      if (leg) out.push(leg);
    }
    return out;
  }, [mine, snap, prevSnap]);
  const slips = useMemo(() => groupSlips(rows), [rows]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAlerts(localStorage.getItem("pj-alerts") === "on"));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const fresh: Toast[] = [];
    for (const r of rows) {
      const before = prev.current[r.pickId];
      prev.current[r.pickId] = r.tone;
      if (!before || before === r.tone || r.tone === "flat" || r.tone === "gold") continue;
      const text =
        r.tone === "green"
            ? `🔥 ${r.name} is on pace for ${r.line} ${r.market}.`
            : `🧊 ${r.name} is behind ${r.line} ${r.market}.`;
      fresh.push({ id: r.pickId + r.tone, text, tone: r.tone });
      if (alerts && "Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("Portal Juice", { body: text, icon: "/icons/icon-192.png" });
        } catch {
          /* some browsers need the worker */
        }
      }
    }
    if (!fresh.length) return;
    const id = requestAnimationFrame(() => setToasts((t) => [...fresh, ...t].slice(0, 3)));
    const clear = setTimeout(() => setToasts((t) => t.filter((x) => !fresh.some((f) => f.id === x.id))), 6000);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(clear);
    };
  }, [rows, alerts]);

  async function turnOn() {
    setPushNote(await enablePush());
    setAlerts(alertsOn());
  }

  if (!mine.length) return null;

  return (
    <section className="mb-3" aria-label="My props">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--gold)]">My props</h2>
        {!alerts ? (
          <button type="button" onClick={turnOn} className="rounded-lg border border-white/15 px-2 py-1 text-[11px] font-bold text-zinc-200">
            Alerts
          </button>
        ) : (
          <span className="text-[11px] text-zinc-500">Alerts on</span>
        )}
      </div>
      {pushNote ? <p className="mb-2 text-[11px] text-zinc-500">{pushNote}</p> : null}
      {!alerts ? (
        <p className="mb-2 text-[11px] text-zinc-500">On iPhone, push works only after Add to Home Screen.</p>
      ) : null}
      {snap?.state === "pre" ? (
        <p className="panel rounded-xl px-4 py-3 text-sm text-zinc-400">Your props start tracking at tip.</p>
      ) : rows.length === 0 ? (
        <p className="panel rounded-xl px-4 py-3 text-sm text-zinc-400">No box score match yet for your logged names.</p>
      ) : (
        <div className="space-y-3">
          {slips.map((slip) => (
            <div key={slip.key}>
              {slip.total > 1 ? (
                <div className="mb-1.5 flex justify-end">
                  <SlipCount slip={slip} />
                </div>
              ) : null}
              <ul className="space-y-2">
                {slip.legs.map((l) => (
                  <LegMeter key={l.pickId} leg={l} />
                ))}
              </ul>
            </div>
          ))}
          <p className="text-[10px] text-zinc-500">{PACE_NOTE}</p>
        </div>
      )}
      <div className="pointer-events-none fixed inset-x-3 bottom-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="portal-toast play-in flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-bold text-[color:var(--flat)]"
            style={{
              ["--glow" as string]: t.tone === "gold" ? "var(--gold)" : t.tone === "green" ? "var(--plus)" : "var(--minus)",
              borderColor: t.tone === "gold" ? "var(--gold)" : t.tone === "green" ? "var(--plus)" : "var(--minus)",
            }}
          >
            <span className="portal-ring" aria-hidden />
            {t.text}
          </div>
        ))}
      </div>
    </section>
  );
}
