"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { getAccount, getServerAccount, subscribeAccount } from "@/lib/syncClient";
import { usePrefs } from "@/components/Prefs";
import { TeamPicker } from "@/components/SiteHeader";

type Row = { href: string; label: string; sub: string };
const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "You",
    rows: [
      { href: "/account", label: "Account and settings", sub: "Sign in, sync, handle, alerts" },
      { href: "/quests", label: "Quests", sub: "Daily goals and streak boosts" },
      { href: "/wrapped", label: "Wrapped", sub: "Your season in one image" },
    ],
  },
  {
    title: "Tools",
    rows: [
      { href: "/ask", label: "Ask Portal AI", sub: "Questions about lines, games and your log" },
      { href: "/widget", label: "Widget", sub: "Your live picks on the home screen" },
      { href: "/app", label: "Install the app", sub: "Add Portal Juice to your home screen" },
    ],
  },
];

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-zinc-600" aria-hidden>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** Profile tab: who you are up top, then grouped rows like an iOS settings screen. */
export default function MoreClient() {
  const a = useSyncExternalStore(subscribeAccount, getAccount, getServerAccount);
  const { team, setTeam } = usePrefs();
  const [pick, setPick] = useState(false);
  const name = a.user ? a.user.name || a.user.email || "Private account" : "";
  return (
    <div className="mx-auto max-w-xl space-y-6" data-testid="more-page">
      <Link href="/account" className="press flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-purple-500/25 text-lg font-black text-white">
          {a.user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.user.image} alt="" width={48} height={48} className="h-12 w-12 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            (name || "P").trim()[0]?.toUpperCase()
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold text-white">{a.user ? name : "Sign in"}</span>
          <span className="block truncate text-[13px] text-zinc-400">{a.user ? "Synced across your devices" : "Save picks, join squads, sync devices"}</span>
        </span>
        <Chevron />
      </Link>

      <section>
        <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Favorite team</h2>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
          <button type="button" className="press flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setPick((v) => !v)} aria-expanded={pick} data-testid="more-team">
            {team?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={team.logo} alt="" width={24} height={24} className="h-6 w-6" />
            ) : (
              <span className="h-6 w-6 rounded-full border border-white/15" aria-hidden />
            )}
            <span className="flex-1 text-[15px] text-white">{team ? team.name : "Pick a team"}</span>
            {team ? (
              <span
                role="button"
                tabIndex={0}
                className="text-[13px] text-zinc-500"
                onClick={(e) => {
                  e.stopPropagation();
                  setTeam(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setTeam(null);
                }}
              >
                Clear
              </span>
            ) : (
              <Chevron />
            )}
          </button>
          {pick ? (
            <div className="px-3 pb-3">
              <TeamPicker team={team} onPick={setTeam} onClose={() => setPick(false)} />
            </div>
          ) : null}
        </div>
      </section>

      {GROUPS.map((g) => (
        <section key={g.title}>
          <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{g.title}</h2>
          <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            {g.rows.map((r) => (
              <li key={r.href}>
                <Link href={r.href} prefetch className="press flex items-center gap-3 px-4 py-3 active:bg-white/5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] text-white">{r.label}</span>
                    <span className="block truncate text-[13px] text-zinc-500">{r.sub}</span>
                  </span>
                  <Chevron />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
