import { FOOTER_LINE } from "@/lib/site";

export default function SiteFooter() {
  return (
    <footer className="border-t border-purple-500/15 px-4 py-8 text-center text-xs text-zinc-500">
      <p>{FOOTER_LINE}</p>
    </footer>
  );
}
