"use client";
import Link from "next/link";
import { useVip } from "@/lib/vipClient";

/** Header: gold VIP badge for members; a quiet VIP link for everyone else (hidden on the narrowest phones). */
export default function VipBadge() {
  const v = useVip();
  if (v.vip)
    return (
      <Link href="/vip" aria-label="VIP member: today’s VIP picks" className="press shrink-0 rounded-lg bg-[color:var(--gold)] px-1.5 py-1 text-[11px] font-black text-black shadow-[0_0_12px_rgba(245,197,66,0.45)]" data-testid="vip-badge">
        💎 VIP
      </Link>
    );
  return (
    <Link href="/vip" aria-label="Portal VIP" className="web-only press hidden shrink-0 rounded-lg border border-[color:var(--gold)]/50 px-1.5 py-1 text-[11px] font-black text-[color:var(--gold)] min-[400px]:block" data-testid="vip-badge">
      VIP
    </Link>
  );
}
