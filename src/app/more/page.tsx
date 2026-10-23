import type { Metadata } from "next";
import MoreClient from "@/components/MoreClient";

export const metadata: Metadata = { title: "More", description: "Your account, favorite team, quests, Wrapped, widget and Ask Portal AI." };

export default function MorePage() {
  return <MoreClient coins={process.env.PJ_COINS === "1"} />;
}
