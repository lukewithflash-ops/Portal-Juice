"use client";

import { SkelRows } from "@/components/Skeleton";
import Link from "next/link";
import { useEffect, useState } from "react";

type Leg = { name: string; label: string; value: string; note: string; fill: number; state: string; league: string };
type Slip = { title: string; total: number; hit: number; missed: number; alive: number; state: string; live: boolean; legs: Leg[] };
type Data = { updatedAt: string; open: number; slips: Slip[] };

const TONE: Record<string, string> = { hit: "#facc15", missed: "#f43f5e", behind: "#f43f5e", alive: "#39ff14", push: "#a1a1aa", waiting: "#a855f7" };

/** The widget, as the web shows it. Native widgets draw the same /api/widget JSON. */
export function WidgetPreview({ data }: { data: Data | null }) {
  if (!data) return <SkelRows n={2} h={56} label="Loading widget" />;
  if (!data.slips.length) return <div className="widget-tile p-4 text-sm text-zinc-400">No live picks right now. Open picks show up here when their games start.</div>;
  const s = data.slips[0];
  return (
    <div className="widget-tile p-4" data-testid="widget-preview">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200">Portal Juice</p>
        <p className="text-[10px] text-zinc-500">{new Date(data.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
      </div>
      <p className="mt-1 text-lg font-black text-white">
        {s.title} {s.live ? <span className="ml-1 text-[10px] text-[color:var(--plus)]">● LIVE</span> : null}
      </p>
      <p className="text-[12px] text-zinc-300">{s.hit}/{s.total} hit · {s.alive} open{s.missed ? ` · ${s.missed} missed` : ""}</p>
      <ul className="mt-2 space-y-1.5">
        {s.legs.map((l, i) => (
          <li key={i}>
            <div className="flex justify-between text-[11px]"><span className="truncate text-zinc-200">{l.name} · {l.label}</span><span className="ml-2 shrink-0 text-zinc-400">{l.value}</span></div>
            <div className="mt-0.5 h-1.5 rounded-full bg-white/10"><div className="h-1.5 rounded-full" style={{ width: `${Math.max(4, l.fill)}%`, background: TONE[l.state] ?? "#a855f7", boxShadow: `0 0 8px ${TONE[l.state] ?? "#a855f7"}` }} /></div>
          </li>
        ))}
      </ul>
      {data.slips.length > 1 ? <p className="mt-2 text-[10px] text-zinc-500">+{data.slips.length - 1} more live</p> : null}
    </div>
  );
}

export default function WidgetClient() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [has, setHas] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [token, setToken] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let stop = false;
    fetch("/api/widget/token", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (stop) return;
        setSignedIn(Boolean(j.signedIn));
        setHas(Boolean(j.has));
      })
      .catch(() => setSignedIn(false));
    const pull = () =>
      fetch("/api/widget", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => !stop && j && setData(j))
        .catch(() => {});
    pull();
    const t = setInterval(pull, 30000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="mx-auto max-w-lg py-3">
      <h1 className="text-2xl font-black text-white">Home-screen widget</h1>
      <p className="mt-1 text-sm text-zinc-400">Live parlay progress at a glance. Open picks only: hit, missed, push or open. No money.</p>

      <section className="mt-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-purple-200/80">Add My Live to your Home Screen</h2>
        <ol className="foil-tile list-decimal space-y-1 px-8 py-3 text-sm text-zinc-200">
          <li>Open this page in Safari (iPhone) or Chrome (Android).</li>
          <li>iPhone: tap <b>Share</b>, then <b>Add to Home Screen</b>. Android: menu, then <b>Add to Home screen</b>.</li>
          <li>The icon (“PJ Live”) opens straight to <Link href="/live" className="underline">My Live</Link>.</li>
        </ol>
        <p className="mt-2 text-[11px] text-zinc-500">On Android, long-press the Portal Juice icon for My Live, Log and Quests shortcuts.</p>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-purple-200/80">Preview</h2>
        {signedIn === false ? (
          <div className="widget-tile p-4 text-sm text-zinc-300">
            <Link href="/account" className="underline">Sign in</Link> with sync on to see your live parlays here and in the native widget.
          </div>
        ) : (
          <WidgetPreview data={data} />
        )}
      </section>

      {signedIn ? (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-purple-200/80">Native widget token</h2>
          <p className="text-[12px] text-zinc-400">The iPhone and Android widgets in the Portal Juice app use a device token. It reads live progress only and can be revoked anytime. {has ? "A token is active." : ""}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white"
              onClick={async () => {
                setErr("");
                const r = await fetch("/api/widget/token", { method: "POST" });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) return setErr(j.error || "Couldn't make a token.");
                setToken(j.token);
                setHas(true);
              }}
            >
              {has ? "Make a new token" : "Make a token"}
            </button>
            {has ? (
              <button
                type="button"
                className="rounded-lg bg-[color:var(--minus)]/20 px-3 py-2 text-xs font-bold text-[color:var(--minus)]"
                onClick={async () => {
                  await fetch("/api/widget/token", { method: "DELETE" });
                  setHas(false);
                  setToken("");
                }}
              >
                Revoke
              </button>
            ) : null}
          </div>
          {token ? (
            <p className="mt-2 break-all rounded-lg bg-black/40 p-2 font-mono text-[11px] text-[color:var(--plus)]">
              <code data-testid="widget-token">{token}</code>
              <span className="mt-1 block font-sans text-zinc-500">Shown once. Paste it into the app’s widget settings.</span>
            </p>
          ) : null}
          {err ? <p className="mt-2 text-[11px] text-[color:var(--minus)]">{err}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
