"use client";

import { useEffect, useState } from "react";

type Note = { id: string; handle: string; text: string; ts: number; likes: number };

export default function GameChat({ league, id }: { league: string; id: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [sort, setSort] = useState<"new" | "top">("new");
  const [handle, setHandle] = useState("");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

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
    <section className="mt-6" aria-label="Chat">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-purple-200/80">Chat</h2>
        <button type="button" className="text-[11px] text-zinc-500" onClick={() => setSort(sort === "new" ? "top" : "new")}>
          {sort === "new" ? "Newest" : "Top"}
        </button>
      </div>
      <p className="mb-2 text-[11px] text-zinc-500">Chat is fans talking. Not a pick.</p>
      {!enabled ? (
        <p className="panel rounded-xl px-4 py-4 text-sm text-zinc-400">Chat opens soon.</p>
      ) : (
        <>
          <ul className="space-y-2">
            {shown.map((n) => (
              <li key={n.id} className="foil-tile px-3 py-2">
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span className="font-bold text-zinc-300">{n.handle}</span>
                  <span>{new Date(n.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                </div>
                <p className="mt-1 text-sm text-[color:var(--flat)]">{n.text}</p>
                <button
                  type="button"
                  className="mt-1 text-[11px] font-semibold text-zinc-400"
                  onClick={async () => {
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
                  {n.likes} likes
                </button>
              </li>
            ))}
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
                return;
              }
              setText("");
              setNotes((rows) => [{ id: String(Date.now()), handle, text, ts: Date.now(), likes: 0 }, ...rows]);
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
