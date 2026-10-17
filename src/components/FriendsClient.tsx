"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import FriendFeed from "@/components/FriendFeed";

type Overview = {
  signedIn: boolean;
  me?: { handle: string; share: boolean } | null;
  friends?: { handle: string; share: boolean }[];
  requests?: string[];
  blocked?: string[];
  squads?: { id: string; name: string; code: string; mine: boolean; members: string[] }[];
  invite?: string | null;
};

const linkFor = (code: string) => `https://portaljuice.app/friends?join=${code}`;

function Qr({ text, label }: { text: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) QRCode.toCanvas(ref.current, text, { width: 168, margin: 1, color: { dark: "#0b0716", light: "#e9d5ff" } }).catch(() => {});
  }, [text]);
  return <canvas ref={ref} className="qr-box rounded-xl" aria-label={label} role="img" data-testid="qr" />;
}

export default function FriendsClient() {
  const params = useSearchParams();
  const join = params.get("join");
  const [o, setO] = useState<Overview | null>(null);
  const [handle, setHandle] = useState("");
  const [add, setAdd] = useState("");
  const [squad, setSquad] = useState("");
  const [code, setCode] = useState(join ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const j = (await fetch("/api/friends", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ signedIn: false }))) as Overview;
    setO(j);
    if (j.me?.handle) setHandle(j.me.handle);
    else {
      try {
        setHandle(localStorage.getItem("pj-leader-handle") || localStorage.getItem("pj-handle") || "");
      } catch {
        /* private mode */
      }
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  async function act(body: Record<string, unknown>, ok?: string) {
    setErr(null);
    setMsg(null);
    const r = await fetch("/api/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(j.error ?? "That didn't work.");
      return false;
    }
    setO({ signedIn: true, ...j });
    setMsg(j.joined ?? (j.status === "requested" ? "Request sent." : ok ?? "Done."));
    return true;
  }
  const joined = useRef(false);
  useEffect(() => {
    if (!join || joined.current || !o?.signedIn || !o.me) return;
    joined.current = true;
    const t = setTimeout(() => act({ action: "join", code: join }), 0);
    return () => clearTimeout(t);
  }, [join, o]);
  if (!o) return <p className="text-sm text-zinc-400">Loading…</p>;
  if (!o.signedIn) {
    return (
      <div className="panel rounded-2xl p-4 text-sm text-zinc-300" data-testid="friends-signin">
        Friends and squads need an account so only people you add can see your picks.{" "}
        <Link href={`/account${join ? `?next=${encodeURIComponent("/friends?join=" + join)}` : ""}`} className="font-black text-white underline">Sign in</Link>
        {join ? " and your invite will finish here." : "."}
      </div>
    );
  }
  async function shareLink(c: string, what: string) {
    const url = linkFor(c);
    try {
      if (navigator.share) await navigator.share({ title: "Portal Juice", text: what, url });
      else {
        await navigator.clipboard.writeText(url);
        setMsg("Link copied.");
      }
    } catch {
      /* closed */
    }
  }
  return (
    <div className="space-y-5" data-testid="friends">
      <section className="quest-panel rounded-2xl p-4">
        <h2 className="text-xs font-black uppercase tracking-[0.18em] text-purple-200">Your handle</h2>
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); act({ action: "handle", handle }, "Handle saved."); }}>
          <span className="self-center text-zinc-400">@</span>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={16} className="field min-w-0 flex-1" aria-label="Handle" data-testid="friends-handle" />
          <button type="submit" className="note-add rounded-xl px-3 text-sm font-black text-white" data-testid="friends-handle-save">{o.me ? "Update" : "Claim"}</button>
        </form>
        {o.me ? (
          <label className="mt-3 flex items-center gap-2 text-[13px] text-zinc-200">
            <input type="checkbox" checked={o.me.share} onChange={(e) => act({ action: "share", on: e.target.checked }, e.target.checked ? "Friends can see your picks." : "Your picks are hidden from friends.")} data-testid="friends-share" />
            Share my picks with friends and squads (W/L/P/open only, never stakes)
          </label>
        ) : (
          <p className="mt-2 text-[12px] text-zinc-400">Claim a handle so friends can find you.</p>
        )}
      </section>
      {o.me ? (
        <>
          <section className="panel rounded-2xl p-4">
            <h2 className="text-xs font-black uppercase tracking-[0.18em] text-purple-200">Add friends</h2>
            <form className="mt-2 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await act({ action: "add", handle: add })) setAdd(""); }}>
              <input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="@handle" className="field min-w-0 flex-1" aria-label="Friend handle" data-testid="friends-add" />
              <button type="submit" className="note-add rounded-xl px-3 text-sm font-black text-white" data-testid="friends-add-btn">Add</button>
            </form>
            {o.invite ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
                <button type="button" onClick={() => shareLink(o.invite!, "Add me on Portal Juice")} className="rounded-lg border border-purple-400/60 px-3 py-1.5 font-black text-purple-100" data-testid="friends-invite">Share invite link</button>
                <button type="button" onClick={() => setQr(qr === "me" ? null : "me")} className="rounded-lg border border-white/20 px-3 py-1.5 font-black text-white">QR</button>
                <span className="text-zinc-500">Code {o.invite}</span>
              </div>
            ) : null}
            {qr === "me" && o.invite ? <div className="mt-3"><Qr text={linkFor(o.invite)} label="Invite QR" /></div> : null}
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); act({ action: "join", code }); }}>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Invite or squad code" className="field min-w-0 flex-1" aria-label="Invite code" data-testid="friends-code" />
              <button type="submit" className="rounded-xl border border-white/20 px-3 text-sm font-black text-white">Join</button>
            </form>
          </section>
          {o.requests?.length ? (
            <section className="panel rounded-2xl p-4" data-testid="friends-requests">
              <h2 className="text-xs font-black uppercase tracking-[0.18em] text-purple-200">Requests</h2>
              <ul className="mt-2 space-y-1.5">
                {o.requests.map((h) => (
                  <li key={h} className="flex items-center gap-2 text-sm">
                    <b className="flex-1 text-white">@{h}</b>
                    <button type="button" onClick={() => act({ action: "accept", handle: h }, `You and @${h} are friends.`)} className="rounded-lg bg-[color:var(--plus)] px-2 py-1 text-[12px] font-black text-black" data-testid="friends-accept">Accept</button>
                    <button type="button" onClick={() => act({ action: "decline", handle: h })} className="rounded-lg border border-white/20 px-2 py-1 text-[12px] font-black text-white">Decline</button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="panel rounded-2xl p-4">
            <h2 className="text-xs font-black uppercase tracking-[0.18em] text-purple-200">Friends · {o.friends?.length ?? 0}</h2>
            <ul className="mt-2 space-y-1.5" data-testid="friends-list">
              {(o.friends ?? []).map((f) => (
                <li key={f.handle} className="flex items-center gap-2 text-sm">
                  <b className="flex-1 text-white">@{f.handle}</b>
                  {!f.share ? <span className="text-[11px] text-zinc-500">not sharing</span> : null}
                  <button type="button" onClick={() => act({ action: "remove", handle: f.handle }, "Removed.")} className="text-[12px] font-bold text-zinc-400">Remove</button>
                  <button type="button" onClick={() => act({ action: "block", handle: f.handle }, "Blocked.")} className="text-[12px] font-bold text-red-300">Block</button>
                </li>
              ))}
            </ul>
            {o.blocked?.length ? (
              <p className="mt-2 text-[12px] text-zinc-500">
                Blocked:{" "}
                {o.blocked.map((h) => (
                  <button key={h} type="button" onClick={() => act({ action: "unblock", handle: h }, "Unblocked.")} className="mr-2 underline">@{h} (unblock)</button>
                ))}
              </p>
            ) : null}
          </section>
          <section className="panel rounded-2xl p-4">
            <h2 className="text-xs font-black uppercase tracking-[0.18em] text-purple-200">Squads</h2>
            <form className="mt-2 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await act({ action: "squad-create", name: squad }, "Squad created.")) setSquad(""); }}>
              <input value={squad} onChange={(e) => setSquad(e.target.value)} placeholder="Squad name" maxLength={24} className="field min-w-0 flex-1" aria-label="Squad name" data-testid="squad-name" />
              <button type="submit" className="note-add rounded-xl px-3 text-sm font-black text-white" data-testid="squad-create">Create</button>
            </form>
            <ul className="mt-3 space-y-3" data-testid="squads">
              {(o.squads ?? []).map((s) => (
                <li key={s.id} className="rounded-xl border border-white/10 p-3">
                  <div className="flex items-center gap-2">
                    <b className="flex-1 text-white">{s.name}</b>
                    <button type="button" onClick={() => shareLink(s.code, `Join my squad ${s.name} on Portal Juice`)} className="text-[12px] font-black text-purple-200">Invite</button>
                    <button type="button" onClick={() => setQr(qr === s.id ? null : s.id)} className="text-[12px] font-black text-white">QR</button>
                    <button type="button" onClick={() => act({ action: "squad-leave", id: s.id }, "Left the squad.")} className="text-[12px] font-bold text-zinc-400">Leave</button>
                  </div>
                  <p className="mt-1 text-[12px] text-zinc-400">{s.members.map((m) => "@" + m).join(" · ")} · code {s.code}</p>
                  {qr === s.id ? <div className="mt-2"><Qr text={linkFor(s.code)} label={`${s.name} QR`} /></div> : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
      {msg ? <p className="text-sm font-bold text-[color:var(--plus)]" role="status" data-testid="friends-msg">{msg}</p> : null}
      {err ? <p className="text-sm font-bold text-[color:var(--minus)]" role="alert" data-testid="friends-err">{err}</p> : null}
      {o.me ? <FriendFeed /> : null}
    </div>
  );
}
