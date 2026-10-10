import { convertToModelMessages, createGateway, gateway as oidcGateway, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { askTools } from "@/lib/askTools";
import { chatEnabled, redis } from "@/lib/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ASK_MODEL = process.env.ASK_MODEL || "google/gemini-3.1-flash-lite";
const PER_HOUR = 20;

const SYSTEM = `You are Ask Portal AI, the assistant inside Portal Juice (a sports lines, live scores, and pick-tracking site).
Today is ${"{TODAY}"} (Pacific time).
Rules:
- Never invent stats, scores, odds, or injuries. Get numbers by calling tools and cite them (e.g. "last 10: 14.2 avg, over 7.5 in 9 of 10").
- If a tool returns no data or an error, say "Not enough data" for that part. Do not guess.
- No guarantees. When you lean on a pick, say it is "Ranked by the numbers. Not a guarantee."
- You cannot place bets and Portal Juice does not take bets. Do not tell anyone how much to stake.
- Never rank or praise anyone by money won. No collectibles talk: stay on games, players, lines, and the site.
- Portal Pick is free, one a day, and not a guarantee.
- For site questions (how to upload a slip, alerts, Add to Home Screen, pages), call siteHelp and answer from it.
- For "is X over Y a good pick", call breakdown with that leg (and playerLog if useful), then summarize pros and cons with numbers.
- For scores, call todaysGames (with team) then gameDetail if live.
- If the user seems distressed about gambling or losses, gently mention help is available: call or text 1-800-GAMBLER, and that taking a break is OK.
- Keep answers short: a 1-line answer first, then up to 5 bullets with numbers. Plain words.`;

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
    stopWhen: isStepCount(6),
    maxOutputTokens: 900,
    onEnd: (e) => {
      const u = (e as { totalUsage?: { inputTokens?: number; outputTokens?: number } }).totalUsage;
      console.log(JSON.stringify({ event: "ask.done", model: ASK_MODEL, in: u?.inputTokens ?? null, out: u?.outputTokens ?? null }));
    },
  });
  const onError = (err: unknown) => {
    const e = err as { message?: string; statusCode?: number; type?: string };
    const msg = String(e?.message ?? err).slice(0, 240);
    console.log(JSON.stringify({ event: "ask.error", model: ASK_MODEL, status: e?.statusCode ?? null, type: e?.type ?? null, msg }));
    if (/customer_verification|add a (credit )?card|insufficient (funds|credits)/i.test(msg)) return "Ask Portal AI is paused: the AI Gateway needs credits on the Vercel team.";
    return `Ask Portal AI hit an error (${e?.statusCode ?? "?"}: ${msg.slice(0, 120)}). Try again.`;
  };
  return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream, onError }), headers: { "X-RateLimit-Remaining": String(rl.left) } });
}
