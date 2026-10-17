import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import MyLive from "@/components/MyLive";

export const metadata: Metadata = {
  title: "My Live",
  description: "Your live games, open picks and parlays, and the plays that matter to you, in one place.",
};

export default function MyLivePage() {
  return (
    <>
<PageHeader title="Live" sub="Your games and picks, as they happen." />
      <MyLive />
    </>
  );
}
