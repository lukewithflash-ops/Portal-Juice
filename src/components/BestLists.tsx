import Link from "next/link";
import { OddsText } from "@/components/Prefs";
import Mark from "@/components/Mark";
import { mvpHomework, pct, type Favorite, type HotTrend, type LineMove } from "@/lib/best";
import type { MvpRow } from "@/lib/espn";
import { checkHref, type LegInput } from "@/lib/breakdown";

export const BEST_NOTE = "Ranked by the numbers. Not a guarantee.";

/** One ranked row: title, the homework sentence, and the number it ranks on. Whole row taps through. */
function Row({
  rank,
  href,
  title,
  sub,
  homework,
  mark,
  metric,
  metricTone,
  metricSub,
  analyze,
}: {
  rank: number;
  href: string;
  title: React.ReactNode;
  sub?: string;
  homework: string;
  mark?: React.ReactNode;
  metric: React.ReactNode;
  metricTone?: "plus" | "minus" | "flat";
  metricSub?: string;
  analyze?: LegInput | null;
}) {
  const first = rank === 1;
  const tone =
    first ? "tone-gold" : metricTone === "plus" ? "text-[color:var(--plus)]" : metricTone === "minus" ? "text-[color:var(--minus)]" : "text-[color:var(--flat)]";
  return (
    <li className={first ? "gold-edge rounded-2xl" : ""}>
      <Link href={href} className="foil-tile flex min-h-[64px] items-start gap-3 px-3 py-3 active:scale-[0.99]">
        <span className={`mt-0.5 w-5 flex-none text-center tabular text-sm font-black ${first ? "tone-gold" : "text-zinc-500"}`}>{rank}</span>
        {mark}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-[color:var(--flat)]">{title}</span>
          {sub ? <span className="block truncate text-[11px] text-zinc-500">{sub}</span> : null}
          <span className="mt-1 block text-[13px] leading-snug text-zinc-300">{homework}</span>
        </span>
        <span className="flex-none text-right">
          <span className={`block tabular text-lg font-black ${tone}`}>{metric}</span>
          {metricSub ? <span className="block text-[10px] uppercase tracking-wider text-zinc-500">{metricSub}</span> : null}
        </span>
      </Link>
      {analyze ? (
        <Link href={checkHref([analyze])} className="mt-1 mr-2 block text-right text-[11px] font-bold text-purple-200/80 hover:text-white">
          Analyze →
        </Link>
      ) : null}
    </li>
  );
}

function favLeg(r: Favorite): LegInput | null {
  const m = /^\/games\/([a-z]+)\/(\d+)/.exec(r.href);
  const n = Number(String(r.odds).replace(/[^\d+-]/g, ""));
  return m ? { league: m[1], gameId: m[2], kind: "moneyline", team: r.side, odds: Number.isFinite(n) && Math.abs(n) >= 100 ? n : null } : null;
}

/** Trend ids are league-athlete-stat. No line on a trend; the check asks for one. */
function trendLeg(r: HotTrend): LegInput | null {
  const [, athleteId, stat] = r.id.split("-");
  return athleteId && stat ? { league: r.league, gameId: r.gameId, kind: "prop", athleteId, athleteName: r.name, stat, pick: "over" } : null;
}

export function FavoriteList({ rows }: { rows: Favorite[] }) {
  if (!rows.length) return <p className="text-sm text-zinc-400">No moneylines posted.</p>;
  return (
    <ol className="space-y-2">
      {rows.map((r, i) => (
        <Row
          key={r.id}
          rank={i + 1}
          href={r.href}
          title={r.side}
          sub={`${r.label} · moneyline`}
          homework={r.homework}
          metric={pct(r.implied)}
          metricSub="implied"
          analyze={favLeg(r)}
        />
      ))}
    </ol>
  );
}

export function MoveList({ rows }: { rows: LineMove[] }) {
  if (!rows.length) return <p className="text-sm text-zinc-400">No open-to-current move posted yet.</p>;
  return (
    <ol className="space-y-2">
      {rows.map((r, i) => (
        <Row
          key={r.id}
          rank={i + 1}
          href={r.href}
          title={r.label}
          sub={r.provider}
          homework={r.homework}
          metric={`${r.delta > 0 ? "▲" : "▼"} ${Math.abs(Math.round(r.delta * 10) / 10)}`}
          metricTone={r.delta > 0 ? "plus" : "minus"}
          metricSub={r.id.endsWith("total") ? "total" : "spread"}
        />
      ))}
    </ol>
  );
}

export function TrendList({ rows }: { rows: HotTrend[] }) {
  if (!rows.length) return <p className="text-sm text-zinc-400">No last-5 versus season split posted.</p>;
  return (
    <ol className="space-y-2">
      {rows.map((r, i) => (
        <Row
          key={r.id}
          rank={i + 1}
          href={`/games/${r.league}/${r.gameId}`}
          title={r.name}
          sub={`${r.team} · ${r.matchup}`}
          homework={r.homework}
          mark={<Mark team={r.team} headshotUrl={r.headshot} label={r.name} size={36} />}
          metric={`+${r.delta}`}
          metricTone="plus"
          metricSub={r.statLabel}
          analyze={trendLeg(r)}
        />
      ))}
    </ol>
  );
}

export function MvpList({ rows, provider }: { rows: MvpRow[]; provider: string }) {
  const usable = rows
    .map((r) => ({ r, homework: mvpHomework(r, provider) }))
    .filter((x): x is { r: MvpRow; homework: string } => x.homework !== null)
    .slice(0, 5);
  if (!usable.length) return <p className="text-sm text-zinc-400">No MVP prices posted.</p>;
  return (
    <ol className="space-y-2">
      {usable.map(({ r, homework }, i) => (
        <Row
          key={r.id}
          rank={i + 1}
          href="/mvp"
          title={r.name}
          sub={r.team}
          homework={homework}
          mark={<Mark team={r.team} headshotUrl={r.headshot} label={r.name} size={36} />}
          metric={<OddsText value={r.odds} />}
          metricSub={pct(r.implied)}
        />
      ))}
    </ol>
  );
}

/** /lines strip: the #1 of each list with its homework. */
export function BestStrip({ fav, move, hot }: { fav: Favorite | null; move: LineMove | null; hot: HotTrend | null }) {
  const items = [
    fav ? { key: "fav", group: "Market favorite", href: fav.href, title: `${fav.side} · ${fav.label}`, homework: fav.homework } : null,
    move ? { key: "move", group: "Biggest move", href: move.href, title: move.label, homework: move.homework, delta: move.delta } : null,
    hot ? { key: "hot", group: "Hot player", href: `/games/${hot.league}/${hot.gameId}`, title: hot.name, homework: hot.homework } : null,
  ].filter((x) => x !== null);
  if (!items.length) return <p className="text-sm text-zinc-400">Nothing ranked yet today.</p>;
  return (
    <ol className="space-y-2">
      {items.map((it) => (
        <li key={it.key} className="gold-edge rounded-2xl">
          <Link href={it.href} className="foil-tile block px-3 py-3 active:scale-[0.99]">
            <span className="block text-[10px] font-black uppercase tracking-[0.2em] tone-gold">{it.group}</span>
            <span className="mt-0.5 block truncate text-[15px] font-bold text-[color:var(--flat)]">{it.title}</span>
            <span
              className={
                "mt-1 block text-[13px] leading-snug " +
                ("delta" in it && typeof it.delta === "number"
                  ? it.delta > 0
                    ? "text-[color:var(--plus)]"
                    : "text-[color:var(--minus)]"
                  : "text-zinc-300")
              }
            >
              {it.homework}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
