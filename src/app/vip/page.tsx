import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import VipClient from "@/components/VipClient";
import { OwnerPickPanel } from "@/components/OwnerPickPanel";
import { ownerSlot } from "@/lib/ownerPickStore";
import { currentUser } from "@/lib/auth";
import { vipState } from "@/lib/vipAccess";
import { sportsDate } from "@/lib/slate";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "VIP", description: "Portal VIP: the day’s strongest data-backed picks, with a public W/L/P record. Not a guarantee." };

export default async function Page() {
  const d = sportsDate();
  const [vip, free, me] = await Promise.all([ownerSlot("vip", d), ownerSlot("free", d), currentUser().catch(() => null)]);
  const isVip = (await vipState(me).catch(() => null))?.vip ?? false;
  return (
    <>
      <PageHeader title="VIP" sub="Data-backed picks. Public record." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <OwnerPickPanel slot="vip" view={vip} locked={!isVip} />
        <OwnerPickPanel slot="free" view={free} />
      </div>
      <VipClient />
    </>
  );
}
