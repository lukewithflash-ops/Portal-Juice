import { NextResponse } from "next/server";
import { currentUser, rateOk, sameOrigin } from "@/lib/auth";
import { giftSeen, buyItem, buyListing, claim, coinsOn, equip, listItem, lookOf, openBox, state, unlist } from "@/lib/coins";
import { uidOf } from "@/lib/social";
import type { Slot } from "@/lib/coinsCore";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store" };

/** GET → your coins, items, challenges, shop and resale. GET ?looks=a,b → equipped looks by handle. */
export async function GET(req: Request) {
  if (!coinsOn()) return NextResponse.json({ enabled: false }, { headers: H });
  const looks = new URL(req.url).searchParams.get("looks");
  if (looks) {
    const out: Record<string, unknown> = {};
    await Promise.all(looks.split(",").filter(Boolean).slice(0, 40).map(async (h) => {
      const id = await uidOf(h.replace(/^@/, ""));
      if (id) out[h] = await lookOf(id);
    }));
    return NextResponse.json({ enabled: true, looks: out }, { headers: H });
  }
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.json({ enabled: true, signedIn: false }, { headers: H });
  return NextResponse.json({ enabled: true, signedIn: true, ...(await state(u.id)) }, { headers: H });
}

export async function POST(req: Request) {
  if (!coinsOn()) return NextResponse.json({ enabled: false }, { status: 404 });
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign in to use coins." }, { status: 401 });
  if (!(await rateOk(`coins:${u.id}`, 60, 60))) return NextResponse.json({ error: "Slow down a little." }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as Record<string, string | number | null>;
  const req_ = String(b.req ?? "").slice(0, 64);
  if (["buy", "open"].includes(String(b.action)) && req_.length < 8) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  let r: { ok: boolean; error?: string };
  switch (b.action) {
    case "claim": r = await claim(u.id, String(b.id)); break;
    case "buy": r = await buyItem(u.id, String(b.id), req_); break;
    case "open": r = await openBox(u.id, String(b.id), req_); break;
    case "equip": r = await equip(u.id, String(b.slot) as Slot, b.id ? String(b.id) : null); break;
    case "list": r = await listItem(u.id, String(b.id), Number(b.price)); break;
    case "unlist": r = await unlist(u.id, String(b.id)); break;
    case "gift-seen": r = await giftSeen(u.id); break;
    case "market-buy": r = await buyListing(u.id, String(b.id)); break;
    default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400, headers: H });
  return NextResponse.json({ ...r, state: await state(u.id) }, { headers: H });
}
