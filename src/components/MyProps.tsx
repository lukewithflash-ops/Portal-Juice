"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import type { LiveSnap } from "@/lib/live";
import { playerByName, trackProps, type TrackRow } from "@/lib/tracker";

type Toast = { id: string; text: string; tone: TrackRow["tone"] };

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function MyProps({ league, gameId, snap }: { league: string; gameId: string; snap: LiveSnap | null }) {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const mine = picks.filter((p) => p.status === "open" && p.gameId === gameId && p.market);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [alerts, setAlerts] = useState(false);
  const [pushNote, setPushNote] = useState("");
  const prev = useRef<Record<string, string>>({});

  const rows = useMemo(() => {
    if (!snap) return [] as (TrackRow & { pickId: string; selection: string | null })[];
    const out: (TrackRow & { pickId: string; selection: string | null })[] = [];
    for (const pick of mine) {
      const player = playerByName(snap.boxes, pick.subject);
      if (!player) continue;
      const row = trackProps(
        [{ athleteId: player.id, name: pick.subject, team: "", headshot: null, market: pick.market as string, line: String(pick.line) }],
        snap,
        league
      )[0];
      if (!row) continue;
      if (pick.selection === "Under" && row.value !== null) {
        const under = row.value < row.line;
        row.tone = snap.state === "post" ? (under ? "gold" : "red") : row.value >= row.line ? "red" : row.pace !== null && row.pace < row.line ? "green" : row.tone === "red" ? "green" : row.tone;
        row.stamp = snap.state === "post" ? (under ? "CLEARED" : "MISSED") : row.value >= row.line ? "MISSED" : null;
      }
      out.push({ ...row, pickId: pick.id, selection: pick.selection ?? null });
    }
    return out;
  }, [mine, snap, league]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAlerts(localStorage.getItem("pj-alerts") === "on"));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const fresh: Toast[] = [];
    for (const r of rows) {
      const before = prev.current[r.pickId];
      prev.current[r.pickId] = r.tone;
      if (!before || before === r.tone || r.tone === "flat") continue;
      const text =
        r.tone === "gold"
          ? `🏆 ${r.name} cleared ${r.line} ${r.market}.`
          : r.tone === "green"
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
    if (!("Notification" in window)) {
      setPushNote("This browser has no notifications. On iPhone, add Juice to the Home Screen first.");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      setPushNote("Notifications stay off.");
      return;
    }
    localStorage.setItem("pj-alerts", "on");
    setAlerts(true);
    try {
      const keyRes = await fetch("/api/push/public");
      const key = await keyRes.json();
      if (!key.enabled || !("serviceWorker" in navigator)) {
        setPushNote("Alerts work while this page is open. Closed-app push starts when the store is connected.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key.publicKey),
      });
      const props = getPicks()
        .filter((p) => p.status === "open" && p.gameId && p.market && p.league)
        .map((p) => ({ id: p.id, league: p.league, gameId: p.gameId, subject: p.subject, market: p.market, line: p.line, selection: p.selection ?? null }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sub: sub.toJSON(), props }),
      });
      setPushNote(res.ok ? "Push is on for your logged props." : "Alerts work while this page is open. Closed-app push starts when the store is connected.");
    } catch {
      setPushNote("Alerts work while this page is open. Closed-app push needs Juice on the Home Screen.");
    }
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
      {rows.length === 0 ? (
        <p className="panel rounded-xl px-4 py-3 text-sm text-zinc-400">
          {snap?.state === "pre" ? "Your props start tracking at tip." : "No box score match yet for your logged names."}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const fill = r.value === null ? 0 : Math.max(0, Math.min(100, (r.value / r.line) * 100));
            const color = r.tone === "gold" ? "var(--gold)" : r.tone === "green" ? "var(--plus)" : r.tone === "red" ? "var(--minus)" : "#a1a1aa";
            return (
              <li key={r.pickId} className={"foil-tile relative px-3 py-2 " + (r.tone === "gold" ? "gold-burst gold-edge" : "")}>
                {r.tone === "gold" ? <span className="burst-pop pointer-events-none absolute right-3 top-1 text-xl">🏆</span> : null}
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-[color:var(--flat)]">{r.name}</div>
                    <div className="text-[11px] text-zinc-500">
                      {r.selection ? r.selection + " " : ""}
                      {r.line} {r.market}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tabular text-xl font-black" style={{ color }}>
                      {r.value ?? "—"}
                      <span className="text-xs text-zinc-500">/{r.line}</span>
                    </div>
                    {r.stamp ? <div className="text-[10px] font-black tracking-wider" style={{ color }}>{r.stamp}</div> : null}
                    {r.pace !== null ? <div className="text-[10px] text-zinc-500">pace {r.pace}</div> : null}
                  </div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full" style={{ width: fill + "%", background: color, transition: "width 700ms ease" }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="pointer-events-none fixed inset-x-3 bottom-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="play-in rounded-xl border px-3 py-2 text-sm font-bold text-[color:var(--flat)]"
            style={{
              background: "rgba(10,8,18,0.95)",
              borderColor: t.tone === "gold" ? "var(--gold)" : t.tone === "green" ? "var(--plus)" : "var(--minus)",
            }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </section>
  );
}
