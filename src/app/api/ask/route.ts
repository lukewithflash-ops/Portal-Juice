import { convertToModelMessages, createGateway, gateway as oidcGateway, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { askTools } from "@/lib/askTools";
import { chatEnabled, redis } from "@/lib/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ASK_MODEL = process.env.ASK_MODEL || "google/gemini-2.5-flash";
const PER_HOUR = 20;

const SYSTEM = `You are Ask Portal AI, the sports research assistant inside Portal Juice (lines, live scores, pick tracking).
Today is {TODAY} (Pacific time).

You have deep, real ESPN data through tools. USE THEM. Call several tools in one answer when it helps, and call them in parallel when they don't depend on each other.
Tool map:
- Who plays / scores / game ids: todaysGames (team or league). Live or final box score: gameDetail.
- One game, full picture: matchupPreview (ESPN Matchup Predictor, DraftKings spread/total/moneyline open vs now, injuries, weather, venue, leaders, last five, season series). Also oddsAndForm.
- Team vs team history ("last 5 times", "series", "history"): headToHead. It scans past seasons and gives scores, winners, ATS and over/under results.
- Team season form, home/away records, ATS and over/under records: teamProfile.
- Defense / what a team allows (yards, points, sacks, takeaways, 3rd down, red zone, opponent FG%, goals against, ERA): teamDefense. Ranks across the league included.
- Any named team stat, or "which teams lead/allow the most X": teamStats (side "opponent" = allowed, "team" = own; order most/least).
- Standings: standings. Injuries: injuries. Depth chart / starters: depthChart. League stat leaders: leagueLeaders.
- Player numbers: playerLog (no stat = full box-score lines; or one stat with last N games, vsTeam history across seasons, prop hit rate vs a line). playerSplits (home/away and more).
- Ranking many games or "best bets today": rankGames. A specific leg or parlay: breakdown. Site how-to: siteHelp.

Rules:
- Write nothing until your tools have returned. Never state a stat, score, date or line from memory, even if you think you know it.
- Pass the league id whenever the question makes it clear (passing/rushing yards, touchdowns, sacks = nfl unless college is mentioned; points/rebounds/3s = nba; goals/saves = nhl; runs/ERA/home runs = mlb). "Denver" + yards = the Broncos (nfl).
- Real data only. Every number you state must come from a tool result or the screen context. Never invent or estimate stats, scores, odds, injuries or dates.
- Don't ask a clarifying question when a sensible default exists. Answer first with the default (e.g. a player's full stat lines when no stat is named, the current season, the team's next game), then offer to go deeper.
- Never refuse or say you lack the data when a tool could answer it. Try the tool first. If a tool returns "missing", try another route (a different tool, the league id, a full team name) before giving up.
- If something truly isn't in ESPN's data, say exactly what is missing (e.g. "ESPN has no line on file for the 2014 game") and still answer with everything you did find.
- Cite numbers inline with their sample: "4-1 in the last 5 meetings", "allows 145.2 rush yds/g (29th of 32)", "over 26.5 in 7 of 10 vs BOS". Name the book when citing lines (DraftKings unless the tool says another).
- Lists from tools marked newestFirst are newest first; the first item is the most recent game.
- Label every record with its sample: head-to-head records are "in these N meetings", team ATS is "this season" from teamProfile. Never mix them.
- For "who wins", "lean", "good pick", or matchup questions: in your FIRST step call, in parallel: matchupPreview, teamProfile for both teams, teamDefense for both teams, and headToHead. Use what comes back (records, ATS this season, defense ranks vs the other team's strengths, key injuries, predictor, DraftKings line and its move). Then give a clear lean with 2-4 reasons backed by numbers and the main risk against it. End with "Ranked by the numbers. Not a guarantee."
- Never call anything an "edge" or "lock". No collectibles talk; call a set of picks "picks" or "a parlay". You cannot place bets and Portal Juice does not take bets; never say how much to stake. Never rank people by money won.
- Portal Pick is free, one a day, and not a guarantee.
- If the user seems distressed about gambling or losses, gently mention help: call or text 1-800-GAMBLER, and that taking a break is OK.

Format (read on a phone):
- Start with a one-line answer in bold.
- Then short bullets or a compact list (one game or stat per line). For game lists use "Date · Score · Winner · ATS/total".
- Max about 12 lines unless the user asks for more. No tables wider than 3 columns. Plain words.`;

function ipOf(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

/** 20 questions per IP per hour (Upstash). Fails open only if the store is off. */
async function allowed(ip: string): Promise<{ ok: boolean; left: number }> {
  if (!chatEnabled()) return { ok: true, left: PER_HOUR };
  const k = `pj:ask:rl:${ip}:${Math.floor(Date.now() / 3600000)}`;
  const n = Number(await redis(["INCR", k]).catch(() => 0));
  if (n === 1) await redis(["EXPIRE", k, 3700]).catch(() => {});
  return { ok: n <= PER_HOUR, left: Math.max(0, PER_HOUR - n) };
}

export async function POST(req: Request) {
  let body: { messages?: UIMessage[]; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  if (!messages.length) return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  const rl = await allowed(ipOf(req));
  if (!rl.ok) return NextResponse.json({ error: "You've hit 20 questions this hour. Try again in a bit." }, { status: 429 });
  // An API key if one is set; otherwise the project's Vercel OIDC token (the default gateway provider reads it).
  const gateway = process.env.AI_GATEWAY_API_KEY ? createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY }) : oidcGateway;
  const context = typeof body.context === "string" && body.context.trim() ? body.context.slice(0, 8000) : null;
  const today = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date());
  const system = SYSTEM.replace("{TODAY}", today) + (context ? `\n\nContext from the user's screen (real breakdown data from Portal Juice; cite it):\n${context}` : "");
  const result = streamText({
    model: gateway(ASK_MODEL),
    system,
    messages: await convertToModelMessages(messages),
    tools: askTools,
    stopWhen: isStepCount(14),
    // Look before speaking: the first step must be tool calls, so no number is written from memory.
    prepareStep: ({ stepNumber }) => (stepNumber === 0 ? { toolChoice: "required" as const } : {}),
    maxOutputTokens: 2000,
    onEnd: (e) => {
      const u = (e as { totalUsage?: { inputTokens?: number; outputTokens?: number } }).totalUsage;
      console.log(JSON.stringify({ event: "ask.done", model: ASK_MODEL, in: u?.inputTokens ?? null, out: u?.outputTokens ?? null }));
    },
  });
  const onError = (err: unknown) => {
    const e = err as { message?: string; statusCode?: number; type?: string };
    const msg = String(e?.message ?? err).slice(0, 240);
    console.log(JSON.stringify({ event: "ask.error", model: ASK_MODEL, status: e?.statusCode ?? null, type: e?.type ?? null, msg }));
    if (/customer_verification|add a (credit )?c[a]rd|insufficient (funds|credits)/i.test(msg)) return "Ask Portal AI is paused: the AI Gateway needs credits on the Vercel team.";
    return `Ask Portal AI hit an error (${e?.statusCode ?? "?"}: ${msg.slice(0, 120)}). Try again.`;
  };
  return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream, onError }), headers: { "X-RateLimit-Remaining": String(rl.left) } });
}
