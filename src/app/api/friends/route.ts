import { NextResponse } from "next/server";
import { currentUser, rateOk, sameOrigin } from "@/lib/auth";
import { addFriend, answer, block, claimHandle, createSquad, dmWith, joinInvite, leaveSquad, overview, peekInvite, removeFriend, searchPeople, setShare, squadAdd, squadWith } from "@/lib/social";

export const dynamic = "force-dynamic";
const H = { "cache-control": "no-store" };

export async function GET(req: Request) {
  const peek = new URL(req.url).searchParams.get("peek");
  if (peek) return NextResponse.json({ invite: await peekInvite(peek).catch(() => null) }, { headers: H });
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.json({ signedIn: false }, { headers: H });
  const q = new URL(req.url).searchParams.get("q");
  if (q !== null) {
    if (!(await rateOk(`fsearch:${u.id}`, 120, 60))) return NextResponse.json({ people: [] }, { headers: H });
    return NextResponse.json({ people: await searchPeople(u.id, q).catch(() => []) }, { headers: H });
  }
  return NextResponse.json({ signedIn: true, ...(await overview(u.id)) }, { headers: H });
}

export async function POST(req: Request) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.json({ error: "Sign in to use friends." }, { status: 401 });
  if (!(await rateOk(`friends:${u.id}`, 60, 600))) return NextResponse.json({ error: "Slow down a little." }, { status: 429 });
  let b: { action?: string; handle?: string; handles?: string[]; on?: boolean; code?: string; name?: string; id?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const h = String(b.handle ?? "").replace(/^@/, "");
  switch (b.action) {
    case "handle": {
      const r = await claimHandle(u.id, h);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      break;
    }
    case "share":
      await setShare(u.id, b.on !== false);
      break;
    case "add": {
      const r = await addFriend(u.id, h);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 404 });
      return NextResponse.json({ ok: true, status: r.status, ...(await overview(u.id)) }, { headers: H });
    }
    case "accept":
    case "decline":
      await answer(u.id, h, b.action === "accept");
      break;
    case "remove":
      await removeFriend(u.id, h);
      break;
    case "block":
    case "unblock":
      await block(u.id, h, b.action === "block");
      break;
    case "join": {
      const r = await joinInvite(u.id, String(b.code ?? ""));
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 404 });
      return NextResponse.json({ ok: true, joined: r.squad ? `Joined ${r.squad}` : `You and @${r.handle} are friends`, ...(await overview(u.id)) }, { headers: H });
    }
    case "squad-create": {
      const r = await createSquad(u.id, String(b.name ?? ""));
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
      break;
    }
    case "dm": {
      const r = await dmWith(u.id, h);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true, open: { id: r.id, name: r.name }, ...(await overview(u.id)) }, { headers: H });
    }
    case "squad-with": {
      const r = await squadWith(u.id, String(b.name ?? ""), Array.isArray(b.handles) ? b.handles.map(String) : []);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ ok: true, open: { id: r.id, name: r.name }, ...(await overview(u.id)) }, { headers: H });
    }
    case "squad-add": {
      const r = await squadAdd(u.id, String(b.id ?? ""), Array.isArray(b.handles) ? b.handles.map(String) : []);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      break;
    }
    case "squad-leave":
      await leaveSquad(u.id, String(b.id ?? ""));
      break;
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...(await overview(u.id)) }, { headers: H });
}
