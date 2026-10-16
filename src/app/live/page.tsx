import type { Metadata } from "next";
import MyLive from "@/components/MyLive";

export const metadata: Metadata = {
  title: "My Live",
  description: "Your live games, open picks and parlays, and the plays that matter to you, in one place.",
};

export default function MyLivePage() {
  return (
    <>
      <h1 className="font-display text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">
        My Live
      </h1>
      <p className="mt-1 mb-3 text-sm text-zinc-400">Your games, picks and parlays in one place. Updates every few seconds while a game is live.</p>
      <MyLive />
    </>
  );
}
