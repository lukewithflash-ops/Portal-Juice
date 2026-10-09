"use client";

import { useEffect, useState } from "react";
import type { Pick } from "@/lib/types";

const TOKEN = "pj-leader-token";
const HANDLE = "pj-leader-handle";

function deviceToken(): string {
  let t = localStorage.getItem(TOKEN);
  if (!t) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    t = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    localStorage.setItem(TOKEN, t);
  }
  return t;
}

/** Opt-in: shares handle + line fields only. Stakes, prices, and books never leave the device. */
export default function SharePanel({ picks }: { picks: Pick[] }) {
  const [handle, setHandle] = useState("");
  const [published, setPublished] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const graded = picks.filter((p) => p.status === "win" || p.status === "loss").length;

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const h = localStorage.getItem(HANDLE);
      if (h) {
        setHandle(h);
        setPublished(true);
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  async function send(remove = false) {
    setBusy(true);
    setMsg("");
    try {
      const legs = picks.map((p) => ({
        sport: p.sport,
        subject: p.subject,
        market: p.market ?? "",
        line: p.line,
        selection: p.selection ?? null,
        status: p.status,
        date: p.date,
        league: p.league,
        gameId: p.gameId,
      }));
      const res = await fetch("/api/leaders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(remove ? { handle, token: deviceToken(), remove: true } : { handle, token: deviceToken(), legs }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Did not publish.");
        return;
      }
      if (remove) {
        localStorage.removeItem(HANDLE);
        setPublished(false);
        setMsg("Removed from Leaders.");
      } else {
        localStorage.setItem(HANDLE, handle);
        setPublished(true);
        setMsg(`Shared ${data.count} lines as @${handle}.`);
      }
    } catch {
      setMsg("Store did not answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Share to Leaders" className="panel mt-4 rounded-2xl p-4">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-purple-200/80">Leaders · opt in</h2>
      <p className="mt-1 text-[12px] leading-snug text-zinc-400">
        Shares your handle and lines only: player, market, line, side, result. Stakes, prices, and books stay on this device.
        Listed after 8 graded lines. You have {graded}.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          className="field min-w-0 flex-1"
          value={handle}
          onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))}
          placeholder="handle"
          maxLength={20}
          disabled={published}
        />
        <button
          type="button"
          disabled={busy || !handle}
          onClick={() => send(false)}
          className="rounded-xl bg-purple-500/30 px-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {published ? "Update" : "Publish"}
        </button>
        {published ? (
          <button type="button" disabled={busy} onClick={() => send(true)} className="rounded-xl border border-white/15 px-3 text-sm text-zinc-300">
            Remove
          </button>
        ) : null}
      </div>
      {msg ? <p className="mt-2 text-[12px] text-zinc-300">{msg}</p> : null}
    </section>
  );
}
