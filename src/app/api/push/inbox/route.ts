import { NextResponse } from "next/server";
import { readInbox } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Updates the server sent (or tried to send) to this device. POST so the endpoint is not in a URL. */
export async function POST(req: Request) {
  let body: { endpoint?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ items: [] }, { status: 400 });
  }
  if (typeof body.endpoint !== "string" || !body.endpoint.startsWith("https://")) return NextResponse.json({ items: [] });
  const items = await readInbox(body.endpoint).catch(() => []);
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
