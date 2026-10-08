"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LineTile from "@/components/LineTile";
import PrintHistory from "@/components/PrintHistory";
import { isStale, moved } from "@/lib/move";
import { ptTime } from "@/lib/time";
import {
  SPORT_LABEL,
  liveSports,
  type LineRow,
  type LinesSnapshot,
  type Sport,
} from "@/lib/types";

const POLL_MS = 30_000;

type Tokens = Record<string, number>;

function Section({
  title,
  rows,
  tokens,
  staleIds,
  onOpen,
  empty,
}: {
  title: string;
  rows: LineRow[];
  tokens: Tokens;
  staleIds: Set<string>;
  onOpen: (r: LineRow) => void;
  empty: string;
}) {
  return (
    <section className="mt-8" aria-label={title}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-purple-200/80">{title}</h2>
        {rows.length > 0 && <span className="tabular text-[11px] text-zinc-500">{rows.length}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="panel rounded-xl px-4 py-5 text-sm text-zinc-400">{empty}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <LineTile
              key={r.id}
              row={r}
              pulseToken={tokens[r.id] ?? 0}
              stale={staleIds.has(r.id)}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function LineBoard({
  initial,
  initialStaleIds,
}: {
  initial: LinesSnapshot;
  initialStaleIds: string[];
}) {
  const [snap, setSnap] = useState(initial);
  const [staleIds, setStaleIds] = useState(() => new Set(initialStaleIds));
  // Rows whose juice changed on the last print pulse once on first paint.
  const [tokens, setTokens] = useState<Tokens>(() => {
    const stale = new Set(initialStaleIds);
    const t: Tokens = {};
    for (const r of initial.rows) {
      if (!stale.has(r.id) && r.prevJuice !== null && r.prevJuice !== r.juice) t[r.id] = 1;
    }
    return t;
  });
  const [sport, setSport] = useState<Sport | "ALL">("ALL");
  const [open, setOpen] = useState<LineRow | null>(null);
  const rowsRef = useRef(initial.rows);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/lines", { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as LinesSnapshot;
      const prevById = new Map(rowsRef.current.map((r) => [r.id, r]));
      const now = Date.now();
      const stale = new Set(next.rows.filter((r) => isStale(r, now)).map((r) => r.id));
      const bumped: string[] = [];
      const rows = next.rows.map((r) => {
        const old = prevById.get(r.id);
        if (!old) return r;
        const juiceChanged = old.juice !== r.juice;
        const lineChanged = old.line !== r.line;
        if (!juiceChanged && !lineChanged) return r;
        if (!stale.has(r.id) && juiceChanged) bumped.push(r.id);
        // What changed since the last print we showed.
        return { ...r, prevJuice: old.juice, prevLine: old.line };
      });
      rowsRef.current = rows;
      setSnap({ ...next, rows });
      setStaleIds(stale);
      if (bumped.length) {
        setTokens((t) => {
          const n = { ...t };
          for (const id of bumped) n[id] = (n[id] ?? 0) + 1;
          return n;
        });
      }
    } catch {
      // keep the last good print on screen
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const sports = useMemo(() => liveSports(snap.rows), [snap.rows]);
  const visible = useMemo(
    () => (sport === "ALL" ? snap.rows : snap.rows.filter((r) => r.sport === sport)),
    [snap.rows, sport]
  );
  const movedRows = visible.filter((r) => moved(r) && !staleIds.has(r.id));
  const movedIds = new Set(movedRows.map((r) => r.id));
  const props = visible.filter((r) => r.kind === "prop" && !movedIds.has(r.id));
  const sides = visible.filter((r) => r.kind === "side" && !movedIds.has(r.id));
  const nothing = snap.rows.length === 0;
  const emptyMsg = nothing
    ? "No rows."
    : sport !== "ALL" && visible.length === 0
      ? "No rows for this sport."
      : "No rows.";

  return (
    <>
      {/* 1. Sport rail — a chip only when that sport has real rows */}
      <nav aria-label="Sports" className="flex flex-wrap items-center gap-2">
        {sports.length === 0 ? (
          <p className="text-sm text-zinc-500">Waiting on a real print.</p>
        ) : (
          <>
            <Chip active={sport === "ALL"} onClick={() => setSport("ALL")}>
              All
            </Chip>
            {sports.map((s) => (
              <Chip key={s} active={sport === s} onClick={() => setSport(s)}>
                {SPORT_LABEL[s]}
              </Chip>
            ))}
          </>
        )}
        {snap.source && (
          <span className="ml-auto text-[11px] text-zinc-500">
            Printed {ptTime(snap.pulledAt)} · {snap.source}
          </span>
        )}
      </nav>

      {/* 2. Moved  3. Props  4. Sides */}
      <Section title="Moved" rows={movedRows} tokens={tokens} staleIds={staleIds} onOpen={setOpen} empty={emptyMsg} />
      <Section title="Props" rows={props} tokens={tokens} staleIds={staleIds} onOpen={setOpen} empty={emptyMsg} />
      <Section title="Sides" rows={sides} tokens={tokens} staleIds={staleIds} onOpen={setOpen} empty={emptyMsg} />

      <PrintHistory row={open} onClose={() => setOpen(null)} />
    </>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
        active
          ? "border-purple-400/70 bg-purple-500/20 text-white"
          : "border-purple-500/25 bg-black/40 text-zinc-400 hover:border-purple-400/50"
      }`}
    >
      {children}
    </button>
  );
}
