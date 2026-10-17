import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import QuestsPage from "@/components/Quests";

export const metadata: Metadata = { title: "Daily quests", description: "Three small goals a day that light up your streak." };

export default function Page() {
  return (
    <>
      <PageHeader title="Quests" sub="Three a day. Light the header, unlock emotes." />
      <QuestsPage />
    </>
  );
}
