import type { Metadata } from "next";
import { Suspense } from "react";
import VerifyEmail from "@/components/VerifyEmail";

export const metadata: Metadata = { title: "Finish sign-in", robots: { index: false } };

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
