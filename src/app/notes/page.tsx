import type { Metadata } from "next";
import { Suspense } from "react";
import NotesClient from "@/components/NotesClient";

export const metadata: Metadata = { title: "Notes", description: "Your notes on picks, parlays, players and games. Kept on this device." };

export default function NotesPage() {
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">Notes</h1>
      <p className="mt-1 mb-5 text-sm text-zinc-400">Everything you jotted on picks, parlays, players and games. On this device only.</p>
      <Suspense>
        <NotesClient />
      </Suspense>
    </>
  );
}
