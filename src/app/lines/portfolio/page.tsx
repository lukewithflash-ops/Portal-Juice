import type { Metadata } from "next";
import PortfolioClient from "@/components/PortfolioClient";

export const metadata: Metadata = {
  title: "Log",
  description: "Log picks you already made. Saved on this device only.",
};

export default function LogPage() {
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">Log</h1>
      <p className="mt-1 mb-6 text-sm text-zinc-400">Your own record. Counts only.</p>
      <PortfolioClient />
    </>
  );
}
