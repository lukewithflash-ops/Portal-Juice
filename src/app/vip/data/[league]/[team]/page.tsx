import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { VipTeamData } from "@/components/VipDataClient";

export const metadata: Metadata = { title: "Team trends · VIP Data" };

export default async function Page({ params, searchParams }: { params: Promise<{ league: string; team: string }>; searchParams: Promise<{ season?: string }> }) {
  const { league, team } = await params;
  const { season } = await searchParams;
  return (
    <>
      <PageHeader title={`${team.toUpperCase()} trends`} sub={<Link href={`/vip/data?lg=${league}`} className="text-[color:var(--gold)]">← VIP Data</Link>} />
      <VipTeamData lg={league} team={team.toUpperCase()} season={season ?? null} />
    </>
  );
}
