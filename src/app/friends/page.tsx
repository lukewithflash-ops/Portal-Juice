import type { Metadata } from "next";
import { Suspense } from "react";
import FriendsClient from "@/components/FriendsClient";

export const metadata: Metadata = { title: "Friends", description: "Add friends and squads, watch their picks live, react and tail." };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">Friends & squads</h1>
      <p className="mt-1 mb-5 text-sm text-zinc-400">Your picks stay private unless you add someone. Friends see W/L/P/open only.</p>
      <Suspense fallback={null}>
        <FriendsClient />
      </Suspense>
    </>
  );
}
