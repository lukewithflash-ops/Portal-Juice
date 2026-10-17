"use client";

import { useEffect, useState } from "react";

type Me = { handle: string; share: boolean; edited?: boolean } | null;

/** Your handle: made for you from your account, changeable once. */
export default function HandleEditor() {
  const [me, setMe] = useState<Me | undefined>(undefined);
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/friends", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { me?: Me }) => {
        setMe(j.me ?? null);
        setVal(j.me?.handle ?? "");
      })
      .catch(() => setMe(null));
  }, []);
  if (me === undefined) return <div className="auth-panel p-4"><div className="skel h-10" /></div>;
  if (!me) return null;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const r = await fetch("/api/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "handle", handle: val }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error ?? "That didn't work.");
    setMe(j.me ?? me);
    setEdit(false);
  }
  return (
    <div className="auth-panel p-4" data-testid="handle-editor">
      <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-200">Handle</h2>
      {edit ? (
        <form onSubmit={save} className="mt-2 flex gap-2">
          <span className="self-center text-zinc-400">@</span>
          <input value={val} onChange={(e) => setVal(e.target.value)} maxLength={16} className="field min-w-0 flex-1" aria-label="Handle" data-testid="handle-input" autoFocus />
          <button type="submit" className="note-add rounded-xl px-3 text-sm font-black text-white" data-testid="handle-save">Save</button>
        </form>
      ) : (
        <div className="mt-1 flex items-center gap-2">
          <span className="flex-1 text-[17px] font-bold text-white" data-testid="handle-now">@{me.handle}</span>
          {!me.edited ? (
            <button type="button" onClick={() => setEdit(true)} className="press rounded-lg border border-white/20 px-2.5 py-1 text-[12px] font-bold text-white" data-testid="handle-change">Change</button>
          ) : null}
        </div>
      )}
      <p className="mt-1 text-[12px] text-zinc-500">{me.edited ? "Squads, threads and live positions show this name. It has been changed once and is set." : "Made from your account so squads work with one tap. You can change it once."}</p>
      {err ? <p className="mt-1 text-[12px] text-[color:var(--minus)]" role="alert">{err}</p> : null}
    </div>
  );
}
