"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  addToInbox,
  clearInbox,
  getInbox,
  getSeen,
  getServerInbox,
  getServerSeen,
  markSeen,
  subscribeInbox,
} from "@/lib/inbox";
import { currentEndpoint, pushState, sendTestPush } from "@/lib/pushClient";

const ICON: Record<string, string> = { tile: "📺", score: "🔢", lead: "🔁", big: "💥", close: "🔥", cleared: "🏆", final: "🏁", player: "⭐", test: "🔔" };

function ago(at: number) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

/** Pulls what the server sent this device, so a missed push still shows here. */
async function pullServer() {
  const endpoint = await currentEndpoint();
  if (!endpoint) return;
  const res = await fetch("/api/push/inbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint }) });
  const data = (await res.json()) as { items?: { key: string; kind: string; title: string; body: string; url: string; at: number }[] };
  addToInbox((data.items ?? []).map(({ key, kind, title, body, url, at }) => ({ key, kind, title, body, url, at })));
}

export default function Bell() {
  const items = useSyncExternalStore(subscribeInbox, getInbox, getServerInbox);
  const seen = useSyncExternalStore(subscribeInbox, getSeen, getServerSeen);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [canTest, setCanTest] = useState(false);
  const unread = items.filter((x) => x.at > seen).length;

  const refresh = useCallback(() => {
    pullServer().catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(() => document.visibilityState === "visible" && refresh(), 90_000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={unread ? `Updates, ${unread} new` : "Updates"}
        aria-expanded={open}
        className="relative shrink-0 rounded-lg border border-white/10 px-1.5 py-1 text-[13px] sm:px-2 leading-none text-zinc-200"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            refresh();
            pushState()
              .then((s) => setCanTest(s.permission === "granted" && s.subscribed))
              .catch(() => {});
          } else markSeen();
        }}
      >
        <span aria-hidden>🔔</span>
        {unread ? (
          <span className="absolute -right-1.5 -top-1.5 min-w-[1.1rem] rounded-full bg-[color:var(--minus,#f43f5e)] px-1 text-center text-[10px] font-black leading-[1.1rem] text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="fixed inset-x-3 top-[calc(3.4rem+env(safe-area-inset-top))] z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-white/10 bg-[#0b0b12] p-3 shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-9 sm:w-96">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">Updates</p>
            <div className="flex gap-3 text-[11px] text-zinc-500">
              {canTest ? (
                <button type="button" onClick={async () => setNote(await sendTestPush())}>
                  Send me a test
                </button>
              ) : null}
              {items.length ? (
                <button type="button" onClick={() => clearInbox()}>
                  Clear
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  markSeen();
                }}
              >
                Close
              </button>
            </div>
          </div>
          {note ? <p className="mb-2 text-xs text-zinc-300" role="status">{note}</p> : null}
          {items.length ? (
            <ul className="space-y-1">
              {items.map((x) => (
                <li key={x.key}>
                  <Link
                    href={x.url || "/lines"}
                    onClick={() => {
                      setOpen(false);
                      markSeen();
                    }}
                    className={"flex gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 " + (x.at > seen ? "bg-white/[0.04]" : "")}
                  >
                    <span className="toast-emote" data-kind={x.kind} aria-hidden>{ICON[x.kind] ?? "•"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-display block truncate text-[13px] font-bold tracking-wide text-white">{x.title}</span>
                      <span className="block text-xs text-zinc-400">{x.body}</span>
                    </span>
                    <span className="shrink-0 text-[10px] text-zinc-500">{ago(x.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">No updates yet. Scores, your props, and your players land here, even if a push misses.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
