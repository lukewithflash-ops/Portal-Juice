"use client";

import { PosFor } from "@/components/LivePosition";
import { usePositions } from "@/lib/positionsClient";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getQuests, getServerQuests, questDone, subscribeQuests } from "@/lib/questStore";
import { emoteIcon, fullDays, unlockedEmotes } from "@/lib/questsCore";

type Note = { id: string; handle: string; text: string; ts: number; likes: number; kind?: "msg" | "sys"; verified?: boolean; rx?: Record<string, number> };

const HIDE_KEY = "pj-chat-hidden";

function hue(handle: string, away: string, home: string) {
  let n = 0;
  for (let i = 0; i < handle.length; i++) n += handle.charCodeAt(i);
  return n % 2 === 0 ? away : home;
}

function readHidden(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(HIDE_KEY) || "[]");
    return Array.isArray(v) ? v.slice(-300) : [];
  } catch {
    return [];
  }
}

export default function GameChat({
  league,
  id,
  awayColor = "#7c3aed",
  homeColor = "#39ff14",
}: {
  league: string;
  id: string;
  awayColor?: string;
  homeColor?: string;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [sort, setSort] = useState<"new" | "top">("new");
  const [handle, setHandle] = useState("");
  const [me, setMe] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [menu, setMenu] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const quests = useSyncExternalStore(subscribeQuests, getQuests, getServerQuests);
  const emotes = unlockedEmotes(fullDays(quests));
  const box = useRef<HTMLTextAreaElement>(null);
  const base = "/api/chat/" + league + "/" + id;
  // Live positions only for signed-in authors, so a typed name can't borrow someone's position.
  const pos = usePositions([...new Set(notes.filter((n) => n.verified && n.kind !== "sys").map((n) => n.handle))]);

  useEffect(() => {
    const saved = localStorage.getItem("pj-handle") || "";
    const idr = requestAnimationFrame(() => {
      setHandle(saved);
      setHidden(readHidden());
    });
    return () => cancelAnimationFrame(idr);
  }, []);

  useEffect(() => {
    let stop = false;
    const pull = async () => {
      if (document.visibilityState === "hidden") return;
      const res = await fetch(base, { cache: "no-store" });
      const data = await res.json();
      if (stop) return;
      setEnabled(data.enabled !== false);
      setMe(data.me?.handle ?? null);
      setNotes(Array.isArray(data.messages) ? data.messages : []);
    };
    pull().catch(() => setEnabled(false));
    const timer = setInterval(() => pull().catch(() => {}), 12000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [base]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2200);
  };

  const react = async (n: Note, emote: string) => {
    setNotes((rows) => rows.map((r) => (r.id === n.id ? { ...r, rx: { ...(r.rx ?? {}), [emote]: (r.rx?.[emote] ?? 0) + 1 } } : r)));
    const res = await fetch(base + "/react", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: n.id, emote }) }).catch(() => null);
    if (res?.ok) questDone("react");
    else if (res) flash((await res.json().catch(() => ({}))).error || "Not sent.");
  };

  const hide = (n: Note) => {
    const next = [...hidden, n.id];
    setHidden(next);
    localStorage.setItem(HIDE_KEY, JSON.stringify(next.slice(-300)));
    setMenu(null);
  };

  const report = async (n: Note) => {
    hide(n);
    const res = await fetch(base + "/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: n.id }) }).catch(() => null);
    flash(res?.ok ? "Reported and hidden." : "Hidden. Report didn't go through.");
  };

  const shown = notes
    .filter((n) => !hidden.includes(n.id))
    .sort((a, b) => (sort === "top" ? b.likes + Object.values(b.rx ?? {}).reduce((s, v) => s + v, 0) - (a.likes + Object.values(a.rx ?? {}).reduce((s, v) => s + v, 0)) : b.ts - a.ts));

  return (
    <section className="mt-0 lg:sticky lg:top-[calc(var(--chrome-h,calc(6.6rem+env(safe-area-inset-top))))]" aria-label="Game thread" data-testid="game-thread">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-purple-200/80">Game thread</h2>
        {enabled ? (
          <button type="button" className="text-[11px] text-zinc-500" onClick={() => setSort(sort === "new" ? "top" : "new")}>
            {sort === "new" ? "Newest" : "Top"}
          </button>
        ) : null}
      </div>
      <p className="mb-2 text-[11px] text-zinc-500">Fans talking, plus big plays as they happen. Not a pick.</p>
      {toast ? <p className="mb-2 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] text-zinc-200" role="status">{toast}</p> : null}
      {!enabled ? (
        <div className="chat-soon foil-tile px-4 py-6 text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full border-2" style={{ borderColor: awayColor, boxShadow: "0 0 18px " + awayColor }} />
          <p className="text-sm font-black text-[color:var(--flat)]">Thread opens soon</p>
          <p className="mt-1 text-[11px] text-zinc-500">The thread lights up when the store is connected.</p>
        </div>
      ) : (
        <>
          <ul className="max-h-[30rem] space-y-2 overflow-y-auto" data-testid="thread-list">
            {shown.length === 0 ? <li className="px-1 text-[12px] text-zinc-500">Quiet so far. Start the thread.</li> : null}
            {shown.map((n) => {
              if (n.kind === "sys") {
                return (
                  <li key={n.id} className="thread-sys px-3 py-1.5 text-[12px] font-semibold" data-testid="thread-sys">
                    {n.text}
                    <span className="ml-2 text-[10px] font-normal text-zinc-500">{new Date(n.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                    <Reacts n={n} emotes={emotes} onReact={react} />
                  </li>
                );
              }
              const ring = hue(n.handle, awayColor, homeColor);
              const lp = n.verified ? <PosFor handle={n.handle} map={pos} /> : null;
              return (
                <li key={n.id} className={"foil-tile px-3 py-2 " + (n.id === fresh ? "play-in" : "")} data-testid="thread-msg">
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black text-black" style={{ background: ring, boxShadow: "0 0 10px " + ring }}>
                      {n.handle.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="font-bold text-zinc-300">{n.handle}</span>
                    {n.verified ? <span title="Signed-in account" className="text-[10px] text-[color:var(--plus)]">✓</span> : null}
                    {lp}
                    <span className="ml-auto">{new Date(n.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                    <button type="button" aria-label="Message options" className="px-1 text-zinc-500" onClick={() => setMenu(menu === n.id ? null : n.id)}>⋯</button>
                  </div>
                  {menu === n.id ? (
                    <div className="mt-1 flex gap-2 text-[11px]">
                      <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => hide(n)}>Hide</button>
                      <button type="button" className="rounded bg-[color:var(--minus)]/20 px-2 py-1 text-[color:var(--minus)]" onClick={() => report(n)} data-testid="thread-report">Report</button>
                    </div>
                  ) : null}
                  <p className="mt-1 break-words text-sm text-[color:var(--flat)]">{n.text}</p>
                  <Reacts n={n} emotes={emotes} onReact={react} />
                </li>
              );
            })}
          </ul>
          <form
            className="mt-3 space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setErr("");
              if (!me) localStorage.setItem("pj-handle", handle);
              const res = await fetch(base, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ handle, text }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                setErr(data.error || "Not posted.");
                if (res.status === 503) setEnabled(false);
                return;
              }
              const note: Note = { id: String(Date.now()), handle: me ?? handle, text, ts: Date.now(), likes: 0, verified: Boolean(me), rx: {} };
              setFresh(note.id);
              setText("");
              setNotes((rows) => [note, ...rows]);
            }}
          >
            {me ? (
              <p className="text-[11px] text-zinc-400">Posting as <b className="text-zinc-200">@{me}</b> <span className="text-[color:var(--plus)]">✓</span></p>
            ) : (
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="Handle (or sign in)"
                maxLength={16}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
              />
            )}
            <textarea
              ref={box}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Say something about the game"
              maxLength={280}
              rows={2}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap items-center gap-1" aria-label="Portal emotes">
              {emotes.map((em) => (
                <button key={em.id} type="button" title={em.label} className="emote-btn rounded-full bg-white/5 px-2 py-1 text-base" onClick={() => { setText((t) => (t + " " + em.icon).trim().slice(0, 280)); box.current?.focus(); }}>
                  {em.icon}
                </button>
              ))}
              <button type="submit" className="ml-auto rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white">Post</button>
            </div>
            {err ? <p className="text-[11px] text-[color:var(--minus)]">{err}</p> : null}
          </form>
        </>
      )}
    </section>
  );
}

function Reacts({ n, emotes, onReact }: { n: Note; emotes: { id: string; icon: string; label: string }[]; onReact: (n: Note, e: string) => void }) {
  const [open, setOpen] = useState(false);
  const counts = Object.entries(n.rx ?? {}).filter(([, v]) => v > 0);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
      {counts.map(([e, v]) => (
        <button key={e} type="button" className="emote-btn rounded-full bg-white/10 px-2 py-0.5" onClick={() => onReact(n, e)}>
          {emoteIcon(e) ?? "✨"} {v}
        </button>
      ))}
      <button type="button" aria-label="React" className="rounded-full bg-white/5 px-2 py-0.5 text-zinc-400" onClick={() => setOpen(!open)} data-testid="thread-react">＋</button>
      {open
        ? emotes.map((em) => (
            <button key={em.id} type="button" title={em.label} className="emote-btn px-1 text-base" onClick={() => { onReact(n, em.id); setOpen(false); }}>
              {em.icon}
            </button>
          ))
        : null}
    </div>
  );
}
