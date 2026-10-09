"use client";

import { useEffect, useState } from "react";
import { implied } from "@/lib/odds";

const KEY = "pj-mvp-seen-v1";

type Row = { id: string; name: string; team: string; odds: string; oddsNum: number };

type Move = Row & { from: number; to: number; delta: number };

export default function MvpMovers({ rows }: { rows: Row[] }) {
  const [moves, setMoves] = useState<Move[]>([]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      let seen: Record<string, number> = {};
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) seen = JSON.parse(raw) as Record<string, number>;
      } catch {
        seen = {};
      }
      const next: Move[] = [];
      const save: Record<string, number> = { ...seen };
      for (const row of rows) {
        const prev = seen[row.id];
        if (typeof prev === "number" && prev !== row.oddsNum) {
          next.push({ ...row, from: prev, to: row.oddsNum, delta: implied(row.oddsNum) - implied(prev) });
        }
        save[row.id] = row.oddsNum;
      }
      try {
        localStorage.setItem(KEY, JSON.stringify(save));
      } catch {
        /* private mode */
      }
      next.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      setMoves(next.slice(0, 5));
    });
    return () => cancelAnimationFrame(id);
  }, [rows]);

  if (!moves.length) return null;
  return (
    <section className="mt-8">
      <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-purple-200/80">Biggest movers</h2>
      <p className="mt-1 mb-3 text-[11px] text-zinc-500">
        Change versus the price stored on this device. Not a pick.
      </p>
      <ul className="space-y-2">
        {moves.map((m) => (
          <li key={m.id} className="foil-tile flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
            <span className="truncate text-[color:var(--flat)]">
              {m.name}
              {m.team ? <span className="text-zinc-500"> · {m.team}</span> : null}
            </span>
            <span className={`tabular font-bold ${m.delta < 0 ? "text-[color:var(--plus)]" : m.delta > 0 ? "text-[color:var(--minus)]" : "text-[color:var(--flat)]"}`}>
              {m.from > 0 ? `+${m.from}` : m.from} → {m.odds}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
