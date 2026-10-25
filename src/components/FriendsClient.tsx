"use client";

import { SkelRows } from "@/components/Skeleton";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import FriendFeed from "@/components/FriendFeed";
import { FriendName, PosFor, Sheet } from "@/components/LivePosition";
import { usePositions } from "@/lib/positionsClient";
import { haptic, shareLink as shareSheet } from "@/lib/native";
import { SquadChatSheet, useSquadChats, ago } from "@/components/SquadChat";
import { Avatar } from "@/components/Cosmetics";
import "@/components/squads.css";

type Overview = {
  signedIn: boolean;
  me?: { handle: string; share: boolean; edited?: boolean } | null;
  friends?: { handle: string; share: boolean }[];
  requests?: string[];
  blocked?: string[];
  squads?: { id: string; name: string; code: string; mine: boolean; dm?: boolean; members: string[] }[];
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
  const [code, setCode] = useState(join ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const chats = useSquadChats();
  const [chat, setChat] = useState<{ id: string; name: string } | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<string[]>([]);
  const [compose, setCompose] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  useEffect(() => {
    const s = q.trim().replace(/^@/, "");
    if (s.length < 2) {
      const t = setTimeout(() => setFound([]), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      fetch(`/api/friends?q=${encodeURIComponent(s)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => setFound(j.people ?? [])).catch(() => {});
    }, 220);
    return () => clearTimeout(t);
  }, [q]);
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
  const me = o.me?.handle ?? "";
  const friendSet = new Set((o.friends ?? []).map((f) => f.handle.toLowerCase()));
  const titleOf = (s: { name: string; dm?: boolean; members: string[] }) => (s.dm ? s.members.find((m) => m !== me) ?? s.name : s.name);
  const convos = (o.squads ?? [])
    .map((s) => ({ ...s, row: chats.rows?.find((r) => r.id === s.id) }))
    .sort((a, b) => (b.row?.last?.ts ?? 0) - (a.row?.last?.ts ?? 0));
  const ql = q.trim().replace(/^@/, "").toLowerCase();
  const shownConvos = ql ? convos.filter((c) => titleOf(c).toLowerCase().includes(ql) || c.members.some((m) => m.toLowerCase().includes(ql))) : convos;
  const shownFriends = (o.friends ?? []).filter((f) => !ql || f.handle.toLowerCase().includes(ql));
  const strangers = found.filter((h) => h.toLowerCase() !== me.toLowerCase() && !friendSet.has(h.toLowerCase()));
  async function openDm(h: string) {
    haptic("light");
    const r = await fetch("/api/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "dm", handle: h }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error ?? "Couldn't open that chat.");
    setO({ signedIn: true, ...j });
    chats.reload();
    setChat({ id: j.open.id, name: h });
  }
  return (
    <div className="ig space-y-4" data-testid="friends">
      <section className="flex items-center gap-3" data-testid="friends-me">
        {o.me ? <Avatar handle={o.me.handle} size={40} /> : null}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 text-[16px] font-bold text-white" data-testid="friends-handle-now">@{o.me?.handle}{o.me ? <PosFor handle={o.me.handle} map={pos} /> : null}</span>
          {o.me ? (
            <label className="mt-0.5 flex items-center gap-1.5 text-[12px] text-zinc-400">
              <input type="checkbox" checked={o.me.share} onChange={async (e) => {
                  const on = e.target.checked;
                  setO((cur) => (cur?.me ? { ...cur, me: { ...cur.me, share: on } } : cur));
                  if (!(await act({ action: "share", on }, on ? "Friends can see all your open picks." : "Your open picks are hidden from friends. Your shared live position stays public."))) setO((cur) => (cur?.me ? { ...cur, me: { ...cur.me, share: !on } } : cur));
                }} data-testid="friends-share" />
              Friends see my open picks
            </label>
          ) : null}
        </span>
        {o.me ? (
          <button type="button" onClick={() => { haptic("light"); setCompose(true); }} className="ig-new press" aria-label="New message" data-testid="ig-new">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>
          </button>
        ) : null}
      </section>
      {o.me ? (
        <>
          <div className="ig-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search people and chats" autoCapitalize="none" autoCorrect="off" spellCheck={false} data-testid="ig-search" />
            {q ? <button type="button" onClick={() => setQ("")} className="text-[13px] font-semibold text-zinc-400">Clear</button> : null}
          </div>
          {shownFriends.length ? (
            <div className="ig-strip" data-testid="ig-strip">
              {shownFriends.map((f) => (
                <button key={f.handle} type="button" onClick={() => openDm(f.handle)} className="ig-strip-item press" data-testid="ig-strip-item">
                  <span className="ig-ring"><Avatar handle={f.handle} size={56} /></span>
                  <span className="ig-strip-name">{f.handle}</span>
                  <PosFor handle={f.handle} map={pos} />
                </button>
              ))}
            </div>
          ) : null}
          {ql.length >= 2 && strangers.length ? (
            <section data-testid="ig-found">
              <h2 className="ig-h">More people</h2>
              <ul>
                {strangers.map((h) => (
                  <li key={h} className="ig-row">
                    <Avatar handle={h} size={44} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">{h}</span>
                    <button type="button" onClick={() => act({ action: "add", handle: h })} className="ig-pill press" data-testid="ig-add">Add</button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {o.requests?.length ? (
            <section data-testid="friends-requests">
              <h2 className="ig-h">Requests</h2>
              <ul>
                {o.requests.map((h) => (
                  <li key={h} className="ig-row">
                    <Avatar handle={h} size={44} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">{h}<span className="block text-[12px] font-normal text-zinc-400">wants to be friends</span></span>
                    <button type="button" onClick={() => act({ action: "accept", handle: h }, `You and @${h} are friends.`)} className="ig-pill ig-pill-on press" data-testid="friends-accept">Accept</button>
                    <button type="button" onClick={() => act({ action: "decline", handle: h })} className="ig-pill press">Delete</button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section>
            <h2 className="ig-h">Messages</h2>
            {!shownConvos.length ? (
              <div className="ig-empty" data-testid="ig-empty">
                {ql ? <p>No chats match.</p> : (
                  <>
                    <p className="text-[15px] font-bold text-white">No chats yet</p>
                    <p>{o.friends?.length ? "Tap a friend above to start one." : "Send your invite link. When a friend joins, you can chat in one tap."}</p>
                    {o.invite ? <button type="button" onClick={() => shareLink(o.invite!, "Add me on Portal Juice")} className="ig-pill ig-pill-on press mt-3" data-testid="friends-invite">Share invite link</button> : null}
                  </>
                )}
              </div>
            ) : (
              <ul data-testid="squads">
                {shownConvos.map((s) => {
                  const r = s.row;
                  const last = r?.last;
                  const title = titleOf(s);
                  const others = s.members.filter((m) => m !== me);
                  return (
                    <li key={s.id} data-testid="ig-convo">
                      <div className="ig-row">
                        <button type="button" onClick={() => { haptic("light"); setChat({ id: s.id, name: title }); }} className="flex min-w-0 flex-1 items-center gap-3 text-left" data-testid="squad-chat-open">
                          {s.dm || others.length <= 1 ? <Avatar handle={others[0] ?? me} size={52} /> : (
                            <span className="ig-stack"><Avatar handle={others[0]} size={38} /><Avatar handle={others[1]} size={38} /></span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-[15px] ${r?.unread ? "font-bold text-white" : "font-semibold text-zinc-100"}`}>{title}</span>
                            <span className={`block truncate text-[13px] ${r?.unread ? "font-semibold text-white" : "text-zinc-400"}`}>
                              {last ? `${last.handle === me ? "You: " : s.dm ? "" : `${last.handle}: `}${last.text}` : s.dm ? "Say hi" : `${s.members.length} member${s.members.length === 1 ? "" : "s"} · tap to chat`}
                              {last ? <span className="text-zinc-500"> · {ago(last.ts)}</span> : null}
                            </span>
                          </span>
                          {r?.unread ? <span className="ig-dot" aria-label={`${r.unread} unread`} data-testid="ig-unread" /> : null}
                        </button>
                        <button type="button" onClick={() => setMenu(menu === s.id ? null : s.id)} className="ig-more press" aria-label="Chat options">⋯</button>
                      </div>
                      {menu === s.id ? (
                        <div className="ig-menu">
                          {!s.dm ? <button type="button" onClick={() => shareLink(s.code, `Join my squad ${s.name} on Portal Juice`)} className="ig-pill ig-pill-on press">Invite link</button> : null}
                          {!s.dm ? <button type="button" onClick={() => setQr(qr === s.id ? null : s.id)} className="ig-pill press">QR</button> : null}
                          <button type="button" onClick={() => act({ action: "squad-leave", id: s.id }, s.dm ? "Chat removed." : "Left the squad.")} className="ig-pill press">{s.dm ? "Delete chat" : "Leave"}</button>
                          {!s.dm ? <div className="mt-2 w-full space-y-1" data-testid="squad-members">{s.members.map((m) => <div key={m} className="flex flex-wrap items-center gap-1.5 text-[13px] text-zinc-300">{m === me ? <span>@{m}</span> : <FriendName handle={m} className="font-normal text-zinc-200" />}<PosFor handle={m} map={pos} /></div>)}</div> : null}
                          {qr === s.id ? <div className="mt-2"><Qr text={linkFor(s.code)} label={`${s.name} QR`} /></div> : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <details className="ig-details">
            <summary>Invite &amp; friends</summary>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {o.invite ? <button type="button" onClick={() => shareLink(o.invite!, "Add me on Portal Juice")} className="ig-pill ig-pill-on press">Share my invite link</button> : null}
              {o.invite ? <button type="button" onClick={() => setQr(qr === "me" ? null : "me")} className="ig-pill press">QR</button> : null}
            </div>
            {qr === "me" && o.invite ? <div className="mt-3"><Qr text={linkFor(o.invite)} label="Invite QR" /></div> : null}
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); act({ action: "join", code }); }}>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Got a code? Paste it" className="field min-w-0 flex-1" aria-label="Invite code" data-testid="friends-code" />
              <button type="submit" className="ig-pill press">Join</button>
            </form>
            <ul className="mt-3 space-y-1.5" data-testid="friends-list">
              {(o.friends ?? []).map((f) => (
                <li key={f.handle} className="flex items-center gap-2 text-sm">
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"><FriendName handle={f.handle} /></span>
                  {!f.share ? <span className="text-[11px] text-zinc-500">not sharing</span> : null}
                  <button type="button" onClick={() => act({ action: "remove", handle: f.handle }, "Removed.")} className="text-[12px] font-bold text-zinc-400">Remove</button>
                  <button type="button" onClick={() => act({ action: "block", handle: f.handle }, "Blocked.")} className="text-[12px] font-bold text-red-300">Block</button>
                </li>
              ))}
            </ul>
            {o.blocked?.length ? (
              <p className="mt-2 text-[12px] text-zinc-500">
                Blocked:{" "}
                {o.blocked.map((h) => <button key={h} type="button" onClick={() => act({ action: "unblock", handle: h }, "Unblocked.")} className="mr-2 underline">@{h} (unblock)</button>)}
              </p>
            ) : null}
            <Link href="/account" className="mt-2 block text-[12px] text-zinc-500">{o.me?.edited ? "Your handle" : "Change handle (once) in Account"}</Link>
          </details>
        </>
      ) : null}
      {msg ? <p className="text-sm font-bold text-[color:var(--plus)]" role="status" data-testid="friends-msg">{msg}</p> : null}
      {err ? <p className="text-sm font-bold text-[color:var(--minus)]" role="alert" data-testid="friends-err">{err}</p> : null}
      {o.me ? <FriendFeed /> : null}
      {sheet}
      {compose && o.me ? (
        <NewChat friends={(o.friends ?? []).map((f) => f.handle)} invite={o.invite ?? null} onShare={() => o.invite && shareLink(o.invite, "Add me on Portal Juice")} onClose={() => setCompose(false)} onOpen={(id, name, j) => { setCompose(false); setO({ ...j, signedIn: true }); chats.reload(); setChat({ id, name }); }} />
      ) : null}
      {chat ? <SquadChatSheet squad={chat} onClose={() => { setChat(null); chats.reload(); }} /> : null}
    </div>
  );
}

/** New message: tap friends (no handle typing). One person = DM, several = a group squad. */
function NewChat({ friends, invite, onShare, onClose, onOpen }: { friends: string[]; invite: string | null; onShare: () => void; onClose: () => void; onOpen: (id: string, name: string, j: Overview) => void }) {
  const [f, setF] = useState("");
  const [pick, setPick] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const list = friends.filter((h) => !f || h.toLowerCase().includes(f.toLowerCase().replace(/^@/, "")));
  async function go() {
    if (!pick.length) return;
    setBusy(true);
    setErr(null);
    const body = pick.length === 1 ? { action: "dm", handle: pick[0] } : { action: "squad-with", name: name.trim() || pick.slice(0, 3).join(", ").slice(0, 24), handles: pick };
    const r = await fetch("/api/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "That didn't work.");
    haptic("success", 12);
    onOpen(j.open.id, pick.length === 1 ? pick[0] : j.open.name, j);
  }
  return (
    <Sheet label="New message" onClose={onClose} testid="ig-compose">
      <div className="flex items-center justify-between pb-2">
        <button type="button" onClick={onClose} className="text-[14px] font-semibold text-zinc-400">Cancel</button>
        <h2 className="text-[16px] font-bold text-white">New message</h2>
        <button type="button" disabled={!pick.length || busy} onClick={go} className="text-[14px] font-bold text-[color:var(--portal-green)] disabled:opacity-40" data-testid="ig-compose-go">{pick.length > 1 ? "Create" : "Chat"}</button>
      </div>
      <div className="ig-search"><span className="text-[14px] font-semibold text-zinc-400">To:</span><input value={f} onChange={(e) => setF(e.target.value)} placeholder="Search" aria-label="Search friends" autoCapitalize="none" autoCorrect="off" /></div>
      {pick.length > 1 ? <input value={name} onChange={(e) => setName(e.target.value.slice(0, 24))} placeholder="Name the group (optional)" className="field mt-2 w-full" aria-label="Group name" data-testid="ig-group-name" /> : null}
      <ul className="mt-2 max-h-[50dvh] overflow-y-auto overscroll-contain">
        {!friends.length ? (
          <li className="ig-empty">
            <p className="text-[15px] font-bold text-white">No friends here yet</p>
            <p>Send your invite link. Once they tap it, they show up here.</p>
            {invite ? <button type="button" onClick={onShare} className="ig-pill ig-pill-on press mt-3">Share invite link</button> : null}
          </li>
        ) : list.map((h) => {
          const on = pick.includes(h);
          return (
            <li key={h}>
              <button type="button" onClick={() => { haptic("light"); setPick((p) => (on ? p.filter((x) => x !== h) : [...p, h])); }} className="ig-row w-full text-left" data-testid="ig-pick">
                <Avatar handle={h} size={44} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">{h}</span>
                <span className={`ig-check ${on ? "on" : ""}`} aria-hidden>{on ? "✓" : ""}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {err ? <p className="mt-2 text-[12px] font-bold text-[color:var(--minus)]" role="alert">{err}</p> : null}
    </Sheet>
  );
}
