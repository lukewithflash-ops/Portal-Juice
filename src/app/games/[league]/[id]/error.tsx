"use client";
import GameRetry from "@/components/GameRetry";

export default function GameError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <GameRetry reset={reset} />;
}
