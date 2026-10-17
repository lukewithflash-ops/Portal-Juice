"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { getAccount, getServerAccount, subscribeAccount, syncNow } from "@/lib/syncClient";
import { invalidatePosition, type LivePosition } from "@/lib/positionsClient";
import type { Pick } from "@/lib/types";

/** Your own shared position, read once and kept in step across every Share button on the page. */
let mine: LivePosition | null | undefined;
const subs = new Set<() => void>();
const setMine = (p: LivePosition | null) => {
  mine = p;
  subs.forEach((f) => f());
};
let loading = false;
function loadMine() {
  if (mine !== undefined || loading) return;
  loading = true;
  fetch("/api/position?me=1", { cache: "no-store" })
    .then((r) => r.json())
    .then((j: { position?: LivePosition | null }) => setMine(j.position ?? null))
    .catch(() => {})
    .finally(() => (loading = false));
}

/** "Share as my live position" on a pick or parlay. One at a time; clears itself once graded. */
export default function SharePosition({ picks, small = false }: { picks: Pick[]; small?: boolean }) {
  const a = useSyncExternalStore(subscribeAccount, getAccount, getServerAccount);
  const [, bump] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    if (a.user) loadMine();
    return () => {
      subs.delete(f);
    };
  }, [a.user]);
  const open = picks.some((p) => p.status === "open");
  if (!open || !a.ready) return null;
  const cls = small ? "text-[11px] font-bold" : "rounded-lg border px-2.5 py-1 text-[11px] font-black";
  if (!a.user) {
    return (
      <Link href="/account?next=/lines/portfolio" className={cls + (small ? " text-[color:var(--plus)]" : " border-[color:var(--plus)]/50 text-white")} data-testid="share-pos-signin" onClick={(e) => e.stopPropagation()}>
        Share live
      </Link>
    );
  }
  const ids = picks.map((p) => p.id);
  const isMine = !!mine && mine.legs.length === ids.length && mine.legs.every((l) => ids.includes(l.id));
  async function go(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setErr(null);
    setBusy(true);
    try {
      if (!isMine) await syncNow().catch(() => {});
      const r = await fetch("/api/position", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(isMine ? { clear: true } : { ids }) });
      const j = (await r.json().catch(() => ({}))) as { position?: LivePosition | null; error?: string };
      if (!r.ok) setErr(j.error ?? "That didn't work.");
      else {
        const prev = mine?.handle;
        setMine(j.position ?? null);
        const h = j.position?.handle ?? prev;
        if (h) invalidatePosition(h);
        try {
          navigator.vibrate?.(10);
        } catch {}
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        aria-pressed={isMine}
        className={cls + " press " + (isMine ? (small ? " text-[color:var(--plus)]" : " border-[color:var(--plus)] bg-[color:var(--plus)]/15 text-white") : small ? " text-[color:var(--plus)]" : " border-[color:var(--plus)]/50 text-white")}
        data-testid="share-pos"
      >
        {isMine ? "Live position · Clear" : "Share as my live position"}
      </button>
      {err ? <span className="text-[11px] text-[color:var(--minus)]" role="alert">{err}</span> : null}
    </span>
  );
}
