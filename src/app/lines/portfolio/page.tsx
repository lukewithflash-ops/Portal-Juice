import PageHeader from "@/components/PageHeader";
import type { Metadata } from "next";
import PortfolioClient from "@/components/PortfolioClient";

export const metadata: Metadata = {
  title: "Log",
  description: "Log picks you already made. Saved on this device only.",
};

export default function LogPage() {
  return (
    <>
      <PageHeader title="Log" sub="Your record. Private, never on the leaderboard." />
      <PortfolioClient />
    </>
  );
}
