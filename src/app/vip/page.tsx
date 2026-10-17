import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import VipClient from "@/components/VipClient";

export const metadata: Metadata = { title: "VIP", description: "Portal VIP: the day’s strongest data-backed picks, with a public W/L/P record. Not a guarantee." };

export default function Page() {
  return (
    <>
      <PageHeader title="VIP" sub="Data-backed picks. Public record." />
      <VipClient />
    </>
  );
}
