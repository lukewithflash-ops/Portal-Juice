import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import VipRecordClient from "@/components/VipRecordClient";

export const metadata: Metadata = { title: "VIP record", description: "Every Portal VIP pick, graded from the ESPN final. Wins and losses. Not a guarantee." };

export default function Page() {
  return (
    <>
      <PageHeader title="VIP record" sub="Every pick, wins and losses." />
      <VipRecordClient />
    </>
  );
}
