"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/LivePosition";
import { Avatar, StyledName, fontClass } from "@/components/Cosmetics";
import { FREE_EMOTES, emoteGlyph, itemOf, type Look } from "@/lib/coinsCore";
import { haptic } from "@/lib/native";

/** Build-time copy of the PJ_COINS flag, so nothing extra runs in production while it is off. */
export const COINS_ON = process.env.NEXT_PUBLIC_PJ_COINS === "1";

type Msg = { id: string; handle: string; text: string; ts: number; mentions: string[]; rx: Record<string, number>; mine?: boolean; look?: Look };
export type SquadRow = { id: string; name: string; members: string[]; unread: number; mentions: number };

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

const ago = (ts: number) => {
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

export function SquadChatSheet({ squad, onClose }: { squad: { id: string; name: string }; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [members, setMembers] = useState<string[]>([]);
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
  return (
    <Sheet label={`${squad.name} chat`} onClose={onClose} testid="squad-chat">
      <div className="sqchat">
        <div className="flex items-baseline justify-between gap-2 pb-2">
          <h2 className="text-[17px] font-bold text-white">{squad.name}</h2>
          <button type="button" onClick={onClose} className="press text-[13px] font-semibold text-zinc-400">Done</button>
        </div>
        <div ref={list} className="sqchat-list space-y-2.5 pr-1" data-testid="squad-chat-list">
          {!msgs ? <div className="skel h-16" /> : !msgs.length ? <p className="py-8 text-center text-[13px] text-zinc-500">No messages yet. Say hi to the squad.</p> : null}
          {msgs?.map((m) => (
            <div key={m.id} className={`flex gap-2 ${m.mine ? "flex-row-reverse" : ""}`}>
              <Avatar handle={m.handle} look={m.look} size={30} />
              <div className={`max-w-[78%] ${m.mine ? "items-end text-right" : ""} flex flex-col`}>
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <StyledName handle={m.handle} look={m.look} className="text-[12px]" />
                  <span>{ago(m.ts)}</span>
                </div>
                <button type="button" onClick={() => setPickFor(pickFor === m.id ? null : m.id)} className={`mt-0.5 rounded-2xl px-3 py-2 text-left text-[15px] leading-snug ${m.mine ? "bg-purple-600/40 text-white" : "bg-white/[0.06] text-zinc-100"} ${fontClass(m.look)}`}>
                  {m.text.split(/(@[A-Za-z0-9_]{3,16})/g).map((p, i) => (p.startsWith("@") && m.mentions.some((h) => `@${h}`.toLowerCase() === p.toLowerCase()) ? <b key={i} className="text-[color:var(--portal-green)]">{p}</b> : p))}
                </button>
                {Object.keys(m.rx).length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.entries(m.rx).map(([e, n]) => (
                      <button key={e} type="button" onClick={() => react(m.id, e)} className="rounded-full border border-white/10 bg-black/40 px-1.5 text-[12px]">{emoteGlyph(e)} <span className="tabular text-zinc-400">{n}</span></button>
                    ))}
                  </div>
                ) : null}
                {pickFor === m.id ? (
                  <div className="mt-1 flex flex-wrap gap-1 rounded-xl border border-white/10 bg-black/60 p-1" data-testid="squad-chat-rx">
                    {emotes.map((e) => <button key={e} type="button" onClick={() => react(m.id, e)} className="press h-9 w-9 rounded-lg text-[20px]" aria-label={`React ${e}`}>{emoteGlyph(e)}</button>)}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={send} className="sqchat-compose pt-2">
          {sugg.length ? (
            <div className="mb-1 flex gap-1 overflow-x-auto">
              {sugg.map((h) => <button key={h} type="button" onClick={() => { setText(text.replace(/@[A-Za-z0-9_]*$/, `@${h} `)); input.current?.focus(); }} className="rounded-full border border-purple-400/50 px-2.5 py-1 text-[13px] font-bold text-purple-100">@{h}</button>)}
            </div>
          ) : null}
          <div className="mb-1.5 flex gap-1 overflow-x-auto">
            {emotes.map((e) => <button key={e} type="button" onClick={() => setText((t) => `${t}${emoteGlyph(e)}`)} className="press h-8 w-8 shrink-0 rounded-lg bg-white/[0.04] text-[17px]" aria-label={`Insert ${e}`}>{emoteGlyph(e)}</button>)}
          </div>
          <div className="flex items-end gap-2">
            <textarea ref={input} value={text} onChange={(e) => setText(e.target.value.slice(0, 280))} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} placeholder="Message the squad · @ to mention" className="field chat-input max-h-28 min-h-[42px] flex-1 resize-none" aria-label="Message" enterKeyHint="send" data-testid="squad-chat-input" />
            <button type="submit" disabled={!text.trim()} className="note-add h-[42px] rounded-xl px-4 text-[15px] font-black text-white disabled:opacity-40" data-testid="squad-chat-send">Send</button>
          </div>
          {err ? <p className="mt-1 text-[12px] font-bold text-[color:var(--minus)]" role="alert">{err}</p> : null}
        </form>
      </div>
    </Sheet>
  );
}
