import { NextResponse } from "next/server";
import { currentUser, deleteAccount, endSession, sameOrigin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Delete the account and everything in the cloud. This device keeps its local copy. */
export async function DELETE(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { confirm?: unknown };
  if (body.confirm !== "DELETE") return NextResponse.json({ error: "Confirm first." }, { status: 400 });
  await deleteAccount(u);
  await endSession();
  return NextResponse.json({ ok: true });
}
