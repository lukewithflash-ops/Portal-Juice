import type { Metadata } from "next";
import LineBoard from "@/components/LineBoard";
import { getSnapshot } from "@/lib/feed";
import { isStale } from "@/lib/move";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lines",
  description: "Live prop and side lines. Juice first. Read-only.",
};

export default async function LinesPage() {
  const snap = await getSnapshot();
  // eslint-disable-next-line react-hooks/purity -- request-time staleness check
  const now = Date.now();
  const staleIds = snap.rows.filter((r) => isStale(r, now)).map((r) => r.id);
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">Lines</h1>
      <p className="mt-1 mb-6 text-sm text-zinc-400">Juice first. Tap a card for its print history.</p>
      <LineBoard initial={snap} initialStaleIds={staleIds} />
    </>
  );
}
