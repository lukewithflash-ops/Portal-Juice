import { NextResponse } from "next/server";
import { currentUser, sameOrigin } from "@/lib/auth";
import { createShare, removeShare } from "@/lib/pickShare";
import { SITE } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** POST {pickId} -> {url}. Owner-only: the pick must be in this account's synced log. DELETE {id} turns a link off. */
export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in to share a pick link." }, { status: 401 });
  const { pickId } = (await req.json().catch(() => ({}))) as { pickId?: string };
  if (typeof pickId !== "string") return NextResponse.json({ error: "Bad pick." }, { status: 400 });
  const id = await createShare(u.id, pickId).catch(() => null);
  if (!id) return NextResponse.json({ error: "That pick hasn’t synced yet. Try again in a few seconds." }, { status: 404 });
  return NextResponse.json({ id, url: `${SITE}/p/${id}` });
}

export async function DELETE(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  const ok = typeof id === "string" && (await removeShare(u.id, id).catch(() => false));
  return NextResponse.json({ ok });
}
