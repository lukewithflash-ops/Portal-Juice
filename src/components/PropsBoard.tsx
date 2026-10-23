"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import Mark from "@/components/Mark";
import Milestones from "@/components/Milestones";
import { NoteTag } from "@/components/Notes";
import { OddsText } from "@/components/Prefs";
import HitChip, { heatColor } from "@/components/HitChip";
import { checkHref, statFromMarket, STAT_OPTIONS } from "@/lib/breakdown";
import { gameRoute } from "@/lib/gameRoute";
import { matchupKey } from "@/lib/notesCore";
import type { PropsGroup } from "@/lib/espn";
import { useVip } from "@/lib/vipClient";

/** Free sees the heat on this many rows; VIP sees the full map. */
const FREE_HEAT_ROWS = 6;

const num = (s: string | null) => {
  const m = /-?\d+(?:\.\d+)?/.exec(s ?? "");
  return m ? Number(m[0]) : null;
};
const statLabel = (league: string, key: string) => STAT_OPTIONS[league]?.find((o) => o.key === key)?.label ?? key;

/** Props with a heat map: each player colored by how often they cleared the line over their last 10 (ESPN game logs). */
export default function PropsBoard({ groups }: { groups: PropsGroup[] }) {
  const leagues = useMemo(() => [...new Set(groups.map((g) => g.game.league))], [groups]);
  const [league, setLeague] = useState("all");
  const [stat, setStat] = useState("all");
  const [shift, setShift] = useState(0);
  const [hot, setHot] = useState(false);
  const [rates, setRates] = useState<Record<string, number | null>>({});
  const vip = useVip();
  const full = vip.vip;
  let heatShown = 0;
  const onRate = useCallback((k: string, r: number | null) => setRates((m) => (m[k] === r ? m : { ...m, [k]: r })), []);
  const stats = useMemo(() => {
    const s = new Map<string, string>();
    for (const g of groups) if (league === "all" || g.game.league === league) for (const p of g.props) {
      const k = statFromMarket(g.game.league, p.market);
      if (k) s.set(k, statLabel(g.game.league, k));
    }
    return [...s.entries()];
  }, [groups, league]);
  const rows = groups
    .filter((g) => league === "all" || g.game.league === league)
    .map((g) => ({ g, props: g.props.filter((p) => stat === "all" || statFromMarket(g.game.league, p.market) === stat) }))
    .filter((x) => x.props.length || (stat === "all" && (x.g.milestones?.length ?? 0) > 0));
  const flat = hot && full
    ? rows.flatMap(({ g, props }) => props.map((p) => ({ g, p }))).sort((a, b) => (rates[keyOf(b.g, b.p, shift)] ?? -1) - (rates[keyOf(a.g, a.p, shift)] ?? -1))
    : null;

  const row = (g: PropsGroup, p: PropsGroup["props"][number]) => {
    const k = statFromMarket(g.game.league, p.market);
    const line = num(p.line);
    const chosen = line == null ? null : line + shift;
    const key = keyOf(g, p, shift);
    const open = full || heatShown < FREE_HEAT_ROWS;
    if (k && chosen != null && p.athleteId) heatShown++;
    const rate = open ? rates[key] : null;
    return (
      <li key={`${g.game.id}-${p.athleteId}-${p.market}`} className="foil-tile heat-row flex items-center gap-2 px-3 py-2" style={rate != null ? ({ "--heat": heatColor(rate) } as React.CSSProperties) : undefined} data-testid="heat-row">
        <Mark team={p.team} headshotUrl={p.headshot} label={p.name} size={32} league={g.game.league} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-[color:var(--flat)]">
            {p.name} <NoteTag player={{ name: p.name, id: p.athleteId ?? null }} />
          </div>
          <div className="truncate text-[11px] text-zinc-500">
            {p.market}
            {flat ? ` · ${g.game.away.abbr} @ ${g.game.home.abbr}` : ""}
          </div>
        </div>
        {k && chosen != null && p.athleteId ? (
          open ? (
            <HitChip req={{ league: g.game.league, athleteId: p.athleteId, stat: k, line: chosen }} onRate={(r) => onRate(key, r)} />
          ) : (
            <Link href="/vip" className="web-only shrink-0 rounded-md border border-[color:var(--gold)]/40 px-1.5 py-0.5 text-[10px] font-black text-[color:var(--gold)]" aria-label="Heat for VIP" data-testid="heat-locked">
              🔒 VIP
            </Link>
          )
        ) : null}
        <div className="tabular text-right font-black text-[color:var(--flat)]">
          {shift && chosen != null ? <span>{chosen}</span> : <OddsText value={p.line} />}
          {p.openLine ? <div className="text-[10px] font-medium text-zinc-500">Opened {p.openLine}</div> : null}
        </div>
        {k ? (
          <Link
            href={checkHref([{ league: g.game.league, gameId: g.game.id, kind: "prop", athleteId: p.athleteId, athleteName: p.name, stat: k, line: chosen ?? line, openLine: num(p.openLine), pick: "over" }])}
            className="shrink-0 rounded-lg border border-purple-400/50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-purple-100 hover:bg-purple-500/20"
            aria-label={`Analyze ${p.name} ${p.market}`}
          >
            Analyze
          </Link>
        ) : null}
      </li>
    );
  };

  return (
    <>
      <div className="mb-4 space-y-2" data-testid="heat-filters">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="League">
          {["all", ...leagues].map((l) => (
            <button key={l} type="button" onClick={() => { setLeague(l); setStat("all"); }} className={"chip " + (league === l ? "chip-on" : "")} aria-pressed={league === l}>
              {l === "all" ? "All" : l.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="field text-[13px]" value={stat} onChange={(e) => setStat(e.target.value)} aria-label="Stat" data-testid="heat-stat">
            <option value="all">Every stat</option>
            {stats.map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <div className="flex items-center gap-1 text-[11px] text-zinc-400" role="group" aria-label="Line">
            Line
            {[-1, 0, 1].map((s) => (
              <button key={s} type="button" onClick={() => setShift(s)} className={"chip " + (shift === s ? "chip-on" : "")} aria-pressed={shift === s} data-testid={`heat-shift-${s}`}>
                {s === 0 ? "Posted" : s > 0 ? "+1" : "−1"}
              </button>
            ))}
          </div>
          {full ? (
            <button type="button" onClick={() => setHot((v) => !v)} className={"chip " + (hot ? "chip-on" : "")} aria-pressed={hot} data-testid="heat-sort">
              🔥 Hottest first
            </button>
          ) : (
            <Link href="/vip" className="web-only chip" data-testid="heat-sort-locked">
              🔥 Hottest first · 🔒 VIP
            </Link>
          )}
        </div>
        <p className="text-[11px] text-zinc-500">Chips: times over the line in each player’s last 10 games, from ESPN game logs. Green cleared often, red rarely. Past games, not a promise.</p>
        {vip.loaded && !full ? (
          <p className="web-only text-[11px] text-zinc-400" data-testid="heat-free-note">
            Free shows the heat on the first {FREE_HEAT_ROWS} players.{" "}
            <Link href="/vip" className="font-bold text-[color:var(--gold)]">
              VIP unlocks the full heat map →
            </Link>
          </p>
        ) : null}
      </div>
      {flat ? (
        <ul className="space-y-1.5">{flat.map(({ g, p }) => row(g, p))}</ul>
      ) : (
        <div className="space-y-6">
          {rows.map(({ g, props }) => (
            <section key={g.game.id}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-black text-[color:var(--flat)]">
                  <Link href={gameRoute(g.game.league, g.game.id)} className="hover:text-white">
                    {g.game.away.abbr} @ {g.game.home.abbr}
                  </Link>{" "}
                  <NoteTag matchup={matchupKey(g.game.league, g.game.away.abbr, g.game.home.abbr)} label={`${g.game.away.abbr} vs ${g.game.home.abbr}`} />
                  <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {g.game.leagueLabel}
                    {g.provider ? ` · ${g.provider}` : ""}
                  </span>
                </h2>
                {g.total > g.props.length ? (
                  <Link href={gameRoute(g.game.league, g.game.id)} className="shrink-0 text-[11px] font-semibold text-purple-200/80">
                    {g.total} lines
                  </Link>
                ) : null}
              </div>
              <ul className="space-y-1.5">{props.map((p) => row(g, p))}</ul>
              <Milestones league={g.game.league} gameId={g.game.id} rows={g.milestones ?? []} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function keyOf(g: PropsGroup, p: PropsGroup["props"][number], shift: number) {
  return `${g.game.id}|${p.athleteId}|${p.market}|${shift}`;
}
