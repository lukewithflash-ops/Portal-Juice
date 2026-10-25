"use client";

import { useCallback, useEffect, useState } from "react";

type Book = { id: string; book: string; status: "linked" | "relink"; lastSync: string | null };
type Status = { on: boolean; signedIn?: boolean; ready?: boolean; vip?: boolean; consented?: boolean; showPublic?: boolean; pausedUntil?: string | null; refreshPerDay?: number; books?: Book[] };

export const BOOKSYNC_PUBLIC_KEY = "pj-booksync-public";

async function act(body: Record<string, unknown>) {
  const r = await fetch("/api/booksync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(String(j.error ?? "Something went wrong"));
  return j;
}

const fetchStatus = (): Promise<Status> => fetch("/api/booksync", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ on: false }));

/** More → Link your book. Read-only bet sync (VIP perk). Hidden unless the BOOKSYNC flag is on for you. */
export default function BookSyncSection() {
  const [s, setS] = useState<Status | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const apply = useCallback((j: Status) => {
    setS(j);
    try {
      localStorage.setItem(BOOKSYNC_PUBLIC_KEY, j.showPublic ? "1" : "0");
    } catch {}
  }, []);
  const load = useCallback(async () => apply(await fetchStatus()), [apply]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("booksync");
    if (q === "1" || q === "0") {
      window.location.replace(`/api/booksync?booksync=${q}`);
      return;
    }
    fetchStatus().then((j) => {
      apply(j);
      if (q === "done") setMsg("Book linked. Your slips will show up in your Log after the first sync.");
    });
  }, [apply]);

  if (!s?.on) return null;

  const run = async (key: string, body: Record<string, unknown>, ok?: string) => {
    setBusy(key);
    setMsg(null);
    try {
      const j = await act(body);
      if (typeof j.url === "string") {
        window.location.assign(j.url);
        return;
      }
      if (ok) setMsg(ok);
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const books = s.books ?? [];
  const pausedUntil = s.pausedUntil ? new Date(s.pausedUntil).toLocaleDateString() : null;

  return (
    <section data-testid="booksync">
      <h2 className="mb-2 flex items-center gap-2 px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        Link your book
        <span className="rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-2 py-0.5 text-[10px] font-black tracking-wider text-black">VIP PERK</span>
      </h2>
      <div className="space-y-3 rounded-2xl border border-fuchsia-400/40 bg-gradient-to-br from-fuchsia-500/10 via-white/[0.03] to-cyan-400/10 p-4 shadow-[0_0_24px_rgba(217,70,239,0.18)]">
        <p className="text-[14px] text-zinc-200">Your slips land in your Log on their own, tracked live and graded W/L/P. Read-only: Portal Juice never places a bet and never sees your password.</p>

        {!s.signedIn ? (
          <p className="text-[13px] text-zinc-400">Sign in to link a book.</p>
        ) : pausedUntil ? (
          <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-[13px] text-amber-200" data-testid="booksync-paused">
            Book sync is paused until {pausedUntil}. Nothing syncs and you can&apos;t link a book until then.
          </p>
        ) : (
          <>
            {books.length ? (
              <ul className="divide-y divide-white/5 rounded-xl border border-white/10 bg-black/20">
                {books.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-3 py-2.5" data-testid="booksync-book">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${b.status === "linked" ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-amber-400 shadow-[0_0_8px_#fbbf24]"}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-white">{b.book}</span>
                      <span className="block text-[12px] text-zinc-400">{b.status === "relink" ? "Needs relink: sign in to your book again" : b.lastSync ? `Synced ${new Date(b.lastSync).toLocaleString()}` : "Linked, first sync on the way"}</span>
                    </span>
                    {b.status === "linked" ? (
                      <button type="button" className="press rounded-lg bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50" disabled={!!busy} onClick={() => run(`r-${b.id}`, { action: "refresh", account: b.id }, "Refresh started. New slips arrive in a minute or two.")}>
                        {busy === `r-${b.id}` ? "…" : "Refresh"}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            <label className="flex items-start gap-2 text-[13px] text-zinc-300">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-fuchsia-500" checked={agree} onChange={(e) => setAgree(e.target.checked)} data-testid="booksync-consent" />
              <span>
                I agree to let Portal Juice read my bet history from the books I link (through SharpSports) to fill my Log. It stays private to me. I can unlink and delete it any time.
              </span>
            </label>
            <button
              type="button"
              disabled={!agree || !!busy || !s.ready}
              onClick={() => run("link", { action: "link", consent: true })}
              className="press w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 py-3 text-[15px] font-black text-black shadow-[0_0_18px_rgba(34,211,238,0.35)] disabled:opacity-40"
              data-testid="booksync-link"
            >
              {busy === "link" ? "Opening…" : books.some((b) => b.status === "relink") ? "Relink a book" : books.length ? "Link another book" : "Link your book"}
            </button>
            {!s.ready ? <p className="text-[12px] text-zinc-500">Coming soon: book sync isn&apos;t switched on yet.</p> : null}
            <p className="text-[12px] text-zinc-500">DraftKings linking needs the next app update. Refresh up to {s.refreshPerDay ?? 2} times a day per book; books also sync on their own.</p>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[13px] text-zinc-200">
              <span>
                Show synced slips on Leaders and shares
                <span className="block text-[11px] text-zinc-500">Off by default. Synced slips stay private unless you turn this on.</span>
              </span>
              <input type="checkbox" className="h-5 w-5 accent-cyan-400" checked={!!s.showPublic} disabled={!!busy} onChange={(e) => run("pub", { action: "prefs", showPublic: e.target.checked })} data-testid="booksync-public" />
            </label>
          </>
        )}

        {s.signedIn ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {books.length || s.consented ? (
              <button
                type="button"
                className="press rounded-lg border border-rose-400/50 px-3 py-2 text-[12px] font-bold text-rose-300 disabled:opacity-50"
                disabled={!!busy}
                onClick={() => {
                  if (confirm("Unlink all books and delete every synced slip from your Log?")) void run("unlink", { action: "unlink" }, "Unlinked. Synced slips deleted.");
                }}
                data-testid="booksync-unlink"
              >
                Unlink and delete synced data
              </button>
            ) : null}
            {!pausedUntil ? (
              <select
                className="field rounded-lg px-2 py-2 text-[12px]"
                aria-label="Take a break from book sync"
                value=""
                disabled={!!busy}
                onChange={(e) => {
                  const d = Number(e.target.value);
                  if (d && confirm(`Pause book sync for ${d} day${d > 1 ? "s" : ""}? You can't undo this early.`)) void run("pause", { action: "prefs", pauseDays: d }, "Book sync paused.");
                }}
              >
                <option value="">Take a break…</option>
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
              </select>
            ) : null}
          </div>
        ) : null}
        <p className="text-[11px] text-zinc-500">If betting stops being fun, take a break. Call or text 1-800-GAMBLER.</p>
        {msg ? <p className="text-[13px] text-cyan-300" role="status">{msg}</p> : null}
      </div>
    </section>
  );
}
