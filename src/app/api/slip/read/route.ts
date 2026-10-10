import { NextResponse } from "next/server";
import { matchRows, readSlipImage, rowsFromText, visionConfigured } from "@/lib/slipRead";
import type { SlipRow } from "@/lib/slipImport";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reads a slip and ties each row to a real game.
 * { image: dataURL } → vision via AI Gateway (extraction only) · { text } → text parser · { rows } → match only.
 * GET tells the client whether photo reading is set up.
 */
export async function GET(req: Request) {
  return NextResponse.json({ vision: visionConfigured(req.headers.get("x-vercel-oidc-token")) });
}

export async function POST(req: Request) {
  let body: { image?: unknown; text?: unknown; rows?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  let rows: SlipRow[] = [];
  let stake: number | null = null;
  let source = "text";
  let book: string | null = null;
  let text = "";
  if (typeof body.image === "string") {
    if (!/^data:image\/(png|jpe?g|webp);base64,/.test(body.image) || body.image.length > 4_000_000) {
      return NextResponse.json({ error: "Use a PNG or JPG under 3 MB." }, { status: 400 });
    }
    const r = await readSlipImage(body.image, req.headers.get("x-vercel-oidc-token"));
    if (!r.ok) return NextResponse.json({ vision: false, reason: r.reason, status: r.status ?? null, detail: r.detail ?? null }, { status: 200 });
    rows = r.rows;
    stake = r.stake;
    book = r.book ?? null;
    text = r.text;
    source = "photo";
    if (!rows.length && text) rows = rowsFromText(text).rows;
  } else if (typeof body.text === "string") {
    const r = rowsFromText(body.text.slice(0, 20000));
    rows = r.rows;
    stake = r.stake;
  } else if (Array.isArray(body.rows)) {
    rows = body.rows.slice(0, 15) as SlipRow[];
    source = "rows";
  } else {
    return NextResponse.json({ error: "Nothing to read." }, { status: 400 });
  }
  const legs = await matchRows(rows);
  return NextResponse.json({ source, stake, book, legs, vision: source === "photo" ? true : undefined });
}
