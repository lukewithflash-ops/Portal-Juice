import type { Metadata } from "next";
import { after } from "next/server";
import PageHeader from "@/components/PageHeader";
import RecordList, { type RecordItem } from "@/components/RecordList";
import { HISTORY } from "@/data/history";
import { COLD_MIN_SAMPLE, HOT_MIN_SAMPLE, HOT_WINDOW, coldProps, hotProps, streakingPlayers, streakingTeams, type RateRow, type StreakRow } from "@/lib/board";
import { historyInfo, historyLines, runHistory } from "@/lib/historyStore";

export const metadata: Metadata = {
  title: "Board",
  description: "Players and teams on a run, hot and cold props. Hit rate and sample size only.",
};
export const dynamic = "force-dynamic";

const EMPTY = "No rows yet. Rows appear as finished games are graded from ESPN.";

const pct = (h: number, n: number) => (n ? Math.round((h / n) * 100) : 0);

const fromStreak = (r: StreakRow, signed: boolean): RecordItem => ({
  key: r.key,
  subject: r.subject,
  team: r.team,
  market: r.market,
  stat: r.streak,
  statKind: "streak",
  detail: `${pct(r.hits, r.sample)}% hit (${r.hits} of ${r.sample})`,
  sample: r.sample,
  lastLine: r.lastLine,
  lastLineSigned: signed,
  lastDate: r.lastDate,
  headshotUrl: r.headshotUrl,
});

const fromRate = (r: RateRow): RecordItem => ({
  key: r.key,
  subject: r.subject,
  team: r.team,
  market: r.market,
  stat: Math.round(r.hitRate * 100),
  statKind: "rate",
  detail: `${r.hits} of ${r.sample}`,
  sample: r.sample,
  lastLine: r.lastLine,
  lastLineSigned: false,
  lastDate: r.lastDate,
  headshotUrl: r.headshotUrl,
});

function pt(iso: string) {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " PT";
}

export default async function BoardPage() {
  // Graded lines from the store (ESPN closing lines + final box scores), plus any static seed rows.
  const stored = await historyLines().catch(() => []);
  const lines = [...HISTORY, ...stored];
  const info = await historyInfo(stored).catch(() => null);
  // Keep grading: each view grades a few more finished games (locked; at most one batch at a time).
  after(() => runHistory({ games: 6, backfillDays: 3, lockS: 50 }).catch(() => {}));
  const players = streakingPlayers(lines).map((r) => fromStreak(r, false));
  const teams = streakingTeams(lines).map((r) => fromStreak(r, true));
  const hot = hotProps(lines).map(fromRate);
  const cold = coldProps(lines).map(fromRate);

  return (
    <>
      <PageHeader
        title="Board"
        sub="Runs and records from graded lines."
        note={
          info
            ? `Store: ${info.lines.toLocaleString()} graded lines (${info.props.toLocaleString()} props, ${info.sides.toLocaleString()} spreads) over ${info.days} days${info.from ? `, ${info.from} to ${info.to}` : ""}. ${info.games} games graded${info.queued ? `, ${info.queued} waiting` : ""}${info.lastAt ? `. Last graded ${pt(info.lastAt)}` : ""}. Closing DraftKings lines and finals from ESPN.`
            : undefined
        }
      />
      <div data-testid="board-store" hidden data-lines={info?.lines ?? 0} />
      <RecordList title="Players on a run" blurb="Most props in a row that went over the closing line." items={players} empty={EMPTY} />
      <RecordList title="Teams on a run" blurb="Most games in a row covering the closing spread." items={teams} empty={EMPTY} />
      <RecordList title="Hot props" blurb={`Highest hit rate over the last ${HOT_WINDOW} stored lines (min ${HOT_MIN_SAMPLE}).`} items={hot} empty={EMPTY} />
      {/* Cold: anyone under 8 lines is hidden; with nobody left, the section is hidden. */}
      {cold.length > 0 && (
        <RecordList title="Cold props" blurb={`Lowest hit rate over the last ${HOT_WINDOW} stored lines. Minimum ${COLD_MIN_SAMPLE} lines.`} items={cold} empty={EMPTY} />
      )}
    </>
  );
}
