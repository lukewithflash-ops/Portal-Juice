"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";

const TOOL_LABEL: Record<string, string> = {
  todaysGames: "Checking today's games",
  gameDetail: "Reading the live box score",
  oddsAndForm: "Pulling odds and form",
  playerLog: "Reading the game log",
  breakdown: "Running the breakdown",
  siteHelp: "Checking the site guide",
};

/** Tiny markdown: **bold** and "- " bullets. Text stays text. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        const bullet = /^\s*[-*•]\s+/.test(line);
        const body = line.replace(/^\s*[-*•]\s+/, "");
        const parts = body.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (p.startsWith("**") && p.endsWith("**") ? <strong key={j} className="text-white">{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>));
        return bullet ? (
          <div key={i} className="flex gap-1.5 pl-1">
            <span className="text-purple-300">•</span>
            <span>{parts}</span>
          </div>
        ) : line.trim() ? (
          <p key={i}>{parts}</p>
        ) : (
          <div key={i} className="h-1.5" />
        );
      })}
    </>
  );
}

/**
 * Ask Portal AI. Streams answers from real-data tools. The conversation stays on this device (localStorage).
 * `context` is extra real data from the screen (e.g. a breakdown), sent with each question.
 */
export default function AskChat({ storeKey, context, suggestions, compact = false }: { storeKey: string; context?: string; suggestions: string[]; compact?: boolean }) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/ask", body: () => ({ context: context ?? "" }) }), [context]);
  const { messages, sendMessage, status, error, setMessages, stop } = useChat({ transport });
  const [input, setInput] = useState("");
  const loaded = useRef(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) setMessages(JSON.parse(raw) as UIMessage[]);
    } catch {
      /* fresh start */
    }
    loaded.current = true;
  }, [storeKey, setMessages]);
  useEffect(() => {
    if (!loaded.current || status === "streaming" || status === "submitted") return;
    try {
      localStorage.setItem(storeKey, JSON.stringify(messages.slice(-30)));
    } catch {
      /* storage full */
    }
  }, [messages, status, storeKey]);
  useEffect(() => {
    if (messages.length) end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages, status]);

  const busy = status === "streaming" || status === "submitted";
  const ask = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({ text: t });
    setInput("");
  };

  return (
    <div className={"ask-panel rounded-2xl p-3 " + (compact ? "" : "min-h-[60vh]")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="portal-ring" aria-hidden style={{ ["--glow" as string]: "#a855f7" }} />
          <span className="text-sm font-black text-white">Ask Portal AI</span>
        </div>
        {messages.length ? (
          <button type="button" onClick={() => (stop(), setMessages([]), localStorage.removeItem(storeKey))} className="text-[11px] text-zinc-400 hover:text-white">
            Clear
          </button>
        ) : null}
      </div>
      <div className={"mt-2 space-y-2 overflow-y-auto " + (compact ? "max-h-[50vh]" : "max-h-[62vh]")}>
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "ml-8 rounded-2xl rounded-br-sm bg-purple-500/25 px-3 py-2 text-sm text-white" : "mr-4 space-y-1 rounded-2xl rounded-bl-sm border border-white/10 bg-black/40 px-3 py-2 text-sm leading-relaxed text-zinc-200"}>
            {m.parts.map((p, i) => {
              if (p.type === "text") return <Rich key={i} text={p.text} />;
              if (p.type.startsWith("tool-")) {
                const name = p.type.slice(5);
                const done = "state" in p && (p.state === "output-available" || p.state === "output-error");
                return (
                  <div key={i} className="flex items-center gap-1.5 text-[11px] text-purple-200/80">
                    <span className={done ? "text-[color:var(--plus)]" : "animate-pulse"}>{done ? "✓" : "◌"}</span>
                    {TOOL_LABEL[name] ?? name}
                  </div>
                );
              }
              return null;
            })}
          </div>
        ))}
        {status === "submitted" ? <div className="mr-4 animate-pulse text-xs text-purple-200">Opening the portal…</div> : null}
        {error ? <p className="text-xs text-[color:var(--minus)]">{/429/.test(error.message) || /20 questions/.test(error.message) ? "You've hit 20 questions this hour. Try again in a bit." : "That didn't go through. Try again."}</p> : null}
        <div ref={end} />
      </div>
      {!messages.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-purple-400/40 bg-purple-500/10 px-2.5 py-1 text-[11px] font-bold text-purple-100 hover:bg-purple-500/25">
              {s}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about a game, a player, or the site" className="field min-w-0 flex-1" aria-label="Ask Portal AI" />
        <button type="submit" disabled={busy || !input.trim()} className="rounded-xl bg-[color:var(--gold)] px-3 text-sm font-black text-black disabled:opacity-40">
          {busy ? "…" : "Ask"}
        </button>
      </form>
      <p className="mt-1.5 text-[10px] text-zinc-500">Answers use real ESPN numbers. Not a guarantee. Portal Juice does not take bets. Chat stays on this device.</p>
    </div>
  );
}
