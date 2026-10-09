import { NextResponse } from "next/server";
import { safeSlipUrl } from "@/lib/slip";

export const dynamic = "force-dynamic";

/** Pull visible text from a public https link. The user still confirms every row. */
export async function POST(req: Request) {
  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad link." }, { status: 400 });
  }
  const url = typeof body.url === "string" ? safeSlipUrl(body.url) : null;
  if (!url) return NextResponse.json({ error: "Use a public https link." }, { status: 400 });
  try {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "PortalJuice/1.0" },
    });
    if (res.status >= 300 && res.status < 400) {
      return NextResponse.json({ error: "That link redirects. Paste the text instead." }, { status: 422 });
    }
    if (!res.ok) return NextResponse.json({ error: "The link did not load." }, { status: 422 });
    const html = (await res.text()).slice(0, 200_000);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\n{2,}/g, "\n")
      .slice(0, 8000);
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: "The link did not load." }, { status: 422 });
  }
}
