"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Avatar, StyledName, fontClass } from "@/components/Cosmetics";
import { FREE_EMOTES, emoteGlyph, itemOf, type Look } from "@/lib/coinsCore";
import { getPicks, getServerPicks, restorePicks, subscribe } from "@/lib/pickStore";
import { haptic } from "@/lib/native";
import type { Pick, Sport } from "@/lib/types";

type SharedPick = { subject: string; line: number; market: string | null; selection: "Over" | "Under" | null; sport: Sport; plus?: boolean };
type Msg = { id: string; handle: string; text: string; ts: number; kind: "msg" | "sys"; mentions: string[]; rx: Record<string, number>; look?: Look; pick?: SharedPick; mine?: boolean; squad?: boolean; atMe?: boolean };

/* Unread count shared between the floating button and the game's Chat tab. */
let unreadN = 0;
const subs = new Set<() => void>();
const setUnread = (n: number) => {
  if (n === unreadN) return;
  unreadN = n;
  subs.forEach((f) => f());
};
const subUnread = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};
export const useGameChatUnread = () => useSyncExternalStore(subUnread, () => unreadN, () => 0);
export const openGameChat = () => window.dispatchEvent(new Event("pj:gamechat-open"));

const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const pickLabel = (p: SharedPick) => `${p.subject} ${p.selection ? (p.plus ? `${p.line + 0.5}+` : `${p.selection === "Over" ? "o" : "u"}${p.line}`) : p.line > 0 ? `+${p.line}` : p.line}${p.market ? ` ${p.market}` : ""}`;
const REPORT_REASONS = ["Hate or slurs", "Harassment", "Spam or scam", "Sexual", "Other"];

export default function GameChatDock({ league, id, label }: { league: string; id: string; label: string }) {
  const base = `/api/gamechat/${encodeURIComponent(league)}/${encodeURIComponent(id)}`;
  const seenKey = `pj-gc-seen:${league}:${id}`;
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [me, setMe] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [room, setRoom] = useState<"all" | "squad">("all");
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [owned, setOwned] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);
  const unread = useGameChatUnread();
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const myLegs = picks.filter((p) => p.gameId === id && (!p.league || p.league === league) && !p.tailFrom).slice(0, 8);

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2600);
  };

  const load = useCallback(async () => {
    const j = await fetch(base, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!j) return;
    if (!j.enabled) {
      setEnabled(false);
      setMsgs([]);
      return;
    }
    setMsgs(j.msgs);
    setMe(j.me);
    setSignedIn(j.signedIn);
  }, [base]);

  // Poll: every 2s while open, every 12s closed (for the badge). Paused when the tab is hidden.
  useEffect(() => {
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!document.hidden) await load();
      if (!stop) t = setTimeout(tick, open ? 2000 : 12000);
    };
    t = setTimeout(tick, 0);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [load, open]);

  // Keep the live score in view above the sheet: bring the scoreboard (or the title) up under the header.
  useEffect(() => {
    if (!open) return;
    const el = document.querySelector(".tv-hero, .race-hero, h1");
    if (!el) return;
    const chrome = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--chrome-h")) || 100;
    const y = el.getBoundingClientRect().top + window.scrollY - chrome - 6;
    if (Math.abs(y - window.scrollY) > 8) window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }, [open]);

  useEffect(() => {
    const f = () => setOpen(true);
    window.addEventListener("pj:gamechat-open", f);
    return () => window.removeEventListener("pj:gamechat-open", f);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetch("/api/coins", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setOwned([...new Set(((j.inventory ?? []) as { item: string }[]).map((x) => x.item).filter((i) => itemOf(i)?.kind === "emote"))]))
      .catch(() => {});
  }, [open]);

  // Unread: messages from others since this game's chat was last open.
  useEffect(() => {
    if (!msgs) return;
    const last = msgs.length ? msgs[msgs.length - 1].ts : 0;
    if (open) {
      try {
        localStorage.setItem(seenKey, String(Math.max(last, Date.now())));
      } catch {}
      setUnread(0);
      return;
    }
    let seen = 0;
    try {
      seen = Number(localStorage.getItem(seenKey)) || 0;
    } catch {}
    setUnread(seen ? msgs.filter((m) => m.ts > seen && !m.mine).length : 0);
  }, [msgs, open, seenKey]);

  useEffect(() => () => setUnread(0), []);

  useEffect(() => {
    if (open && atBottom.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs, open, room]);

  const shown = (msgs ?? []).filter((m) => room === "all" || m.mine || m.squad);
  const emotes = [...FREE_EMOTES.map((e) => e.id), ...owned];
  const handles = [...new Set((msgs ?? []).filter((m) => m.kind === "msg" && !m.mine).map((m) => m.handle).reverse())];
  const q = /@([A-Za-z0-9_]*)$/.exec(text)?.[1];
  const sugg = q !== undefined ? handles.filter((h) => h.toLowerCase().startsWith(q.toLowerCase())).slice(0, 5) : [];

  async function postJson(body: unknown) {
    const r = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, status: r.status, j: (await r.json().catch(() => ({}))) as { error?: string; join?: boolean } };
  }

  async function send(e?: React.FormEvent, pick?: SharedPick) {
    e?.preventDefault();
    const t = text.trim();
    if (!t && !pick) return;
    setErr(null);
    if (!pick) setText("");
    const r = await postJson({ text: pick ? t : t, pick });
    if (!r.ok) {
      if (r.status === 401) setSignedIn(false);
      setErr(r.j.error ?? "Didn't send.");
      if (!pick) setText(t);
      return;
    }
    if (pick) {
      setText("");
      setSharing(false);
    }
    haptic("light");
    atBottom.current = true;
    load();
  }

  async function join() {
    setBusy(true);
    const r = await fetch("/api/auth/device", { method: "POST" }).then((x) => x.ok).catch(() => false);
    setBusy(false);
    if (!r) return setErr("Couldn't make your account. Try More → Account.");
    haptic("success");
    flash("You're in. Your account name shows in chat.");
    load();
  }

  async function react(m: Msg, emote: string) {
    setMenu(null);
    if (!signedIn) return setErr("Join to react.");
    haptic("light");
    setMsgs((cur) => cur?.map((x) => (x.id === m.id ? { ...x, rx: { ...x.rx, [emote]: (x.rx[emote] ?? 0) + 1 } } : x)) ?? cur);
    await postJson({ react: { id: m.id, emote } });
  }

  async function report(m: Msg, reason: string) {
    setReportFor(null);
    setMenu(null);
    setMsgs((cur) => cur?.filter((x) => x.id !== m.id) ?? cur);
    const r = await postJson({ report: { id: m.id, reason } });
    flash(r.ok ? "Reported. Thanks, we'll review it." : "Hidden. The report didn't go through.");
  }

  async function block(m: Msg) {
    setMenu(null);
    if (!confirm(`Block @${m.handle}? You won't see their messages anywhere.`)) return;
    setMsgs((cur) => cur?.filter((x) => x.handle !== m.handle) ?? cur);
    const r = await postJson({ block: { id: m.id } });
    flash(r.ok ? `Blocked @${m.handle}.` : "Couldn't block. Try again.");
  }

  function tail(m: Msg) {
    if (!m.pick) return;
    const p = m.pick;
    const now = new Date().toISOString();
    const row: Pick = { id: crypto.randomUUID(), sport: p.sport, subject: p.subject, line: p.line, odds: 0, stake: 0, book: `Tailed from @${m.handle}`, date: new Date().toLocaleDateString("en-CA"), status: "open", createdAt: now, league, gameId: id, market: p.market ?? undefined, selection: p.selection, tailFrom: m.handle, plus: p.plus };
    restorePicks([row]);
    haptic("success");
    flash(`Tailed @${m.handle}: ${p.subject} is in your Log.`);
  }

  const share = (p: Pick) => send(undefined, { subject: p.subject, line: p.line, market: p.market ?? null, selection: p.selection ?? null, sport: p.sport, plus: p.plus });

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => {
            haptic("light");
            setOpen(true);
          }}
          className="gc-fab press fixed bottom-[calc(var(--tabbar)+1rem)] left-3 z-40 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-black text-white"
          aria-label={`Open game chat${unread ? `, ${unread} unread` : ""}`}
          data-testid="gamechat-open"
        >
          <span aria-hidden>💬</span> Chat
          {unread ? <span className="unread-dot" data-testid="gamechat-unread">{unread > 9 ? "9+" : unread}</span> : null}
        </button>
      ) : null}
      {open ? (
        <div role="dialog" aria-label={`${label} chat`} className="gc-sheet fixed inset-x-0 bottom-[var(--tabbar)] z-50 mx-auto flex max-w-lg flex-col lg:right-4 lg:left-auto lg:bottom-4 lg:w-[26rem]" data-testid="gamechat">
          <div className="flex items-center gap-2 px-3 pt-2.5">
            <span className="gc-live-dot" aria-hidden />
            <h2 className="min-w-0 flex-1 truncate text-[15px] font-black text-white">{label} chat</h2>
            <button type="button" onClick={() => setOpen(false)} className="press rounded-full px-2 py-1 text-[13px] font-semibold text-zinc-300" data-testid="gamechat-close">Done</button>
          </div>
          <div className="mx-3 mt-2 flex rounded-xl bg-white/[0.05] p-0.5 text-[12px] font-bold" role="tablist">
            {(["all", "squad"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={room === k} onClick={() => setRoom(k)} className={`flex-1 rounded-[10px] py-1.5 ${room === k ? "bg-purple-500/30 text-white shadow-[0_0_12px_rgba(168,85,247,.45)]" : "text-zinc-400"}`} data-testid={`gamechat-room-${k}`}>
                {k === "all" ? "Everyone" : "My squads"}
              </button>
            ))}
          </div>
          {toast ? <p className="mx-3 mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-[12px] text-zinc-100" role="status">{toast}</p> : null}
          <div
            ref={listRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
            }}
            className="gc-list mt-2 flex-1 space-y-2 overflow-y-auto px-3"
            data-testid="gamechat-list"
          >
            {!enabled ? <p className="py-8 text-center text-[13px] text-zinc-500">Chat opens soon.</p> : !msgs ? <div className="skel h-16" /> : !shown.length ? <p className="py-8 text-center text-[13px] text-zinc-500">{room === "squad" ? "No squad mates talking in this game yet." : "Quiet so far. Start the chat."}</p> : null}
            {shown.map((m) =>
              m.kind === "sys" ? (
                <div key={m.id} className="gc-sys rounded-xl px-3 py-1.5 text-center text-[12px] font-bold" data-testid="gamechat-sys">
                  {m.text} <span className="ml-1 font-normal text-zinc-500">{clock(m.ts)}</span>
                </div>
              ) : (
                <div key={m.id} className={`flex gap-2 ${m.mine ? "flex-row-reverse" : ""}`} data-testid="gamechat-msg">
                  <Avatar handle={m.handle} look={m.look} size={30} />
                  <div className={`flex max-w-[80%] flex-col ${m.mine ? "items-end" : ""}`}>
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                      <StyledName handle={m.handle} look={m.look} className="text-[12px]" />
                      {m.squad ? <span className="rounded bg-[color:var(--portal-green)]/15 px-1 text-[10px] font-bold text-[color:var(--portal-green)]">squad</span> : null}
                      <span>{clock(m.ts)}</span>
                    </div>
                    <button type="button" onClick={() => setMenu(menu === m.id ? null : m.id)} className={`mt-0.5 rounded-2xl px-3 py-2 text-left text-[15px] leading-snug ${m.mine ? "bg-purple-600/40 text-white" : m.atMe ? "bg-[color:var(--portal-green)]/15 text-white ring-1 ring-[color:var(--portal-green)]/50" : "bg-white/[0.06] text-zinc-100"} ${fontClass(m.look)}`}>
                      {m.text.split(/(@[A-Za-z0-9_]{3,16})/g).map((p, i) => (p.startsWith("@") && m.mentions.some((h) => `@${h}`.toLowerCase() === p.toLowerCase()) ? <b key={i} className="text-[color:var(--portal-green)]">{p}</b> : p))}
                    </button>
                    {m.pick ? (
                      <div className="gc-pick mt-1 flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[12px]" data-testid="gamechat-pick">
                        <span className="font-bold text-white">🎟️ {pickLabel(m.pick)}</span>
                        {!m.mine ? <button type="button" onClick={() => tail(m)} className="press rounded-lg bg-white/10 px-2 py-0.5 font-black text-[color:var(--portal-green)]" data-testid="gamechat-tail">Tail</button> : null}
                      </div>
                    ) : null}
                    {Object.keys(m.rx).length ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {Object.entries(m.rx).map(([e, n]) => (
                          <button key={e} type="button" onClick={() => react(m, e)} className="rounded-full border border-white/10 bg-black/40 px-1.5 text-[12px]">{emoteGlyph(e) ?? "✨"} <span className="tabular text-zinc-400">{n}</span></button>
                        ))}
                      </div>
                    ) : null}
                    {menu === m.id ? (
                      <div className="mt-1 rounded-xl border border-white/10 bg-black/70 p-1" data-testid="gamechat-menu">
                        <div className="flex flex-wrap gap-1">
                          {emotes.map((e) => <button key={e} type="button" onClick={() => react(m, e)} className="press h-9 w-9 rounded-lg text-[20px]" aria-label={`React ${e}`}>{emoteGlyph(e)}</button>)}
                        </div>
                        {!m.mine ? (
                          <div className="mt-1 flex gap-1 text-[12px] font-bold">
                            <button type="button" className="rounded-lg bg-white/10 px-2 py-1" onClick={() => { setText((t) => `${t}@${m.handle} `); setMenu(null); input.current?.focus(); }}>Reply</button>
                            <button type="button" className="rounded-lg bg-[color:var(--minus)]/20 px-2 py-1 text-[color:var(--minus)]" onClick={() => setReportFor(m.id)} data-testid="gamechat-report">Report</button>
                            {signedIn ? <button type="button" className="rounded-lg bg-white/10 px-2 py-1 text-zinc-300" onClick={() => block(m)} data-testid="gamechat-block">Block</button> : null}
                          </div>
                        ) : null}
                        {reportFor === m.id ? (
                          <div className="mt-1 flex flex-wrap gap-1 text-[12px]">
                            {REPORT_REASONS.map((r) => <button key={r} type="button" className="rounded-lg border border-white/10 px-2 py-1" onClick={() => (signedIn ? report(m, r) : (setMsgs((c) => c?.filter((x) => x.id !== m.id) ?? c), setMenu(null), flash("Hidden. Join to send reports.")))}>{r}</button>)}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            )}
          </div>
          {signedIn ? (
            <form onSubmit={send} className="gc-compose px-3 pt-2">
              {sugg.length ? (
                <div className="mb-1 flex gap-1 overflow-x-auto">
                  {sugg.map((h) => <button key={h} type="button" onClick={() => { setText(text.replace(/@[A-Za-z0-9_]*$/, `@${h} `)); input.current?.focus(); }} className="rounded-full border border-purple-400/50 px-2.5 py-1 text-[13px] font-bold text-purple-100">@{h}</button>)}
                </div>
              ) : null}
              {sharing && myLegs.length ? (
                <div className="mb-1 flex gap-1 overflow-x-auto" data-testid="gamechat-share-list">
                  {myLegs.map((p) => <button key={p.id} type="button" onClick={() => share(p)} className="gc-pick shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold text-white">🎟️ {pickLabel({ subject: p.subject, line: p.line, market: p.market ?? null, selection: p.selection ?? null, sport: p.sport, plus: p.plus })}</button>)}
                </div>
              ) : null}
              <div className="mb-1.5 flex gap-1 overflow-x-auto">
                {myLegs.length ? <button type="button" onClick={() => setSharing(!sharing)} className="press shrink-0 rounded-full border border-[color:var(--portal-green)]/60 px-2.5 text-[12px] font-black text-[color:var(--portal-green)]" data-testid="gamechat-share">Share my pick</button> : null}
                {emotes.map((e) => <button key={e} type="button" onClick={() => setText((t) => `${t}${emoteGlyph(e)}`)} className="press h-8 w-8 shrink-0 rounded-lg bg-white/[0.04] text-[17px]" aria-label={`Insert ${e}`}>{emoteGlyph(e)}</button>)}
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  ref={input}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  maxLength={280}
                  placeholder={me ? `Chat as @${me}` : "Say something about the game"}
                  className="min-h-[40px] flex-1 resize-none rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-[16px] text-white"
                  data-testid="gamechat-input"
                />
                <button type="submit" className="press h-10 rounded-full bg-purple-500 px-4 text-[14px] font-black text-white shadow-[0_0_14px_rgba(168,85,247,.6)]" data-testid="gamechat-send">Send</button>
              </div>
              {err ? <p className="mt-1 text-[12px] text-[color:var(--minus)]">{err}</p> : null}
              <p className="mt-1 text-[10px] text-zinc-500">Be cool. No hate, harassment, spam or betting promos. <Link href="/terms" className="underline">Rules</Link></p>
            </form>
          ) : enabled ? (
            <div className="gc-compose px-3 pt-2 text-center">
              <button type="button" disabled={busy} onClick={join} className="press w-full rounded-full bg-purple-500 py-2.5 text-[14px] font-black text-white shadow-[0_0_14px_rgba(168,85,247,.6)]" data-testid="gamechat-join">{busy ? "Joining…" : "Join to chat"}</button>
              <p className="mt-1 text-[11px] text-zinc-500">Makes a free private account, no email. Your account name shows in chat.</p>
              {err ? <p className="mt-1 text-[12px] text-[color:var(--minus)]">{err}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
