import { NextResponse } from "next/server";
import { vapidPublic } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET() {
  const publicKey = vapidPublic();
  if (!publicKey) return NextResponse.json({ enabled: false });
  return NextResponse.json({ enabled: true, publicKey });
}
