import type { Metadata } from "next";
import { Suspense } from "react";
import AccountClient from "@/components/AccountClient";

export const metadata: Metadata = { title: "Account", description: "Sign in to save your picks, notes and stats and sync them across devices. Your picks stay private." };

export default function AccountPage() {
  return (
    <Suspense>
      <AccountClient />
    </Suspense>
  );
}
