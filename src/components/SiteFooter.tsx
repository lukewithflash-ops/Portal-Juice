import Link from "next/link";
import { FOOTER_LINE } from "@/lib/site";

export default function SiteFooter() {
  return (
    <footer className="border-t border-purple-500/15 px-4 py-8 text-center text-xs text-zinc-500">
      <p>{FOOTER_LINE}</p>
      <p className="mt-2 space-x-3">
        <Link href="/support">Support</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </p>
    </footer>
  );
}
