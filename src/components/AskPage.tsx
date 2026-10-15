"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import AskChat from "@/components/AskChat";

function Inner() {
  const q = useSearchParams();
  const game = q.get("game");
  const label = q.get("label");
  const valid = game && /^[a-z0-9]+\/\d+$/.test(game);
  const style = (q.get("style") ?? "").slice(0, 1500);
  if (style) {
    return (
      <AskChat
        storeKey="pj-ask:style"
        context={`The user's own Log record, from their device (wins, losses, pushes only; never discuss money, stakes or profit): ${style}. Talk about their pick style using only these numbers. Note small samples. No guarantees.`}
        suggestions={["What's my biggest strength?", "Where am I weakest?", "Should I play fewer legs?", "What should I check before my next pick?"]}
      />
    );
  }
  const context = valid ? `The user opened Ask from the game page for league/id ${game}${label ? ` (${label.slice(0, 40)})` : ""}. Use matchupPreview, gameDetail and oddsAndForm with these ids, plus headToHead, teamDefense and playerLog as needed.` : undefined;
  const suggestions = valid
    ? ["Who wins and why?", "Last 5 times they played?", "How do these defenses rank?", "What are the odds and line moves?"]
    : ["Who wins SEA vs DEN tonight and why?", "Which NFL defenses allow the most rushing yards?", "How has Jalen Brunson done vs the Celtics?", "How do I upload a slip?"];
  return <AskChat storeKey={valid ? `pj-ask:${game}` : "pj-ask"} context={context} suggestions={suggestions} />;
}

export default function AskPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
