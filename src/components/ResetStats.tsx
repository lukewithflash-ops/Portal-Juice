"use client";

import { useEffect, useRef, useState } from "react";
import { clearPicks, getPicks } from "@/lib/pickStore";

/** Device keys that hold stats built from the log. Follows, alerts, push and settings are left alone. */
const LOCAL_PREFIXES = ["pj-recap5:"];
const SESSION_KEYS = ["pj-log-looks-v1"];

async function resetEverything() {
  const picks = getPicks();
  // Server copy: recap cache for these picks. Leaders entries, follows and push stay.
  const jobs: Promise<unknown>[] = [];
  if (picks.length) jobs.push(fetch("/api/recap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reset: picks }) }).catch(() => null));
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && LOCAL_PREFIXES.some((p) => k.startsWith(p))) localStorage.removeItem(k);
  }
  for (const k of SESSION_KEYS) sessionStorage.removeItem(k);
  clearPicks();
  await Promise.all(jobs);
}

/** "Reset stats" with a confirm step. Cancel is the default. */
export default function ResetStats({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  async function confirm() {
    setBusy(true);
    await resetEverything();
    setBusy(false);
    setOpen(false);
    onDone();
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-xl border border-[color:var(--minus)]/50 px-3 py-2 text-[12px] font-black text-[color:var(--minus)] hover:bg-[color:var(--minus)]/10" data-testid="reset-stats">
        Reset stats
      </button>
      {open ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            aria-describedby="reset-body"
            className="reset-dialog w-full max-w-sm rounded-2xl p-5"
            onClick={(e) => e.stopPropagation()}
            data-testid="reset-dialog"
          >
            <div className="reset-ring mx-auto mb-3 h-12 w-12 rounded-full" aria-hidden />
            <h2 id="reset-title" className="text-center text-lg font-black text-white">Reset your stats?</h2>
            <p id="reset-body" className="mt-2 text-center text-[13px] leading-snug text-zinc-300">
              This clears your logged picks, record, streak and recap history on this device. This can&apos;t be undone.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button ref={cancel} type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/25 bg-white/10 px-3 py-2.5 text-sm font-black text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--plus)]" data-testid="reset-cancel">
                Cancel
              </button>
              <button type="button" onClick={confirm} disabled={busy} className="rounded-xl border border-[color:var(--minus)] bg-[color:var(--minus)]/85 px-3 py-2.5 text-sm font-black text-white shadow-[0_0_18px_rgba(255,59,92,0.55)]" data-testid="reset-confirm">
                {busy ? "Resetting…" : "Reset"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
