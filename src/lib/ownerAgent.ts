import { createHash, timingSafeEqual } from "node:crypto";

/** Owner-approved assistant path: dedicated secret header, POST only. */
export function agentAuthorized(header: string | null, secret = process.env.OWNER_AGENT_SECRET): boolean {
  if (!header || !secret || secret.length < 32) return false;
  const a = createHash("sha256").update(header).digest(), b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
