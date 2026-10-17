"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getPicks, getServerPicks, subscribe } from "@/lib/pickStore";
import { duplicates, type CheckLeg, type Flag } from "@/lib/slipCheck";
import type { ImportLeg } from "@/lib/slipImport";

const ICON: Record<Flag["kind"], string> = { injury: "🩹", conflict: "⚔", moved: "↕", started: "⏱", final: "🏁", duplicate: "⧉" };

export function checkLegOf(x: ImportLeg): CheckLeg {
  return {
    subject: x.row.subject,
    kind: x.row.kind,
    market: x.row.market,
    line: x.row.line,
    selection: x.row.selection,
    league: x.game?.league ?? x.leg?.league ?? x.row.league ?? null,
    gameId: x.game?.id ?? x.leg?.gameId ?? null,
    athleteId: x.leg?.athleteId ?? null,
    side: x.leg?.side ?? null,
  };
}

/** Real flags before saving: injury report, conflicts, line moves, game state, duplicates. Never blocks. */
export default function SlipCheck({ legs }: { legs: CheckLeg[] }) {
  const picks = useSyncExternalStore(subscribe, getPicks, getServerPicks);
  const [server, setServer] = useState<Flag[] | null>(null);
  const sig = JSON.stringify(legs);
  useEffect(() => {
    if (!legs.length) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      fetch("/api/slip/check", { method: "POST", headers: { "content-type": "application/json" }, body: sig, signal: ac.signal })
        .then((r) => r.json())
        .then((j: { flags?: Flag[] }) => setServer(j.flags ?? []))
        .catch(() => {});
    }, 400);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
    // sig carries legs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  const dup = useMemo(() => duplicates(legs, picks), [legs, picks]);
  const flags = [...(server ?? []), ...dup];
  if (!legs.length) return null;
  return (
    <div className="slip-check rounded-xl p-2.5" data-testid="slip-check" aria-live="polite">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-200">Slip check</span>
        <span className="text-[10px] text-zinc-500">{server == null ? "Checking ESPN…" : flags.length ? `${flags.length} flag${flags.length === 1 ? "" : "s"} · saving still works` : "All clear"}</span>
      </div>
      {flags.length ? (
        <ul className="mt-1.5 space-y-1">
          {flags.map((f, i) => (
            <li key={i} className={"slip-flag flex gap-1.5 text-[12px] leading-snug " + (f.kind === "conflict" || f.kind === "final" ? "text-red-200" : "text-amber-100")} data-testid="slip-flag" data-kind={f.kind}>
              <span aria-hidden>{ICON[f.kind]}</span>
              <span>
                <b className="text-white">{legs[f.leg]?.subject ?? `Leg ${f.leg + 1}`}</b>
                {f.other != null ? <span className="text-zinc-400"> + {legs[f.other]?.subject}</span> : null}: {f.text}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
