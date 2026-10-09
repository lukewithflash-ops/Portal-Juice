import type { Metadata } from "next";
import LeadersList from "@/components/LeadersList";
import { LEADER_MIN, LEADER_NOTE } from "@/lib/leaderRank";
import { leadersEnabled, listLeaders } from "@/lib/leaders";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leaders",
  description: "Opt-in logs ranked by hit rate and sample size. Past hits are not a pick.",
};

export default async function LeadersPage() {
  const enabled = leadersEnabled();
  let rows: Awaited<ReturnType<typeof listLeaders>> = [];
  try {
    rows = await listLeaders();
  } catch {
    rows = [];
  }
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">Leaders</h1>
      <p className="mt-1 text-sm text-zinc-400">{LEADER_NOTE}</p>
      <p className="mt-2 mb-5 text-[12px] leading-snug text-zinc-500">
        Ranked by hit rate (wins over wins plus losses), then sample size. Minimum {LEADER_MIN} graded lines. Results are
        self-reported from each person&apos;s device Log. Copy adds their open lines to your Log to track. It does not place
        anything. Copy is open to everyone for now. VIP access comes with accounts.
      </p>
      {!enabled ? (
        <p className="panel rounded-xl px-4 py-4 text-sm text-zinc-400">Leaders open when the store is connected.</p>
      ) : rows.length === 0 ? (
        <p className="panel rounded-xl px-4 py-4 text-sm text-zinc-400">
          No one has published {LEADER_MIN}+ graded lines yet. Publish yours from the Log.
        </p>
      ) : (
        <LeadersList rows={rows} />
      )}
    </div>
  );
}
