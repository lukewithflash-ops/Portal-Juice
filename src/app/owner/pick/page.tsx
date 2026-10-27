import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import OwnerPickForm from "@/components/OwnerPickForm";
import { currentUser } from "@/lib/auth";
import { isOwner } from "@/lib/vipAccess";
import { getSlate } from "@/lib/espn";
import { sportsDate } from "@/lib/slate";
import { DAILY_PICK_NAME, isDraftKings } from "@/lib/ownerPick";
import { ownerSlot } from "@/lib/ownerPickStore";

export const dynamic = "force-dynamic";
export const metadata = { title: "Post pick", robots: { index: false } };

export default async function OwnerPickPage() {
  const u = await currentUser().catch(() => null);
  if (!isOwner(u)) notFound();
  const d = sportsDate();
  const [slate, vip, free] = await Promise.all([getSlate(), ownerSlot("vip", d), ownerSlot("free", d)]);
  const games = slate.games.filter((g) => g.state === "pre" && g.price && isDraftKings(g.price.provider));
  return (
    <>
      <PageHeader title={`Post ${DAILY_PICK_NAME}`} sub="Owner only. Real DraftKings numbers from today's slate." />
      <OwnerPickForm games={games} posted={{ vip: vip.pick, free: free.pick }} />
    </>
  );
}
