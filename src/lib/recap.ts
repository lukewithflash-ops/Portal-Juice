import "server-only";
import { createGateway, gateway as oidcGateway, generateText } from "ai";
import { legFromLogged } from "@/lib/breakdown";
import { runBreakdown } from "@/lib/checkRun";
import { chatEnabled, redis } from "@/lib/chat";
import { getLive } from "@/lib/espn";
import { legFromPick } from "@/lib/motivation";
import { nameClose } from "@/lib/slipImport";
import type { Pick } from "@/lib/types";

const MODEL = process.env.ASK_MODEL || "google/gemini-2.5-flash";

export type Recap = { text: string; result: "hit" | "miss" | "push" | "unknown"; value: number | null; line: number; at: number; facts: string[] };

const SYSTEM = `You write a short post-game recap of ONE logged pick for Portal Juice.
Rules: use ONLY the numbers in the JSON. 2 to 4 short sentences, plain text, no lists, no markdown.
Say whether it hit or missed and by how much. Give the key reason with numbers from the box line (minutes, shots, usage, game script, final score, defense facts).
Then one sentence comparing what the numbers before the game said (the lean, pros/cons) with what happened.
No blame, no "should have", no guarantees, no money, no stakes, no betting advice. Confident, punchy voice. If a number is missing, don't invent it.`;

export function recapKey(p: Pick): string {
  return `pj:recap2:${p.league ?? "x"}/${p.gameId ?? "x"}/${p.subject.toLowerCase()}/${(p.market ?? "").toLowerCase()}/${p.line}/${p.selection ?? ""}`;
}

export async function buildRecap(p: Pick): Promise<Recap | { error: string }> {
  if (chatEnabled()) {
    const hit = (await redis(["GET", recapKey(p)]).catch(() => null)) as string | null;
    if (hit) return JSON.parse(hit) as Recap;
  }
  const snap = p.league && p.gameId ? await getLive(p.league, p.gameId).catch(() => null) : null;
  if (!snap || snap.state !== "post") return { error: "The game isn't final yet." };
  const leg = legFromPick(p, snap, null);
  const input = legFromLogged(p);
  const bd = input ? await runBreakdown([input]).catch(() => null) : null;
  const rep = bd?.reports[0] ?? null;
  const row = snap.boxes.flatMap((b) => b.players.map((pl) => ({ abbr: b.abbr, cols: b.columns, pl }))).find((x) => nameClose(x.pl.name, p.subject));
  const box = row ? Object.fromEntries(row.cols.map((c, i) => [c, row.pl.stats[i]])) : null;
  const value = leg?.value ?? null;
  const side = p.selection ?? null;
  const result: Recap["result"] =
    p.status === "win" ? "hit" : p.status === "loss" ? "miss" : p.status === "push" ? "push" : value == null || !side ? "unknown" : value === p.line ? "push" : (side === "Over") === value > p.line ? "hit" : "miss";
  const facts = {
    pick: { subject: p.subject, market: p.market ?? "", side, line: p.line },
    final: { score: `${snap.awayAbbr} ${snap.awayScore}-${snap.homeScore} ${snap.homeAbbr}`, detail: snap.detail },
    result,
    playerValue: value,
    margin: value == null ? null : Math.round((value - p.line) * 10) / 10,
    boxLine: box ? { team: row!.abbr, starter: row!.pl.starter, ...box } : null,
    numbersOnThePick: rep ? { lean: rep.lean, score: rep.score, facts: rep.facts.slice(0, 6), pros: rep.pros.slice(0, 3).map((x) => x.text), cons: rep.cons.slice(0, 3).map((x) => x.text) } : null,
  };
  const gw = process.env.AI_GATEWAY_API_KEY ? createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY }) : oidcGateway;
  let text: string;
  try {
    const r = await generateText({ model: gw(MODEL), system: SYSTEM, prompt: JSON.stringify(facts), maxOutputTokens: 2000, providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } } });
    text = r.text.trim();
  } catch (e) {
    console.log(JSON.stringify({ event: "recap.error", msg: String((e as Error).message).slice(0, 160) }));
    return { error: "Portal AI is busy. Try again in a minute." };
  }
  const out: Recap = { text, result, value, line: p.line, at: Date.now(), facts: box ? Object.entries(box).slice(0, 8).map(([k, v]) => `${k} ${v}`) : [] };
  if (chatEnabled() && /[.!?]$/.test(text)) await redis(["SET", recapKey(p), JSON.stringify(out), "EX", 60 * 60 * 24 * 30]).catch(() => {});
  return out;
}
