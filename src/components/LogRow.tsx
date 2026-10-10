"use client";

import { gameRoute } from "@/lib/gameRoute";
import PortalRecap from "@/components/PortalRecap";
import Link from "next/link";
import { useState } from "react";
import Mark from "@/components/Mark";
import { LegMeter } from "@/components/LegMeter";
import type { PickLook } from "@/components/useLogLeans";
import { checkHref, legFromLogged } from "@/lib/breakdown";
import { TONE_COLOR, type Leg } from "@/lib/motivation";
import { fmtLine } from "@/lib/odds";
import { removePick, setStatus } from "@/lib/pickStore";
import { shortDate } from "@/lib/time";
import type { Pick, PickStatus } from "@/lib/types";

const STATUSES: PickStatus[] = ["open", "win", "loss", "push"];
const WORD: Record<PickStatus, string> = { open: "Open", win: "Won", loss: "Lost", push: "Push" };

/** Gold won, red lost, gray push. Open: the live meter tone, else purple. */
export function rowColor(p: Pick, leg: Leg | null): string {
  if (p.status === "win") return "var(--gold)";
  if (p.status === "loss") return "var(--minus)";
  if (p.status === "push") return "var(--push)";
  if (leg) return TONE_COLOR[leg.tone];
  return "#a78bfa";
}

/** One logged pick, laid out like a Props row. */
export default function LogRow({
  pick,
  leg,
  live,
  look,
}: {
  pick: Pick;
  leg: Leg | null;
  live: boolean;
  look: PickLook | null;
}) {
  const [open, setOpen] = useState(false);
  const color = rowColor(pick, leg);
  const legIn = legFromLogged(pick);
  const ml = /money|^ml$/i.test(pick.market ?? "");
  const side = pick.selection ? `${pick.selection} ${pick.line}` : ml ? "to win" : fmtLine(pick.line, pick.line < 0);

  return (
    <li className={`foil-tile list-none overflow-hidden ${pick.status === "win" ? "gold-edge" : ""}`} style={{ borderLeft: `3px solid ${color}` }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
        <Mark team={look?.mark?.abbr ?? ""} headshotUrl={look?.mark?.img ?? null} label={pick.subject} size={36} league={pick.league} contain={look?.mark?.logo ?? false} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {live ? <span className="h-1.5 w-1.5 flex-none animate-pulse rounded-full bg-[color:var(--minus)]" aria-label="Live" /> : null}
            <span className="truncate text-sm font-bold text-[color:var(--flat)]">{pick.subject}</span>
          </div>
          <div className="truncate text-[11px] text-zinc-500">
            {pick.market ? `${pick.market} · ` : ""}
            {side}
            {look?.sub ? ` · ${look.sub}` : ""} · {pick.book} · {shortDate(pick.date)}
          </div>
        </div>
        <div className="flex-none text-right">
          <div className="tabular text-base font-black text-[color:var(--flat)]">{pick.odds > 0 ? `+${pick.odds}` : pick.odds}</div>
          <div className="text-[10px] font-black uppercase tracking-wider" style={{ color }}>
            {live && leg ? (leg.status === "cleared" ? "Hit!" : leg.status === "behind" ? "Behind" : "Live") : WORD[pick.status]}
          </div>
        </div>
      </button>

      {leg && pick.status === "open" && leg.status !== "waiting" ? (
        <div className="px-3 pb-2">
          <LegMeter leg={leg} mini />
        </div>
      ) : null}

      {open ? (
        <div className="space-y-2 border-t border-white/5 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1" role="group" aria-label="Status">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(pick.id, s)}
                  aria-pressed={pick.status === s}
                  className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    pick.status === s ? `pill-${s}` : "border-zinc-700/70 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {pick.league && pick.gameId && (pick.status !== "open" || leg?.final) ? <PortalRecap pick={pick} /> : null}
            {pick.status === "open" ? (
              <button type="button" onClick={() => setStatus(pick.id, "loss")} className="rounded-md border border-red-500/50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-red-300 hover:bg-red-500/10">
                Mark lost
              </button>
            ) : null}
            <div className="flex items-center gap-3">
              {legIn ? (
                <Link href={checkHref([legIn])} className="text-[11px] font-bold text-purple-200/90 hover:text-white">
                  Analyze
                </Link>
              ) : null}
              {pick.league && pick.gameId ? (
                <Link href={gameRoute(pick.league, pick.gameId)} className="text-[11px] text-zinc-400 hover:text-white">
                  Game
                </Link>
              ) : null}
              <button type="button" onClick={() => removePick(pick.id)} className="text-[11px] text-zinc-500 hover:text-zinc-300">
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}
