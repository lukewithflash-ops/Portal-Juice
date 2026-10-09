"use client";

import { useSyncExternalStore } from "react";
import { getFollows, getServerFollows, isFollowed, subscribeFollows, toggleFollow } from "@/lib/follows";

/** Star a game: it joins the live banner and your updates. */
export default function FollowStar({ league, id, label, big = false }: { league: string; id: string; label?: string; big?: boolean }) {
  const list = useSyncExternalStore(subscribeFollows, getFollows, getServerFollows);
  const on = isFollowed(list, league, id);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFollow(league, id, label);
      }}
      aria-pressed={on}
      aria-label={on ? "Unfollow game" : "Follow game"}
      title={on ? "Following: live banner and updates" : "Follow for the live banner and updates"}
      className={
        "relative z-10 shrink-0 rounded-full border font-black leading-none transition " +
        (big ? "px-3 py-1.5 text-xs " : "px-2 py-1 text-[11px] ") +
        (on ? "border-[color:var(--gold)] text-[color:var(--gold)]" : "border-white/20 text-zinc-400 hover:text-white")
      }
    >
      {on ? "★" : "☆"}
      {big ? (on ? " Following" : " Follow") : ""}
    </button>
  );
}
