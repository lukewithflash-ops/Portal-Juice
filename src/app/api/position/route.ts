import { NextResponse } from "next/server";
import { currentUser, rateOk, sameOrigin } from "@/lib/auth";
import { clearPosition, positionOf, positionsFor, setPosition, uidOf } from "@/lib/social";
import { isVipUid } from "@/lib/vipAccess";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store" };

/** GET ?h=a,b,c → shared live positions by handle. GET ?me=1 → your own. */
/** Handles whose accounts have VIP: the badge in squads and leaders. */
async function vipHandles(hs: string[]): Promise<string[]> {
  const out: string[] = [];
  await Promise.all(
    [...new Set(hs.map((h) => h.replace(/^@/, "").toLowerCase()))].map(async (h) => {
      const id = await uidOf(h);
      if (id && (await isVipUid(id))) out.push(h);
    })
  );
  return out;
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const u = await currentUser().catch(() => null);
  if (sp.get("me")) return NextResponse.json({ position: u ? await positionOf(u.id) : null, signedIn: !!u }, { headers: H });
  const hs = (sp.get("h") ?? "").split(",").filter(Boolean).slice(0, 40);
  if (!hs.length) return NextResponse.json({ positions: {} }, { headers: H });
  try {
    const [positions, vip] = await Promise.all([positionsFor(hs, u?.id ?? null), vipHandles(hs).catch(() => [])]);
    return NextResponse.json({ positions, vip }, { headers: H });
  } catch {
    return NextResponse.json({ positions: {} }, { headers: H });
  }
}

/** POST { ids } shares one open pick or parlay; POST { clear: true } removes it. */
export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign in to share a live position." }, { status: 401 });
  if (!(await rateOk(`pos:${u.id}`, 30, 600))) return NextResponse.json({ error: "Slow down a little." }, { status: 429 });
  let b: { ids?: unknown; clear?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (b.clear === true) {
    await clearPosition(u.id);
    return NextResponse.json({ ok: true, position: null }, { headers: H });
  }
  const r = await setPosition(u.id, Array.isArray(b.ids) ? (b.ids as string[]) : []);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, position: r.position }, { headers: H });
}
