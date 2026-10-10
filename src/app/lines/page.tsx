import type { Metadata } from "next";
import { BestStrip, BEST_NOTE } from "@/components/BestLists";
import GamesBoard from "@/components/GamesBoard";
import MascotSlot from "@/components/MascotSlot";
import Link from "next/link";
import { biggestMoves, hotTrends, marketFavorites } from "@/lib/best";
import LineBoard from "@/components/LineBoard";
import { getSlate, getTrends } from "@/lib/espn";
import { PortalPickPanel } from "@/components/PortalPickPanel";
import { portalPickToday } from "@/lib/portalPickStore";
import { sportsDate } from "@/lib/slate";
import { getSnapshot } from "@/lib/feed";
import { isStale } from "@/lib/move";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lines",
  description: "Today's games, totals, and live prop lines. Juice first. Read-only.",
};

export default async function LinesPage() {
  const [snap, slate, trends] = await Promise.all([getSnapshot(), getSlate(), getTrends()]);
  // eslint-disable-next-line react-hooks/purity -- request-time staleness check
  const now = Date.now();
  const staleIds = snap.rows.filter((r) => isStale(r, now)).map((r) => r.id);
  const portal = await portalPickToday(slate.games, sportsDate());
  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <MascotSlot size={64} />
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">Lines</h1>
          <p className="mt-1 text-sm text-zinc-400">The number moved. Tap a line for its history.</p>
        </div>
      </div>
      <div className="mb-4">
        <PortalPickPanel pick={portal.pick} record={portal.record} tracked={portal.tracked} compact />
      </div>
      <section className="mb-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-purple-200/80">Best</h2>
          <Link href="/best" className="text-[11px] font-semibold text-[color:var(--gold)]">All lists</Link>
        </div>
        <p className="mb-2 text-[11px] text-zinc-500">{BEST_NOTE}</p>
        <BestStrip
          fav={marketFavorites(slate.games)[0] ?? null}
          move={biggestMoves(slate.games)[0] ?? null}
          hot={hotTrends(trends.trends)[0] ?? null}
        />
      </section>
      <GamesBoard games={slate.games} fetchedAt={slate.fetchedAt} dayLabel={slate.dayLabel} missing={slate.missing} />
      <div className="mt-10 border-t border-purple-500/15 pt-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-purple-200/80">Props and sides</h2>
        <LineBoard initial={snap} initialStaleIds={staleIds} />
      </div>
    </>
  );
}
