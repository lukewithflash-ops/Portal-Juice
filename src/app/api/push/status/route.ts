import { NextResponse } from "next/server";
import { chatEnabled } from "@/lib/chat";
import { lastRun, onceResult, subCount, vapidPublic } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Health of the push pipeline. No endpoints or keys are returned. */
export async function GET() {
  const store = chatEnabled();
  return NextResponse.json(
    {
      store,
      vapid: Boolean(vapidPublic() && (process.env.VAPID_PRIVATE_KEY ?? "").length > 20),
      subs: store ? await subCount().catch(() => null) : 0,
      lastRun: store ? await lastRun().catch(() => null) : null,
      testAlert: store ? await onceResult().catch(() => null) : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
