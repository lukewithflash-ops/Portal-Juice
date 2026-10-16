import { NextResponse } from "next/server";
import { currentUser, linkPush, sameOrigin } from "@/lib/auth";
import { pushChanges, readDoc, resetCloud } from "@/lib/cloud";
import { LIST_COLS, type ListCol, type SyncPush } from "@/lib/syncCore";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Two-way sync for a signed-in account. The device sends what changed since its last sync;
 * the reply is the merged copy for every list. Private: only this account can read it.
 */
export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const text = await req.text();
  if (text.length > 900_000) return NextResponse.json({ error: "Too much at once." }, { status: 413 });
  let body: { push?: SyncPush; reset?: ListCol[]; endpoint?: string };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Bad body." }, { status: 400 });
  }
  try {
    if (typeof body.endpoint === "string" && body.endpoint.startsWith("https://") && body.endpoint.length < 1000) await linkPush(u.id, body.endpoint).catch(() => {});
    let doc = await readDoc(u.id);
    if (Array.isArray(body.reset) && body.reset.length) doc = await resetCloud(u.id, body.reset.filter((c): c is ListCol => (LIST_COLS as readonly string[]).includes(c)));
    const p = body.push;
    const has = p && (Object.values(p.cols ?? {}).some((c) => c && (Object.keys(c.put ?? {}).length || Object.keys(c.del ?? {}).length)) || Object.keys(p.singles ?? {}).length);
    if (has) doc = await pushChanges(u.id, { cols: p!.cols ?? {}, singles: p!.singles ?? {} });
    return NextResponse.json({ doc }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Sync is busy. Trying again soon." }, { status: 503 });
  }
}
