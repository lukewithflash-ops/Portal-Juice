"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { refreshAccount } from "@/lib/syncClient";

/** The emailed link lands here. One tap finishes sign-in (a POST, so link scanners can't use it up). */
export default function VerifyEmail() {
  const sp = useSearchParams();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const email = sp.get("e") ?? "";
  async function finish() {
    setBusy(true);
    const r = await fetch("/api/auth/email/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, link: sp.get("t") }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { error?: string }) : { error: "Couldn't reach Portal Juice." };
    if (!r?.ok) {
      setMsg(j.error ?? "That link didn't work.");
      setBusy(false);
      return;
    }
    await refreshAccount();
    const next = sp.get("next");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/account?signed=1");
  }
  return (
    <div className="auth-panel mx-auto mt-6 max-w-md p-5 text-center">
      <h1 className="font-display text-xl font-black text-white">Finish signing in</h1>
      <p className="mt-1 text-sm text-zinc-400">{email}</p>
      <button type="button" onClick={finish} disabled={busy} className="note-add mt-4 w-full rounded-xl px-4 py-3 text-sm font-black text-white">
        {busy ? "Signing in…" : "Sign in to Portal Juice"}
      </button>
      {msg ? <p className="mt-3 text-sm text-[color:var(--minus)]">{msg}</p> : null}
    </div>
  );
}
