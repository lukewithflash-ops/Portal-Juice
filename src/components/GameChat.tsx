"use client";

import { useEffect, useState } from "react";

type Note = { id: string; handle: string; text: string; ts: number; likes: number };

function hue(handle: string, away: string, home: string) {
  let n = 0;
  for (let i = 0; i < handle.length; i++) n += handle.charCodeAt(i);
  return n % 2 === 0 ? away : home;
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
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [burst, setBurst] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("pj-handle") || "";
    const idr = requestAnimationFrame(() => setHandle(saved));
    return () => cancelAnimationFrame(idr);
  }, []);

  useEffect(() => {
    let stop = false;
    const pull = async () => {
      const res = await fetch("/api/chat/" + league + "/" + id);
      const data = await res.json();
      if (stop) return;
      if (data.enabled === false) setEnabled(false);
      else setEnabled(true);
      setNotes(Array.isArray(data.messages) ? data.messages : []);
    };
    pull().catch(() => setEnabled(false));
    const timer = setInterval(() => pull().catch(() => {}), 15000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [league, id]);

  const shown = [...notes].sort((a, b) => (sort === "top" ? b.likes - a.likes : b.ts - a.ts));

  return (
    <section className="mt-0 lg:sticky lg:top-[calc(6.8rem+env(safe-area-inset-top))]" aria-label="Chat">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-purple-200/80">Chat</h2>
        {enabled ? (
          <button type="button" className="text-[11px] text-zinc-500" onClick={() => setSort(sort === "new" ? "top" : "new")}>
            {sort === "new" ? "Newest" : "Top"}
          </button>
        ) : null}
      </div>
      <p className="mb-2 text-[11px] text-zinc-500">Chat is fans talking. Not a pick.</p>
      {!enabled ? (
        <div className="chat-soon foil-tile px-4 py-6 text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full border-2" style={{ borderColor: awayColor, boxShadow: "0 0 18px " + awayColor }} />
          <p className="text-sm font-black text-[color:var(--flat)]">Chat opens soon</p>
          <p className="mt-1 text-[11px] text-zinc-500">The thread lights up when the store is connected.</p>
        </div>
      ) : (
        <>
          <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
            {shown.map((n) => {
              const ring = hue(n.handle, awayColor, homeColor);
              return (
                <li key={n.id} className={"foil-tile px-3 py-2 " + (n.id === fresh ? "play-in" : "")}>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black text-black" style={{ background: ring, boxShadow: "0 0 10px " + ring }}>
                      {n.handle.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="font-bold text-zinc-300">{n.handle}</span>
                    <span className="ml-auto">{new Date(n.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                  <p className="mt-1 text-sm text-[color:var(--flat)]">{n.text}</p>
                  <button
                    type="button"
                    className="relative mt-1 text-[11px] font-semibold text-zinc-400"
                    onClick={async () => {
                      setBurst(n.id);
                      const res = await fetch("/api/chat/" + league + "/" + id + "/like", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ id: n.id }),
                      });
                      if (!res.ok) return;
                      const data = await res.json();
                      setNotes((rows) => rows.map((row) => (row.id === n.id ? { ...row, likes: data.likes } : row)));
                    }}
                  >
                    {burst === n.id ? <span className="burst-pop pointer-events-none absolute -top-4 left-0">🔥</span> : null}
                    {n.likes} likes
                  </button>
                </li>
              );
            })}
          </ul>
          <form
            className="mt-3 space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setErr("");
              localStorage.setItem("pj-handle", handle);
              const res = await fetch("/api/chat/" + league + "/" + id, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ handle, text }),
              });
              const data = await res.json();
              if (!res.ok) {
                setErr(data.error || "Not posted.");
                if (res.status === 503) setEnabled(false);
                return;
              }
              const note = { id: String(Date.now()), handle, text, ts: Date.now(), likes: 0 };
              setFresh(note.id);
              setText("");
              setNotes((rows) => [note, ...rows]);
            }}
          >
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="Handle"
              maxLength={16}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
            />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Say something about the game"
              maxLength={280}
              rows={2}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
            />
            {err ? <p className="text-[11px] text-[color:var(--minus)]">{err}</p> : null}
            <button type="submit" className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white">
              Post
            </button>
          </form>
        </>
      )}
    </section>
  );
}
