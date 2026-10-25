import { NextResponse } from "next/server";
import { verifyHmac, webhookAction, type SsEvent } from "@/lib/bookSyncCore";
import { fetchAccount, getState, importSlips, markAccount, paused, pullAccount, uidForBettor } from "@/lib/bookSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** SharpSports webhooks. Signed: base64 HMAC-SHA256 of the raw body in Hook-HMAC. Unsigned or bad posts are refused. */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.SHARPSPORTS_WEBHOOK_SECRET;
  // Sandbox with no signing secret: the post is only a nudge. Nothing in the body is trusted; we re-read the account from SharpSports.
  const nudge = !secret && process.env.SHARPSPORTS_SANDBOX === "1";
  if (!nudge && !verifyHmac(raw, req.headers.get("hook-hmac"), secret)) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  let e: SsEvent;
  try {
    e = JSON.parse(raw) as SsEvent;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const a = webhookAction(e);
  if (nudge) {
    if (a.kind === "ignore" || !a.account) return NextResponse.json({ ok: true });
    const acct = await fetchAccount(a.account).catch(() => null);
    if (!acct?.bettor) return NextResponse.json({ ok: true, unknown: true });
    a.bettor = acct.bettor;
    a.book = acct.book ?? a.book;
    a.slips = [];
    if (a.kind !== "refreshed") a.kind = acct.verified ? "linked" : "relink";
  }
  if (a.kind === "ignore" || !a.bettor) return NextResponse.json({ ok: true });
  const iid = !nudge && typeof e.data?.internalId === "string" ? (e.data.internalId as string) : null;
  const uid = await uidForBettor(a.bettor, iid);
  if (!uid) return NextResponse.json({ ok: true, unknown: true });
  const s = await getState(uid);
  if (paused(s)) return NextResponse.json({ ok: true, paused: true });
  if (a.kind === "relink") {
    if (a.account) await markAccount(uid, a.account, a.book, "relink");
    return NextResponse.json({ ok: true });
  }
  if (a.kind === "linked") {
    if (a.account) await markAccount(uid, a.account, a.book, "linked");
    return NextResponse.json({ ok: true });
  }
  // refreshed
  let slips = a.slips;
  if (!slips.length && a.account) slips = await pullAccount(uid, a.account).catch(() => []);
  if (a.account) await markAccount(uid, a.account, a.book ?? slips[0]?.book?.name ?? null, "linked", true);
  const r = await importSlips(uid, slips);
  return NextResponse.json({ ok: true, ...r });
}
