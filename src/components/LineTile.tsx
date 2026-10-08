"use client";

import CountUp from "@/components/CountUp";
import Mark from "@/components/Mark";
import { dirClass, juiceDir, lineDir } from "@/lib/move";
import { fmtLine, fmtOdds } from "@/lib/odds";
import { ptDayTime } from "@/lib/time";
import type { LineRow } from "@/lib/types";

/**
 * One prop / side as a ticket. Hierarchy: juice (largest) → line → name.
 * Tapping opens the print history only. Nothing here places a wager.
 */
export default function LineTile({
  row,
  pulseToken,
  stale,
  onOpen,
}: {
  row: LineRow;
  /** Bumps when juice changed on a refresh → one pulse. 0 = no pulse. */
  pulseToken: number;
  stale: boolean;
  onOpen: (row: LineRow) => void;
}) {
  const signed = row.selection === null;
  const jd = juiceDir(row);
  const ld = lineDir(row);
  const movedDir = jd !== 0 ? jd : ld;
  const lineDelta =
    row.prevLine === null ? 0 : Number((row.line - row.prevLine).toFixed(1));

  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className={`foil-tile block w-full p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400/70 ${
        movedDir !== 0 && !stale ? `line-moved ${movedDir < 0 ? "against" : ""}` : ""
      } ${stale ? "stale" : ""}`}
      aria-label={`${row.subject}, ${row.market} ${row.selection ?? ""} ${fmtLine(
        row.line,
        signed
      )}, ${fmtOdds(row.juice)}. Show print history.`}
    >
      <div className="flex items-start gap-3">
        <Mark team={row.team} headshotUrl={row.headshotUrl} label={row.subject} size={44} />
        <div className="min-w-0 flex-1">
          {/* 3rd: name */}
          <h3 className="truncate text-sm font-bold leading-tight text-[color:var(--flat)]">
            {row.subject}
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-zinc-400">
            <span className="font-semibold text-zinc-300">{row.team}</span>
            {row.home ? " vs " : " @ "}
            <span className="font-semibold text-zinc-300">{row.opponent}</span>
            <span className="text-zinc-600"> · </span>
            <span className="text-purple-200/90">{row.market}</span>
          </p>
        </div>
        {stale ? (
          <span className="shrink-0 rounded-md border border-zinc-600/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            Stale
          </span>
        ) : (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {row.book}
          </span>
        )}
      </div>

      <div className="ticket-rule mt-3 flex items-end justify-between gap-3 pt-3">
        {/* 1st: juice */}
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Juice
          </div>
          <span className="relative block">
            {!stale && pulseToken > 0 && (
              <span
                key={pulseToken}
                aria-hidden
                className={`juice-pulse ${jd < 0 ? "against" : ""} pointer-events-none absolute -inset-x-2 -inset-y-1 rounded-xl`}
              />
            )}
            <CountUp
              value={row.juice}
              kind="odds"
              className={`big-num block text-[3.4rem] font-black sm:text-6xl ${
                stale ? "text-[color:var(--flat)]" : dirClass(jd)
              }`}
            />
          </span>
          {jd !== 0 && row.prevJuice !== null && (
            <div className="mt-1 text-[11px] text-zinc-500">
              was <span className="tabular">{fmtOdds(row.prevJuice)}</span>
            </div>
          )}
        </div>
        {/* 2nd: line */}
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {row.selection ?? "Line"}
          </div>
          <CountUp
            value={row.line}
            kind={signed ? "signedLine" : "line"}
            className={`big-num block text-3xl font-extrabold ${
              stale ? "text-[color:var(--flat)]" : dirClass(ld)
            }`}
          />
          {lineDelta !== 0 && (
            <div className="mt-1 text-[11px] text-zinc-500">
              was <span className="tabular">{fmtLine(row.prevLine!, signed)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
        <span>{ptDayTime(row.startsAt)}</span>
        <span className="uppercase tracking-wider">{row.sport}</span>
      </div>
    </button>
  );
}
