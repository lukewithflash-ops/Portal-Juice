"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/LivePosition";
import { Avatar, StyledName, fontClass } from "@/components/Cosmetics";
import { FREE_EMOTES, emoteGlyph, itemOf, type Look } from "@/lib/coinsCore";
import { haptic } from "@/lib/native";
import "@/components/squads.css";

/** Build-time copy of the PJ_COINS flag, so nothing extra runs in production while it is off. */
export const COINS_ON = process.env.NEXT_PUBLIC_PJ_COINS === "1";

type Msg = { id: string; handle: string; text: string; ts: number; mentions: string[]; rx: Record<string, number>; mine?: boolean; look?: Look };
export type SquadRow = { id: string; name: string; dm?: boolean; members: string[]; unread: number; mentions: number; last?: { handle: string; text: string; ts: number } | null };

/** Squads with unread counts. null = feature off. */
export function useSquadChats() {
  const [rows, setRows] = useState<SquadRow[] | null>(null);
  const load = useCallback(() => {
    fetch("/api/squadchat", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRows(j?.enabled ? j.squads ?? [] : null))
      .catch(() => setRows(null));
  }, []);
  useEffect(() => {
    if (!COINS_ON) return;
    const t = setTimeout(load, 0);
    const i = setInterval(load, 30000);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, [load]);
  return { rows, reload: load };
}

export function ChatButton({ row, onOpen }: { row: SquadRow; onOpen: () => void }) {
  return (
    <button type="button" onClick={() => { haptic("light"); onOpen(); }} className="press inline-flex items-center gap-1.5 rounded-lg border border-purple-400/60 px-2.5 py-1 text-[12px] font-black text-purple-100" data-testid="squad-chat-open">
      Chat
      {row.unread ? <span className="unread-dot">{row.mentions ? "@" : row.unread > 9 ? "9+" : row.unread}</span> : null}
    </button>
  );
}

export const ago = (ts: number) => {
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

export function SquadChatSheet({ squad, onClose }: { squad: { id: string; name: string }; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [dm, setDm] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [mine, setMine] = useState<string[]>([]);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const load = useCallback(async () => {
    const j = await fetch(`/api/squadchat?sq=${squad.id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (j?.msgs) {
      setMsgs(j.msgs);
      setMembers(j.members ?? []);
      setSeen(j.seen ?? []);
      setDm(!!j.dm);
    }
  }, [squad.id]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    const i = setInterval(load, 5000);
    fetch("/api/coins", { cache: "no-store" }).then((r) => r.json()).then((j) => setMine([...new Set(((j.inventory ?? []) as { item: string }[]).map((x) => x.item).filter((id) => itemOf(id)?.kind === "emote"))])).catch(() => {});
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, [load]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [msgs?.length]);
  const emotes = [...FREE_EMOTES.map((e) => e.id), ...mine];
  const q = /@([A-Za-z0-9_]*)$/.exec(text)?.[1];
  const sugg = q !== undefined ? members.filter((m) => m.toLowerCase().startsWith(q.toLowerCase())).slice(0, 5) : [];
  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    setErr(null);
    setText("");
    const r = await fetch("/api/squadchat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sq: squad.id, text: t }) });
    if (!r.ok) {
      setErr((await r.json().catch(() => ({}))).error ?? "Didn't send.");
      setText(t);
      return;
    }
    haptic("light");
    load();
  }
  async function react(id: string, emote: string) {
    setPickFor(null);
    haptic("light");
    setMsgs((cur) => cur?.map((m) => (m.id === id ? { ...m, rx: { ...m.rx, [emote]: (m.rx[emote] ?? 0) + 1 } } : m)) ?? cur);
    await fetch("/api/squadchat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sq: squad.id, react: { id, emote } }) });
  }
  const myLast = msgs ? [...msgs].reverse().find((m) => m.mine)?.id : undefined;
  const lastIsMine = !!msgs?.length && !!msgs[msgs.length - 1].mine;
  const others = members.filter((m) => !msgs?.some((x) => x.mine && x.handle === m));
  return (
    <Sheet label={`${squad.name} chat`} onClose={onClose} testid="squad-chat">
      <div className="sqchat ig-thread">
        <div className="ig-thread-head">
          <button type="button" onClick={onClose} className="press ig-back" aria-label="Back" data-testid="squad-chat-done">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          {dm || others.length <= 1 ? <Avatar handle={others[0] ?? squad.name} size={34} /> : <span className="ig-stack ig-stack-sm"><Avatar handle={others[0]} size={26} /><Avatar handle={others[1]} size={26} /></span>}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-bold text-white">{squad.name}</span>
            {!dm && members.length ? <span className="block truncate text-[11px] text-zinc-400">{members.length} members</span> : null}
          </span>
        </div>
        <div ref={list} className="sqchat-list pr-1" data-testid="squad-chat-list">
          {!msgs ? <div className="skel h-16" /> : !msgs.length ? (
            <div className="ig-empty py-10">
              <p className="text-[15px] font-bold text-white">{squad.name}</p>
              <p>No messages yet. Say hi.</p>
            </div>
          ) : null}
          {msgs?.map((m, i) => {
            const prev = msgs[i - 1];
            const next = msgs[i + 1];
            const firstOfRun = !prev || prev.handle !== m.handle || m.ts - prev.ts > 10 * 60000;
            const lastOfRun = !next || next.handle !== m.handle || next.ts - m.ts > 10 * 60000;
            const gap = !prev || m.ts - prev.ts > 60 * 60000;
            return (
              <div key={m.id}>
                {gap ? <p className="ig-time">{new Date(m.ts).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</p> : null}
                <div className={`ig-msg ${m.mine ? "mine" : "theirs"} ${firstOfRun ? "first" : ""} ${lastOfRun ? "last" : ""}`}>
                  {!m.mine ? <span className="ig-msg-av">{lastOfRun ? <Avatar handle={m.handle} look={m.look} size={28} /> : null}</span> : null}
                  <div className={`flex max-w-[76%] flex-col ${m.mine ? "items-end" : "items-start"}`}>
                    {!m.mine && !dm && firstOfRun ? <StyledName handle={m.handle} look={m.look} className="ig-msg-name" /> : null}
                    <button type="button" onClick={() => setPickFor(pickFor === m.id ? null : m.id)} className={`ig-bubble ${fontClass(m.look)}`} title={ago(m.ts)}>
                      {m.text.split(/(@[A-Za-z0-9_]{3,16})/g).map((p, k) => (p.startsWith("@") && m.mentions.some((h) => `@${h}`.toLowerCase() === p.toLowerCase()) ? <b key={k} className="text-[color:var(--portal-green)]">{p}</b> : p))}
                    </button>
                    {Object.keys(m.rx).length ? (
                      <div className="ig-rx">
                        {Object.entries(m.rx).map(([e, n]) => (
                          <button key={e} type="button" onClick={() => react(m.id, e)} className="rounded-full border border-white/10 bg-[#1a1030] px-1.5 text-[12px]">{emoteGlyph(e)}{n > 1 ? <span className="tabular text-zinc-400"> {n}</span> : null}</button>
                        ))}
                      </div>
                    ) : null}
                    {pickFor === m.id ? (
                      <div className="mt-1 flex flex-wrap gap-1 rounded-full border border-white/10 bg-[#1a1030] p-1" data-testid="squad-chat-rx">
                        {emotes.map((e) => <button key={e} type="button" onClick={() => react(m.id, e)} className="press h-9 w-9 rounded-full text-[20px]" aria-label={`React ${e}`}>{emoteGlyph(e)}</button>)}
                      </div>
                    ) : null}
                    {m.id === myLast && lastIsMine ? <span className="ig-seen" data-testid="ig-seen">{seen.length ? (dm ? "Seen" : `Seen by ${seen.slice(0, 3).join(", ")}${seen.length > 3 ? ` +${seen.length - 3}` : ""}`) : "Sent"}</span> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <form onSubmit={send} className="sqchat-compose ig-compose">
          {sugg.length ? (
            <div className="mb-1 flex gap-1 overflow-x-auto">
              {sugg.map((h) => <button key={h} type="button" onClick={() => { setText(text.replace(/@[A-Za-z0-9_]*$/, `@${h} `)); input.current?.focus(); }} className="rounded-full border border-purple-400/50 px-2.5 py-1 text-[13px] font-bold text-purple-100">@{h}</button>)}
            </div>
          ) : null}
          <div className="ig-composer">
            <textarea ref={input} value={text} onChange={(e) => setText(e.target.value.slice(0, 280))} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} placeholder="Message…" className="chat-input" aria-label="Message" enterKeyHint="send" data-testid="squad-chat-input" />
            {text.trim() ? (
              <button type="submit" className="ig-send" data-testid="squad-chat-send">Send</button>
            ) : (
              <span className="flex gap-0.5">
                {emotes.slice(0, 3).map((e) => <button key={e} type="button" onClick={() => setText((t) => `${t}${emoteGlyph(e)}`)} className="press h-8 w-8 rounded-full text-[18px]" aria-label={`Insert ${e}`}>{emoteGlyph(e)}</button>)}
              </span>
            )}
          </div>
          {err ? <p className="mt-1 text-[12px] font-bold text-[color:var(--minus)]" role="alert">{err}</p> : null}
        </form>
      </div>
    </Sheet>
  );
}
