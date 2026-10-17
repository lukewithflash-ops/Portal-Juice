import type { Metadata } from "next";
import WidgetClient from "@/components/WidgetClient";

export const metadata: Metadata = {
  title: "Home-screen widget · Portal Juice",
  description: "Live parlay progress on your home screen.",
  manifest: "/live.webmanifest",
  appleWebApp: { capable: true, title: "PJ Live", statusBarStyle: "black-translucent" },
};

export default function WidgetPage() {
  return <WidgetClient />;
}
