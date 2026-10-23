import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import CoinsClient from "@/components/CoinsClient";

export const metadata: Metadata = { title: "Coins & Style", description: "Earn coins from challenges and style your profile, home and chat." };
export const dynamic = "force-dynamic";

export default function Page() {
  if (process.env.PJ_COINS !== "1") notFound();
  return (
    <>
      <PageHeader title="Coins & Style" sub="Earn coins in the app. Style your home, avatar and chat." />
      <CoinsClient />
    </>
  );
}
