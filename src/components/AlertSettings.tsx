"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ALERT_KINDS } from "@/lib/alerts";
import { getAlertPrefs, getServerAlertPrefs, setAlertPref, subscribeAlertPrefs } from "@/lib/alertPrefsStore";
import { alertsOn, disablePush, enablePush, syncPush } from "@/lib/pushClient";

/** Which updates you get, in the app and as push when the app is closed. */
export default function AlertSettings() {
  const prefs = useSyncExternalStore(subscribeAlertPrefs, getAlertPrefs, getServerAlertPrefs);
  const [push, setPush] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const id = requestAnimationFrame(() =>
      setPush(alertsOn() && "Notification" in window && Notification.permission === "granted")
    );
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <section className="panel mb-6 rounded-2xl p-4" aria-label="Updates">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-purple-200/80">Updates</h2>
        {push ? (
          <button
            type="button"
            onClick={() => {
              disablePush();
              setPush(false);
              setNote("Push is off. In-app updates stay on.");
            }}
            className="rounded-lg border border-white/15 px-2 py-1 text-[11px] font-bold text-zinc-300"
          >
            Push on · turn off
          </button>
        ) : (
          <button
            type="button"
            onClick={async () => {
              const msg = await enablePush();
              setNote(msg);
              setPush(alertsOn() && Notification.permission === "granted");
            }}
            className="rounded-lg border border-[color:var(--gold)] px-2 py-1 text-[11px] font-bold text-[color:var(--gold)]"
          >
            Turn on push
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">
        For your logged props, games you follow (★), and your team. In the app while it’s open; push when it’s closed. On iPhone, push needs Add to Home Screen.
      </p>
      {note ? <p className="mt-1 text-[11px] text-zinc-300">{note}</p> : null}
      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {ALERT_KINDS.map((k) => (
          <label key={k.kind} className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 px-2.5 py-2">
            <input
              type="checkbox"
              className="mt-0.5 accent-[color:var(--gold)]"
              checked={prefs[k.kind]}
              onChange={(e) => {
                setAlertPref(k.kind, e.target.checked);
                syncPush().catch(() => {});
              }}
            />
            <span>
              <span className="block text-xs font-bold text-[color:var(--flat)]">{k.label}</span>
              <span className="block text-[10px] text-zinc-500">{k.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
