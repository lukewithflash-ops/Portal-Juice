import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import { Suspense } from "react";
import FriendsClient from "@/components/FriendsClient";

export const metadata: Metadata = { title: "Friends", description: "Add friends and squads, watch their picks live, react and tail." };

export default function Page() {
  return (
    <>
      <PageHeader title="Squads" sub="Friends see your open picks. Everyone else, only your live position." />
      <Suspense fallback={null}>
        <FriendsClient />
      </Suspense>
    </>
  );
}
