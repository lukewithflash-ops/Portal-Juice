import { NextResponse } from "next/server";
import { cleanShare, putShare, type SharedItem } from "@/lib/shareInbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG = "/lines/portfolio";

/**
 * POST JSON {image?: dataURL, text?, url?} -> {id}   (iOS Share Extension)
 * POST multipart form (PWA share_target)           -> 303 to the Log page with ?share=id
 */
export async function POST(req: Request) {
  const type = req.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as SharedItem;
    const item = cleanShare(body);
    if ("error" in item) return NextResponse.json(item, { status: 400 });
    try {
      return NextResponse.json({ id: await putShare(item) });
    } catch {
      return NextResponse.json({ error: "Sharing is down right now." }, { status: 503 });
    }
  }
  const back = (q: string) => NextResponse.redirect(new URL(`${LOG}?${q}`, req.url), 303);
  try {
    const form = await req.formData();
    const raw: SharedItem = {};
    const file = form.getAll("image").find((f): f is File => typeof f !== "string");
    if (file && file.size) raw.image = `data:${file.type || "image/jpeg"};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
    const text = [form.get("title"), form.get("text")].filter((x) => typeof x === "string" && x).join("\n");
    if (text) raw.text = text;
    const url = form.get("url");
    if (typeof url === "string") raw.url = url;
    else if (!raw.url) raw.url = text.match(/https?:\/\/\S+/)?.[0];
    const item = cleanShare(raw);
    if ("error" in item) return back(`shareError=${encodeURIComponent(item.error)}`);
    return back(`share=${await putShare(item)}`);
  } catch {
    return back(`shareError=${encodeURIComponent("That share didn’t come through. Try again.")}`);
  }
}
