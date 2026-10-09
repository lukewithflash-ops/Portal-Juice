import { NextResponse } from "next/server";
import { checkPush } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No." }, { status: 401 });
  }
  const result = await checkPush();
  return NextResponse.json(result);
}
