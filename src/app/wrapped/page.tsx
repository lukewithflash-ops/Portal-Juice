import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import WrappedStory from "@/components/Wrapped";

export const metadata: Metadata = { title: "Portal Wrapped", description: "Your week in the Log: record, best hit, streaks, hottest stat and league." };

export default function Page() {
  return (
    <>
      <PageHeader title="Wrapped" sub="Your last 7 days. W/L/P only." />
      <WrappedStory />
    </>
  );
}
