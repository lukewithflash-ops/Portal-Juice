import { NextResponse } from "next/server";
import { redis } from "@/lib/chat";
import { ownerEmails } from "@/lib/vipAccess";
import { agentAuthorized } from "@/lib/ownerAgent";
import { propMarketOf } from "@/lib/slipImport";
import type { CloudDoc } from "@/lib/syncCore";

export const dynamic = "force-dynamic";

const CAS = `local cur = redis.call('GET', KEYS[1])
local rev = 0
if cur then rev = tonumber(cjson.decode(cur)['rev']) or 0 end
if rev ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1`;

/**
 * Owner-approved assistant path: list or fix legs in the OWNER's own synced Log only.
 * Edits are limited to market, line and side (selection); the prior doc is backed up first.
 */
export async function POST(req: Request) {
  if (!agentAuthorized(req.headers.get("x-pj-owner-agent"))) return NextResponse.json({ error: "Owner agent only." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; date?: string; subject?: string; id?: string; market?: string; line?: number; selection?: string };
  // The owner's account: OWNER_EMAILS when set, else the owner's confirmed handle (@richofftheball). Never a caller-chosen account.
  const email = ownerEmails()[0];
  let uid = email ? ((await redis(["GET", `pj:auth:email:${email}`])) as string | null) : null;
  if (!uid) uid = (await redis(["GET", `pj:hdl:${(process.env.OWNER_HANDLE || "richofftheball").toLowerCase()}`])) as string | null;
  if (!uid) return NextResponse.json({ error: "Owner account not found." }, { status: 404 });
  const key = `pj:sync:${uid}`;
  for (let i = 0; i < 4; i++) {
    const raw = (await redis(["GET", key])) as string | null;
    if (!raw) return NextResponse.json({ error: "No synced Log." }, { status: 404 });
    const doc = JSON.parse(raw) as CloudDoc;
    const items = doc.cols?.picks?.items ?? {};
    if (b.action === "list") {
      const q = (b.subject ?? "").toLowerCase();
      const legs = Object.values(items)
        .map((s) => ({ ...(s.v as Record<string, unknown>), _t: s.t }) as Record<string, unknown>)
        .filter((p) => (!b.date || p.date === b.date) && (!q || String(p.subject ?? "").toLowerCase().includes(q)));
      return NextResponse.json({ ok: true, legs });
    }
    if (b.action !== "edit" || !b.id || !items[b.id]) return NextResponse.json({ error: "Give action list, or edit with a leg id." }, { status: 400 });
    const cur = items[b.id].v as Record<string, unknown>;
    const next: Record<string, unknown> = { ...cur };
    if (typeof b.market === "string" && b.market.trim()) {
      next.market = b.market.trim().slice(0, 60);
      delete next.marketRaw;
    }
    if (b.line !== undefined) {
      if (!Number.isFinite(b.line)) return NextResponse.json({ error: "Bad line." }, { status: 400 });
      next.line = b.line;
    }
    if (b.selection !== undefined) {
      if (b.selection !== "Over" && b.selection !== "Under") return NextResponse.json({ error: "Side is Over or Under." }, { status: 400 });
      next.selection = b.selection;
    }
    const ts = Date.now();
    const out: CloudDoc = { ...doc, rev: doc.rev + 1, updatedAt: ts, cols: { ...doc.cols, picks: { ...doc.cols.picks, items: { ...items, [b.id]: { v: next, t: ts } } } } };
    const backup = `pj:backup:${key}:${ts}`;
    await redis(["SET", backup, raw, "EX", 60 * 60 * 24 * 90]);
    const ok = Number(await redis(["EVAL", CAS, 1, key, doc.rev, JSON.stringify(out)]));
    if (ok !== 1) continue;
    console.log(`[ownerlegs] assistant for owner edited leg ${b.id}`);
    return NextResponse.json({ ok: true, backup, before: cur, after: next, reloadMarket: typeof next.marketRaw === "string" && next.marketRaw.trim() ? propMarketOf(next.marketRaw) || next.market : next.market });
  }
  return NextResponse.json({ error: "Busy, try again." }, { status: 409 });
}
