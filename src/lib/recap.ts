import "server-only";
import { createGateway, gateway as oidcGateway, generateText } from "ai";
import { legFromLogged } from "@/lib/breakdown";
import { runBreakdown } from "@/lib/checkRun";
import { chatEnabled, redis } from "@/lib/chat";
import { getLive } from "@/lib/espn";
import { legFromPick } from "@/lib/motivation";
import { nameClose } from "@/lib/slipImport";
import { firstNum, parseLast10, recapCues } from "@/lib/recapCues";
import type { Pick } from "@/lib/types";

const MODEL = process.env.ASK_MODEL || "google/gemini-2.5-flash";

export type Recap = { v?: number; wrong?: string[]; next?: string[]; text: string; result: "hit" | "miss" | "push" | "unknown"; value: number | null; line: number; at: number; facts: string[] };

const SYSTEM = `You write a short post-game recap of ONE logged pick for Portal Juice.
Use ONLY numbers in the JSON. Never invent a number or a general claim about how games "typically" go. Plain text, no markdown.
Return ONLY a JSON object: {"recap": string, "wrong": number[], "next": number[]}
- recap: 2 to 4 short sentences. Hit or miss and by how much, the key reason with numbers from the box line, then one sentence comparing the numbers on the pick (lean, pros/cons) with what happened. Say the pick numbers are season-to-date.
- wrong: indexes (0-based) into candidates.wrong, the 1 to 3 that best explain the result. [] when needsWhy is false or there are none.
- next: indexes into candidates.next, the 1 or 2 most useful. [] when needsWhy is false or there are none.
Never write "should". No blame, no guarantees, no money, no stakes, no betting advice. Confident, punchy voice.`;

export function recapKey(p: Pick): string {
  return `pj:recap5:${p.league ?? "x"}/${p.gameId ?? "x"}/${p.subject.toLowerCase()}/${(p.market ?? "").toLowerCase()}/${p.line}/${p.selection ?? ""}`;
}

export async function buildRecap(p: Pick): Promise<Recap | { error: string }> {
  if (chatEnabled()) {
    const hit = (await redis(["GET", recapKey(p)]).catch(() => null)) as string | null;
    if (hit) {
      const r = JSON.parse(hit) as Recap;
      if (r.v === 5) return r;
    }
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
    needsWhy: false as boolean,
    gameScript: {
      finalMarginHome: (Number(snap.homeScore) || 0) - (Number(snap.awayScore) || 0),
      finalTotal: (Number(snap.homeScore) || 0) + (Number(snap.awayScore) || 0),
      pregameSpreadHome: snap.spreadHome,
      spreadOpenHome: snap.spreadOpen,
      postedTotal: snap.total,
      totalOpen: snap.totalOpen,
    },
    numbersOnThePick: rep ? { lean: rep.lean, score: rep.score, facts: rep.facts.slice(0, 6), pros: rep.pros.slice(0, 3).map((x) => x.text), cons: rep.cons.slice(0, 3).map((x) => x.text) } : null,
  };
  const close = value != null && Math.abs(value - p.line) <= Math.max(1.5, p.line * 0.1);
  facts.needsWhy = result === "miss" || (result === "hit" && close);
  const fact = (re: RegExp) => rep?.facts.find((f) => re.test(f.label))?.value;
  const bx = (k: string) => (box && box[k] != null ? firstNum(String(box[k])) : null);
  const cues = facts.needsWhy
    ? recapCues({
        side, line: p.line, value,
        last10: parseLast10(fact(/^Last 10$/)),
        last5Avg: firstNum(fact(/^Last 5 avg/)),
        seasonAvg: firstNum(fact(/^Season/)?.replace(/^.*?\)\s*/, "")) ?? firstNum(fact(/^Season/)),
        minutes: bx("MIN"), fouls: bx("PF"),
        overtime: /OT/.test(snap.detail),
        spreadHome: snap.spreadHome, spreadOpenHome: snap.spreadOpen, total: snap.total, totalOpen: snap.totalOpen,
        finalMarginHome: facts.gameScript.finalMarginHome, finalTotal: facts.gameScript.finalTotal,
        who: p.subject.split(" ").slice(-1)[0] || p.subject,
      })
    : { wrong: [], next: [] };
  const prompt = { ...facts, candidates: cues };
  const gw = process.env.AI_GATEWAY_API_KEY ? createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY }) : oidcGateway;
  let text: string;
  try {
    const r = await generateText({ model: gw(MODEL), system: SYSTEM, prompt: JSON.stringify(prompt), maxOutputTokens: 2000, providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } } });
    text = r.text.trim();
  } catch (e) {
    console.log(JSON.stringify({ event: "recap.error", msg: String((e as Error).message).slice(0, 160) }));
    return { error: "Portal AI is busy. Try again in a minute." };
  }
  let wrong: string[] = [];
  let next: string[] = [];
  try {
    const j = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) as { recap?: string; wrong?: unknown[]; next?: unknown[] };
    text = String(j.recap ?? "").trim();
    const pickIdx = (xs: unknown[] | undefined, from: string[], n: number) => [...new Set((xs ?? []).map(Number).filter((i) => Number.isInteger(i) && from[i]))].slice(0, n).map((i) => from[i]);
    wrong = pickIdx(j.wrong, cues.wrong, 3);
    next = pickIdx(j.next, cues.next, 2);
  } catch {
    /* plain text answer: keep it */
  }
  // Model skipped them: fall back to the top computed ones.
  if (facts.needsWhy && !wrong.length) wrong = cues.wrong.slice(0, 2);
  if (facts.needsWhy && !next.length) next = cues.next.slice(0, 2);
  const out: Recap = { v: 5, wrong, next, text, result, value, line: p.line, at: Date.now(), facts: box ? Object.entries(box).slice(0, 8).map(([k, v]) => `${k} ${v}`) : [] };
  if (chatEnabled() && /[.!?]$/.test(text)) await redis(["SET", recapKey(p), JSON.stringify(out), "EX", 60 * 60 * 24 * 30]).catch(() => {});
  return out;
}
