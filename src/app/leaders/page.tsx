import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import LeadersList from "@/components/LeadersList";
import { LEADER_MIN, LEADER_NOTE } from "@/lib/leaderRank";
import { leaderAccounts, leadersEnabled, listLeaders } from "@/lib/leaders";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leaders",
  description: "Opt-in logs ranked by hit rate and sample size. Past hits are not a pick.",
};

export default async function LeadersPage() {
  const enabled = leadersEnabled();
  let rows: Awaited<ReturnType<typeof listLeaders>> = [];
  let acct: string[] = [];
  try {
    [rows, acct] = await Promise.all([listLeaders(), leaderAccounts()]);
  } catch {
    rows = [];
  }
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Leaders" sub={LEADER_NOTE} note={<>Hit rate, then sample size. {LEADER_MIN}+ graded lines, self-reported. Copy adds open lines to your Log. Nothing is placed.</>} />
      {!enabled ? (
        <p className="panel rounded-xl px-4 py-4 text-sm text-zinc-400">Leaders open when the store is connected.</p>
      ) : rows.length === 0 ? (
        <p className="panel rounded-xl px-4 py-4 text-sm text-zinc-400">
          No one has published {LEADER_MIN}+ graded lines yet. Publish yours from the Log.
        </p>
      ) : (
        <LeadersList rows={rows} accounts={acct} />
      )}
    </div>
  );
}
