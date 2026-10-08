import type { Metadata } from "next";
import GamesBoard from "@/components/GamesBoard";
import LineBoard from "@/components/LineBoard";
import { getSlate } from "@/lib/espn";
import { getSnapshot } from "@/lib/feed";
import { isStale } from "@/lib/move";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lines",
  description: "Today's games, totals, and live prop lines. Juice first. Read-only.",
};

export default async function LinesPage() {
  const [snap, slate] = await Promise.all([getSnapshot(), getSlate()]);
  // eslint-disable-next-line react-hooks/purity -- request-time staleness check
  const now = Date.now();
  const staleIds = snap.rows.filter((r) => isStale(r, now)).map((r) => r.id);
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">Lines</h1>
      <p className="mt-1 mb-5 text-sm text-zinc-400">
        Today’s games and totals up top. Juice first on props. Tap a line for its print history.
      </p>
      <GamesBoard games={slate.games} fetchedAt={slate.fetchedAt} dayLabel={slate.dayLabel} missing={slate.missing} />
      <div className="mt-10 border-t border-purple-500/15 pt-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-purple-200/80">Props and sides</h2>
        <LineBoard initial={snap} initialStaleIds={staleIds} />
      </div>
    </>
  );
}
