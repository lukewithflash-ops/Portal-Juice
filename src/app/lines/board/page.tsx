import type { Metadata } from "next";
import RecordList, { type RecordItem } from "@/components/RecordList";
import { HISTORY } from "@/data/history";
import {
  COLD_MIN_SAMPLE,
  HOT_MIN_SAMPLE,
  HOT_WINDOW,
  coldProps,
  hotProps,
  streakingPlayers,
  streakingTeams,
  type RateRow,
  type StreakRow,
} from "@/lib/board";

export const metadata: Metadata = {
  title: "Board",
  description: "Players and teams on a run, hot and cold props. Hit rate and sample size only.",
};

const EMPTY = "No rows. Waiting on a real print.";

const fromStreak = (r: StreakRow, signed: boolean): RecordItem => ({
  key: r.key,
  subject: r.subject,
  team: r.team,
  market: r.market,
  stat: r.streak,
  statKind: "streak",
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

export default function BoardPage() {
  const players = streakingPlayers(HISTORY).map((r) => fromStreak(r, false));
  const teams = streakingTeams(HISTORY).map((r) => fromStreak(r, true));
  const hot = hotProps(HISTORY).map(fromRate);
  const cold = coldProps(HISTORY).map(fromRate);

  return (
    <>
      <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">Board</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Records from stored, graded lines. Hit rate and sample size. No money.
      </p>

      <RecordList
        title="Players on a run"
        blurb="Most props in a row that cleared the closing line."
        items={players}
        empty={EMPTY}
      />
      <RecordList
        title="Teams on a run"
        blurb="Most games in a row on the side that covered the closing spread."
        items={teams}
        empty={EMPTY}
      />
      <RecordList
        title="Hot props"
        blurb={`Highest hit rate over the last ${HOT_WINDOW} stored lines (min ${HOT_MIN_SAMPLE}).`}
        items={hot}
        empty={EMPTY}
      />
      {/* Cold: anyone under 8 samples is hidden; with nobody left, the section is hidden. */}
      {cold.length > 0 && (
        <RecordList
          title="Cold props"
          blurb={`Lowest hit rate over the last ${HOT_WINDOW} stored lines. Minimum ${COLD_MIN_SAMPLE} lines.`}
          items={cold}
          empty={EMPTY}
        />
      )}
    </>
  );
}
