"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { forget, getAccount, getServerAccount, refreshAccount, signOut, subscribeAccount, syncNow } from "@/lib/syncClient";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { getNotes, getServerNotes, subscribeNotes } from "@/lib/noteStore";

const ERRORS: Record<string, string> = {
  "google-off": "Google sign-in isn't switched on yet.",
  "apple-off": "Sign in with Apple isn't switched on yet.",
  "google-state": "Google sign-in timed out. Try again.",
  "apple-state": "Apple sign-in timed out. Try again.",
  "google-cancel": "Google sign-in was canceled.",
  "apple-cancel": "Apple sign-in was canceled.",
  "google-token": "Google didn't confirm the sign-in. Try again.",
  "apple-token": "Apple didn't confirm the sign-in. Try again.",
  taken: "That sign-in already belongs to another Portal Juice account.",
};

async function post(url: string, body?: unknown): Promise<{ ok: boolean; j: Record<string, unknown> }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { ok: r.ok, j: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { ok: false, j: { error: "Couldn't reach Portal Juice. Check your connection." } };
  }
}

export default function AccountClient() {
  const a = useSyncExternalStore(subscribeAccount, getAccount, getServerAccount);
  const sp = useSearchParams();
  const err = sp.get("error");
  if (!a.ready) return <div className="mt-6 h-48 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" aria-hidden />;
  return (
    <div className="mx-auto max-w-md" data-testid="account-page">
      {err && ERRORS[err] ? <p className="mb-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">{ERRORS[err]}</p> : null}
      {a.user ? <SignedIn /> : <SignIn />}
    </div>
  );
}

function SignIn() {
  const a = useSyncExternalStore(subscribeAccount, getAccount, getServerAccount);
  const sp = useSearchParams();
  const router = useRouter();
  const next = sp.get("next") ?? "";
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const notes = useSyncExternalStore(subscribeNotes, getNotes, getServerNotes);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState("");
  const p = a.providers;
  const nextQ = next ? `?next=${encodeURIComponent(next)}` : "";

  async function done() {
    await refreshAccount();
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/account?signed=1");
  }
  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await post("/api/auth/email/start", { email, next });
    setBusy(false);
    if (r.ok) setSent(true);
    else setMsg(String(r.j.error ?? "Couldn't send the code."));
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await post("/api/auth/email/verify", { email, code });
    setBusy(false);
    if (r.ok) await done();
    else setMsg(String(r.j.error ?? "That code didn't work."));
  }
  async function privateAccount() {
    setBusy(true);
    const r = await post("/api/auth/device");
    setBusy(false);
    if (r.ok) await done();
    else setMsg(String(r.j.error ?? "Couldn't make the account."));
  }
  async function claim(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await post("/api/auth/link/claim", { code: devCode });
    setBusy(false);
    if (r.ok) await done();
    else setMsg(String(r.j.error ?? "That code didn't work."));
  }

  return (
    <div className="auth-panel p-5" data-testid="signin">
      <div className="portal-ring mx-auto mb-3 h-12 w-12" aria-hidden style={{ ["--glow" as string]: "#a855f7" }} />
      <h1 className="text-center font-display text-2xl font-black text-white">Sign in</h1>
      <p className="mt-1 text-center text-sm text-zinc-300">Save your picks, parlays, notes and streak, and keep them in sync on every device. Your picks stay private.</p>
      <p className="mt-1 text-center text-[12px] text-zinc-500">
        On this device now: {picks.length} {picks.length === 1 ? "pick" : "picks"} · {notes.length} {notes.length === 1 ? "note" : "notes"}. Signing in saves them to your account.
      </p>

      <div className="mt-4 space-y-2">
        {p.apple ? (
          <a href={`/api/auth/apple${nextQ}`} className="auth-btn auth-apple" data-testid="signin-apple">
            <AppleMark /> Sign in with Apple
          </a>
        ) : (
          <button type="button" disabled className="auth-btn auth-apple" data-testid="signin-apple" aria-describedby="apple-soon">
            <AppleMark /> Sign in with Apple
          </button>
        )}
        {!p.apple ? <p id="apple-soon" className="-mt-1 text-center text-[11px] text-zinc-500">Apple sign-in is coming soon.</p> : null}
        {p.google ? (
          <a href={`/api/auth/google${nextQ}`} className="auth-btn auth-google" data-testid="signin-google">
            <GoogleMark /> Continue with Google
          </a>
        ) : (
          <button type="button" disabled className="auth-btn auth-google" data-testid="signin-google">
            <GoogleMark /> Continue with Google
          </button>
        )}
        {!p.google ? <p className="-mt-1 text-center text-[11px] text-zinc-500">Google sign-in is coming soon.</p> : null}
      </div>

      <div className="my-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
        <span className="h-px flex-1 bg-white/10" /> or email <span className="h-px flex-1 bg-white/10" />
      </div>
      {!sent ? (
        <form onSubmit={sendCode} className="space-y-2">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="field w-full" autoComplete="email" disabled={!p.email} data-testid="signin-email" aria-label="Email" />
          <button type="submit" disabled={busy || !p.email} className="note-add w-full rounded-xl px-4 py-2.5 text-sm font-black text-white">
            Email me a code
          </button>
          {!p.email ? <p className="text-center text-[11px] text-zinc-500">Email sign-in is coming soon.</p> : null}
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-2">
          <p className="text-[13px] text-zinc-300">We sent a 6-digit code and a sign-in link to <b className="text-white">{email}</b>.</p>
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" className="field w-full text-center text-xl tracking-[0.4em]" aria-label="Code" />
          <button type="submit" disabled={busy || code.length !== 6} className="note-add w-full rounded-xl px-4 py-2.5 text-sm font-black text-white">
            Sign in
          </button>
          <button type="button" className="w-full text-[12px] text-zinc-400 underline" onClick={() => setSent(false)}>Use a different email</button>
        </form>
      )}

      <div className="my-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
        <span className="h-px flex-1 bg-white/10" /> no email <span className="h-px flex-1 bg-white/10" />
      </div>
      <form onSubmit={claim} className="flex gap-2">
        <input value={devCode} onChange={(e) => setDevCode(e.target.value.toUpperCase())} maxLength={9} placeholder="Code from your other device" className="field min-w-0 flex-1 uppercase tracking-widest" aria-label="Device code" data-testid="signin-devcode" />
        <button type="submit" disabled={busy || devCode.replace(/\W/g, "").length !== 8} className="shrink-0 rounded-xl border border-[color:var(--plus)]/60 px-3 text-sm font-black text-white" data-testid="signin-devcode-go">
          Join
        </button>
      </form>
      <button type="button" onClick={privateAccount} disabled={busy || !p.store} className="mt-2 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold text-zinc-200" data-testid="signin-private">
        Create a private account (no email)
      </button>
      <p className="mt-1 text-center text-[11px] text-zinc-500">Add your other devices with a one-time code. You can add email, Google or Apple later.</p>
      {msg ? <p className="mt-3 text-center text-sm text-[color:var(--minus)]" role="alert">{msg}</p> : null}
      <p className="mt-4 text-center text-[11px] text-zinc-500">Everything still works without an account. Nothing about you is shown publicly.</p>
    </div>
  );
}

function SignedIn() {
  const a = useSyncExternalStore(subscribeAccount, getAccount, getServerAccount);
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const notes = useSyncExternalStore(subscribeNotes, getNotes, getServerNotes);
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const u = a.user!;
  const p = a.providers;
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  async function save() {
    await syncNow({ full: true });
    setToast(getAccount().status === "ok" ? "Saved to your account" : getAccount().error ?? "Couldn't save. Trying again soon.");
  }
  async function addDevice() {
    const r = await post("/api/auth/link/start");
    setCode(r.ok ? String(r.j.code) : null);
    if (!r.ok) setToast(String(r.j.error ?? "Couldn't make a code."));
  }
  const when = a.lastSync ? new Date(a.lastSync).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }) : null;
  return (
    <div className="space-y-3" data-testid="signed-in">
      <div className="auth-panel p-5">
        <div className="flex items-center gap-3">
          <span className="acct-avatar relative">
            <span className="flex h-12 w-12 items-center justify-center rounded-full text-xl font-black text-white">{(u.name || u.email || "P")[0].toUpperCase()}</span>
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-black text-white">{u.name || u.email || "Private account"}</h1>
            <p className="truncate text-[12px] text-zinc-400">{u.email ?? "No email · signed in with a device code"}</p>
            <p className="text-[11px] text-zinc-500">Signed in with {u.providers.map((x) => (x === "device" ? "private account" : x[0].toUpperCase() + x.slice(1))).join(", ")}</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12px]" data-testid="sync-status">
          <span className={"mr-1.5 inline-block h-2 w-2 rounded-full align-middle " + (a.status === "ok" ? "bg-[color:var(--plus)]" : a.status === "syncing" ? "bg-cyan-400" : "bg-amber-400")} aria-hidden />
          {a.status === "syncing" ? "Syncing…" : a.status === "ok" ? `Synced${when ? ` at ${when}` : ""}` : a.status === "offline" ? "Offline. Changes sync when you're back." : a.status === "error" ? a.error ?? "Sync hiccup. Trying again." : "Ready"}
          <span className="text-zinc-500"> · {picks.length} picks · {notes.length} notes on this device</span>
        </div>
        <button type="button" onClick={save} className="note-add mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-black text-white" data-testid="save-data">
          ☁ Save my data now
        </button>
        <p className="mt-1 text-center text-[11px] text-zinc-500">Picks, parlays, notes, streak, starred games, your team and Leaders name. Your picks stay private.</p>
      </div>

      <div className="auth-panel p-4">
        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200">Add another device</h2>
        <p className="mt-1 text-[12px] text-zinc-400">On the other device, open Account → “Code from your other device”.</p>
        {code ? (
          <p className="mt-2 text-center font-mono text-3xl font-black tracking-[0.3em] text-[color:var(--plus)]" data-testid="device-code">{code.slice(0, 4)}-{code.slice(4)}</p>
        ) : null}
        <button type="button" onClick={addDevice} className="mt-2 w-full rounded-xl border border-[color:var(--plus)]/60 px-4 py-2 text-sm font-black text-white" data-testid="make-device-code">
          {code ? "New code" : "Show a one-time code"}
        </button>
        {code ? <p className="mt-1 text-center text-[11px] text-zinc-500">Works once, for 10 minutes.</p> : null}
        {(p.apple && !u.providers.includes("apple")) || (p.google && !u.providers.includes("google")) ? (
          <div className="mt-3 space-y-2">
            {p.apple && !u.providers.includes("apple") ? <a href="/api/auth/apple" className="auth-btn auth-apple"><AppleMark /> Add Sign in with Apple</a> : null}
            {p.google && !u.providers.includes("google") ? <a href="/api/auth/google" className="auth-btn auth-google"><GoogleMark /> Add Google</a> : null}
          </div>
        ) : null}
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={async () => { await signOut(); router.replace("/account"); }} className="flex-1 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-black text-white" data-testid="sign-out">
          Sign out
        </button>
        <button type="button" onClick={() => setDel(true)} className="flex-1 rounded-xl border border-red-500/50 px-4 py-2.5 text-sm font-black text-red-300" data-testid="delete-account">
          Delete account and cloud data
        </button>
      </div>
      <p className="text-center text-[11px] text-zinc-500">Signing out keeps everything on this device. <Link href="/lines/stats" className="underline">My stats</Link></p>
      {del ? <DeleteDialog onClose={() => setDel(false)} /> : null}
      {toast ? <div className="portal-toast stats-toast fixed bottom-24 left-1/2 z-[90] -translate-x-1/2 rounded-xl px-4 py-2 text-sm font-black text-white" role="status" data-testid="account-toast">{toast}</div> : null}
    </div>
  );
}

function DeleteDialog({ onClose }: { onClose: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    cancel.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  async function go() {
    setBusy(true);
    const r = await fetch("/api/account", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) }).catch(() => null);
    if (!r?.ok) {
      setBusy(false);
      setMsg("Couldn't delete right now. Try again.");
      return;
    }
    forget();
    location.assign("/account?deleted=1");
  }
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="del-title" className="reset-dialog w-full max-w-sm rounded-2xl p-5" onClick={(e) => e.stopPropagation()} data-testid="delete-dialog">
        <div className="reset-ring mx-auto mb-3 h-12 w-12 rounded-full" aria-hidden />
        <h2 id="del-title" className="text-center text-lg font-black text-white">Delete your account?</h2>
        <p className="mt-2 text-center text-[13px] leading-snug text-zinc-300">This deletes your account and everything saved in the cloud: picks, notes, stats and sign-ins. This device keeps its own copy. This can&apos;t be undone.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button ref={cancel} type="button" onClick={onClose} className="rounded-xl border border-white/25 bg-white/10 px-3 py-2.5 text-sm font-black text-white" data-testid="delete-cancel">Cancel</button>
          <button type="button" onClick={go} disabled={busy} className="rounded-xl bg-red-600 px-3 py-2.5 text-sm font-black text-white shadow-[0_0_16px_rgba(239,68,68,0.6)]" data-testid="delete-confirm">{busy ? "Deleting…" : "Delete"}</button>
        </div>
        {msg ? <p className="mt-2 text-center text-sm text-[color:var(--minus)]">{msg}</p> : null}
      </div>
    </div>
  );
}

function AppleMark() {
  return (
    <svg width="16" height="18" viewBox="0 0 814 1000" aria-hidden fill="currentColor">
      <path d="M788 341c-6 4-108 62-108 190 0 148 130 200 134 202-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-164-40c-77 0-104 41-167 41s-106-57-156-128C44 790 0 669 0 554 0 371 119 274 236 274c62 0 114 41 153 41 37 0 95-43 166-43 27 0 124 2 188 69zM554 157c29-35 50-83 50-131 0-7-1-14-2-19-48 2-104 32-138 72-27 30-52 79-52 127 0 7 1 15 2 17 3 1 8 1 13 1 43 0 97-29 127-67z" />
    </svg>
  );
}
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
