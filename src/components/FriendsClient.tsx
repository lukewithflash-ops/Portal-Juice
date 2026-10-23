"use client";

import { SkelRows } from "@/components/Skeleton";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import FriendFeed from "@/components/FriendFeed";
import { FriendName, PosFor } from "@/components/LivePosition";
import { usePositions } from "@/lib/positionsClient";
import { haptic, shareLink as shareSheet } from "@/lib/native";
import { ChatButton, SquadChatSheet, useSquadChats } from "@/components/SquadChat";

type Overview = {
  signedIn: boolean;
  me?: { handle: string; share: boolean; edited?: boolean } | null;
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
  const [add, setAdd] = useState("");
  const [squad, setSquad] = useState("");
  const [code, setCode] = useState(join ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const chats = useSquadChats();
  const [chat, setChat] = useState<{ id: string; name: string } | null>(null);
  const load = useCallback(async () => {
    const j = (await fetch("/api/friends", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ signedIn: false }))) as Overview;
    setO(j);
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
  const auto = params.get("go") === "1";
  const [peek, setPeek] = useState<{ kind: "squad"; name: string; size: number } | { kind: "friend"; handle: string } | null | undefined>(join ? undefined : null);
  const [dismissed, setDismissed] = useState(false);
  const [joining, setJoining] = useState(false);
  useEffect(() => {
    if (!join) return;
    fetch(`/api/friends?peek=${encodeURIComponent(join)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setPeek(j.invite ?? null))
      .catch(() => setPeek(null));
  }, [join]);
  const joinNow = useCallback(async () => {
    if (!join) return;
    setJoining(true);
    const ok = await act({ action: "join", code: join });
    setJoining(false);
    setDismissed(true);
    if (ok) setCode("");
    haptic(ok ? "success" : "error", ok ? 12 : [8, 40, 8]);
    // Drop ?join so a reload doesn't ask again.
    window.history.replaceState(null, "", "/friends");
  }, [join]);
  // Back from sign-in with ?go=1: finish the join without another tap.
  const joined = useRef(false);
  useEffect(() => {
    if (!join || !auto || joined.current || !o?.signedIn) return;
    joined.current = true;
    const t = setTimeout(joinNow, 0);
    return () => clearTimeout(t);
  }, [join, auto, o, joinNow]);
  const handles = [...new Set([...(o?.friends ?? []).map((f) => f.handle), ...(o?.squads ?? []).flatMap((x) => x.members), ...(o?.me ? [o.me.handle] : [])])];
  const pos = usePositions(handles);
  const sheetBody =
    join && !dismissed && !(auto && o?.signedIn) ? (
      <div data-layer="">
        <div className="sheet-scrim" onClick={() => setDismissed(true)} aria-hidden />
        <div role="dialog" aria-modal="true" aria-label="Join" className="sheet mx-auto max-w-lg" data-testid="join-sheet">
          {peek === undefined ? (
            <div className="skel h-24" />
          ) : peek === null ? (
            <>
              <h2 className="text-[17px] font-bold text-white">That invite expired</h2>
              <p className="mt-1 text-[13px] text-zinc-400">Ask for a fresh link or code.</p>
              <button type="button" onClick={() => setDismissed(true)} className="press mt-4 w-full rounded-2xl border border-white/20 py-3 text-[15px] font-bold text-white">OK</button>
            </>
          ) : (
            <>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{peek.kind === "squad" ? "Squad invite" : "Friend invite"}</p>
              <h2 className="mt-1 text-[22px] font-bold leading-tight text-white" data-testid="join-name">{peek.kind === "squad" ? peek.name : `@${peek.handle}`}</h2>
              <p className="tabular mt-1 text-[13px] text-zinc-400">{peek.kind === "squad" ? `${peek.size} member${peek.size === 1 ? "" : "s"} · W/L/P/open only, never stakes` : "See each other's picks live. W/L/P/open only."}</p>
              {o?.signedIn ? (
                <button type="button" disabled={joining} onClick={joinNow} className="press mt-4 w-full rounded-2xl bg-[color:var(--plus)] py-3 text-[15px] font-bold text-black disabled:opacity-60" data-testid="join-go">
                  {joining ? "Joining…" : peek.kind === "squad" ? "Join squad" : "Add friend"}
                </button>
              ) : (
                <Link href={`/account?next=${encodeURIComponent(`/friends?join=${join}&go=1`)}`} className="press mt-4 block w-full rounded-2xl bg-[color:var(--plus)] py-3 text-center text-[15px] font-bold text-black" data-testid="join-signin">
                  Join
                </Link>
              )}
              {!o?.signedIn ? <p className="mt-2 text-center text-[12px] text-zinc-500">Sign in once and you&apos;re in. Your handle is set up for you.</p> : null}
              <button type="button" onClick={() => setDismissed(true)} className="press mt-2 w-full py-2 text-[13px] font-semibold text-zinc-400">Not now</button>
            </>
          )}
        </div>
      </div>
    ) : null;
  // Portaled to <body> so the sheet sits above the tab bar, not inside the page's stacking layer.
  const sheet = sheetBody && typeof document !== "undefined" ? createPortal(sheetBody, document.body) : null;
  if (!o) return <SkelRows n={3} label="Loading squads" />;
  if (!o.signedIn) {
    return (
      <>
        <div className="panel rounded-2xl p-4 text-sm text-zinc-300" data-testid="friends-signin">
          Squads need an account so only people you add see your picks.{" "}
          <Link href={`/account?next=${encodeURIComponent(join ? `/friends?join=${join}&go=1` : "/friends")}`} className="font-black text-white underline">Sign in</Link>
          {join ? " and the invite finishes on its own." : "."}
        </div>
        {sheet}
      </>
    );
  }
  async function shareLink(c: string, what: string) {
    const url = linkFor(c);
    try {
      if ((await shareSheet({ title: "Portal Juice", text: what, url })) === "copied") setMsg("Link copied.");
    } catch {
      /* closed */
    }
  }
  return (
    <div className="space-y-5" data-testid="friends">
      <section className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3" data-testid="friends-me">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-white" data-testid="friends-handle-now">@{o.me?.handle}{o.me ? <PosFor handle={o.me.handle} map={pos} /> : null}</span>
          <Link href="/account" className="text-[12px] text-zinc-500 underline-offset-2 hover:underline">{o.me?.edited ? "Your handle" : "Change handle (once) in Account"}</Link>
        </span>
        {o.me ? (
          <label className="flex shrink-0 items-center gap-2 text-[12px] text-zinc-300">
            <input type="checkbox" checked={o.me.share} onChange={async (e) => {
                const on = e.target.checked;
                setO((cur) => (cur?.me ? { ...cur, me: { ...cur.me, share: on } } : cur));
                if (!(await act({ action: "share", on }, on ? "Friends can see all your open picks." : "Your open picks are hidden from friends. Your shared live position stays public."))) setO((cur) => (cur?.me ? { ...cur, me: { ...cur.me, share: !on } } : cur));
              }} data-testid="friends-share" />
            Friends see my open picks
          </label>
        ) : null}
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
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"><FriendName handle={f.handle} /><PosFor handle={f.handle} map={pos} /></span>
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
                    {chats.rows ? <ChatButton row={chats.rows.find((r) => r.id === s.id) ?? { ...s, unread: 0, mentions: 0 }} onOpen={() => setChat({ id: s.id, name: s.name })} /> : null}
                    <button type="button" onClick={() => shareLink(s.code, `Join my squad ${s.name} on Portal Juice`)} className="text-[12px] font-black text-purple-200">Invite</button>
                    <button type="button" onClick={() => setQr(qr === s.id ? null : s.id)} className="text-[12px] font-black text-white">QR</button>
                    <button type="button" onClick={() => act({ action: "squad-leave", id: s.id }, "Left the squad.")} className="text-[12px] font-bold text-zinc-400">Leave</button>
                  </div>
                  <ul className="mt-2 space-y-1" data-testid="squad-members">
                    {s.members.map((m) => (
                      <li key={m} className="flex flex-wrap items-center gap-1.5 text-[13px] text-zinc-300">
                        {m === o.me?.handle ? <span>@{m}</span> : <FriendName handle={m} className="font-normal text-zinc-200" />}
                        <PosFor handle={m} map={pos} />
                      </li>
                    ))}
                  </ul>
                  <p className="tabular mt-1 text-[11px] text-zinc-500">Code {s.code}</p>
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
      {sheet}
      {chat ? <SquadChatSheet squad={chat} onClose={() => { setChat(null); chats.reload(); }} /> : null}
    </div>
  );
}
