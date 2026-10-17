"use client";

import { useEffect, useState } from "react";
import { enablePush, pushState, sendTestPush, type PushState } from "@/lib/pushClient";
import { mayShowNotify, NOTIFY_DELAY_MS } from "@/lib/notifyRules";

const HIDE = "pj-notify-hide";
const COUNT = "pj-notify-dismiss";
const VISITS = "pj-visits";

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-label="Share" className="inline-block align-[-3px]" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12M7 8l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A small prompt above the tab bar, never over content and never on first paint: it waits 20 s after load,
 * skips the first visit, and each "Not now" pushes it out (7 days, then 30, then off). It mounts once in the
 * layout, so navigating never brings it back. Every button runs from a tap, which iPhone requires.
 */
export default function NotifyBanner() {
  const [st, setSt] = useState<PushState | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let stop = false;
    let visits = 0;
    try {
      visits = Number(localStorage.getItem(VISITS)) || 0;
      if (!sessionStorage.getItem(VISITS)) {
        sessionStorage.setItem(VISITS, "1");
        visits += 1;
        localStorage.setItem(VISITS, String(visits));
      }
    } catch {
      return;
    }
    const t = setTimeout(() => {
      const ok = mayShowNotify({ visits, dismissals: Number(localStorage.getItem(COUNT)) || (localStorage.getItem(HIDE) ? 1 : 0), lastDismiss: Number(localStorage.getItem(HIDE)) || 0, now: Date.now() });
      if (!ok) return;
      pushState()
        .then((s) => {
          if (stop) return;
          setSt(s);
          setHidden(false);
        })
        .catch(() => {});
    }, NOTIFY_DELAY_MS);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, []);

  if (!st || hidden) return null;
  const ready = st.permission === "granted" && st.subscribed && st.on;
  if (ready && !note) return null;
  const needsHome = st.ios && !st.standalone;

  return (
    <section aria-label="Notifications" data-layer data-testid="notify-banner" className="fixed inset-x-3 bottom-[calc(var(--tabbar)+0.75rem)] z-40 mx-auto max-w-md rounded-xl border border-[color:var(--plus)]/40 bg-[#07130a]/95 p-3 text-sm shadow-2xl backdrop-blur">
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-lg leading-none">🔔</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white">{ready ? "Notifications are on" : "Turn on notifications"}</p>
          {needsHome ? (
            <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-zinc-300">
              <li>
                Tap <ShareIcon /> Share in Safari.
              </li>
              <li>Tap Add to Home Screen.</li>
              <li>Open Juice from your Home Screen and tap Enable there.</li>
            </ol>
          ) : st.permission === "denied" ? (
            <p className="mt-1 text-zinc-300">Notifications are blocked for this site. Allow them in your browser or phone settings, then come back.</p>
          ) : !st.supported ? (
            <p className="mt-1 text-zinc-300">This browser can’t get push. Updates still land in the bell while the app is open.</p>
          ) : !ready ? (
            <p className="mt-1 text-zinc-300">Get scores, your props, and your players when the app is closed.</p>
          ) : null}
          {note ? <p className="mt-1.5 text-zinc-200" role="status">{note}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {!ready && st.supported && !needsHome && st.permission !== "denied" ? (
              <button
                type="button"
                disabled={busy}
                className="rounded-lg bg-[color:var(--plus)] px-3 py-1.5 text-xs font-black text-black disabled:opacity-60"
                onClick={async () => {
                  setBusy(true);
                  setNote(await enablePush());
                  setSt(await pushState());
                  setBusy(false);
                }}
              >
                Enable
              </button>
            ) : null}
            {st.permission === "granted" && st.subscribed ? (
              <button
                type="button"
                disabled={busy}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                onClick={async () => {
                  setBusy(true);
                  setNote(await sendTestPush());
                  setBusy(false);
                }}
              >
                Send me a test
              </button>
            ) : null}
            <button
              type="button"
              className="px-2 py-1.5 text-xs text-zinc-400"
              onClick={() => {
                localStorage.setItem(HIDE, String(Date.now()));
                if (!ready) localStorage.setItem(COUNT, String((Number(localStorage.getItem(COUNT)) || 0) + 1));
                else localStorage.setItem(COUNT, "9");
                setHidden(true);
              }}
            >
              {ready ? "Done" : "Not now"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
