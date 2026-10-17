import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import { Suspense } from "react";
import NotesClient from "@/components/NotesClient";

export const metadata: Metadata = { title: "Notes", description: "Your notes on picks, parlays, players and games. Kept on this device." };

export default function NotesPage() {
  return (
    <>
      <PageHeader title="Notes" sub="Everything you jotted. Yours only." />
      <Suspense>
        <NotesClient />
      </Suspense>
    </>
  );
}
