"use client";
import { useState } from "react";
import { syncNow } from "@/lib/syncClient";

/** Makes a public /p/<id> link for this pick (or its whole parlay) only when you tap it. Needs a signed-in, synced account. */
export default function SharePickButton({ pickId }: { pickId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const go = async () => {
    setMsg("…");
    try {
      await syncNow().catch(() => {});
      const r = await fetch("/api/pickshare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pickId }) });
      const j = await r.json();
      if (!r.ok) return setMsg(j.error || "Couldn’t share.");
      const ns = typeof navigator.share === "function";
      if (ns) await navigator.share({ url: j.url, title: "My pick on Portal Juice" }).catch(() => {});
      else await navigator.clipboard?.writeText(j.url);
      setMsg(ns ? null : "Link copied");
    } catch {
      setMsg("Couldn’t share.");
    }
  };
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" onClick={go} data-testid="share-pick-btn" className="text-[11px] font-bold text-[color:var(--portal-green)] hover:text-white">Share</button>
      {msg ? <span className="text-[10px] text-zinc-400">{msg}</span> : null}
    </span>
  );
}
