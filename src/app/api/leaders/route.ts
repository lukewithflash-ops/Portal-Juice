import { NextResponse } from "next/server";
import { cleanLeaderHandle } from "@/lib/leaderRank";
import { leadersEnabled, listLeaders, publish, unpublish } from "@/lib/leaders";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ enabled: leadersEnabled(), leaders: await listLeaders() });
  } catch {
    return NextResponse.json({ enabled: leadersEnabled(), leaders: [] });
  }
}

export async function POST(req: Request) {
  let body: { handle?: unknown; token?: unknown; legs?: unknown; remove?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const handle = cleanLeaderHandle(body.handle);
  if (!handle) return NextResponse.json({ error: "Handle is 3–20 letters, numbers, or _." }, { status: 400 });
  const token = typeof body.token === "string" ? body.token : "";
  try {
    if (body.remove === true) {
      const ok = await unpublish(handle, token);
      return NextResponse.json(ok ? { ok: true } : { error: "Not yours to remove." }, { status: ok ? 200 : 403 });
    }
    const res = await publish(handle, token, Array.isArray(body.legs) ? body.legs : []);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.error === "That handle is taken." ? 409 : 400 });
    return NextResponse.json(res);
  } catch {
    return NextResponse.json({ error: "Store did not answer." }, { status: 503 });
  }
}
