import type { Metadata } from "next";
import InstallButton from "@/components/InstallButton";

export const metadata: Metadata = {
  title: "App",
  description: "Add Portal Juice to your home screen. No store wrapper.",
};

export default function AppPage() {
  return (
    <>
      <h1 className="text-2xl font-black tracking-tight text-[color:var(--flat)] sm:text-3xl">Get the app</h1>
      <p className="mt-1 mb-5 text-sm text-zinc-400">
        Juice on your home screen. Same site, full screen. No store listing.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="foil-tile p-4">
          <h2 className="text-sm font-black uppercase tracking-[0.16em] text-[color:var(--flat)]">iPhone</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-zinc-300">
            <li>Open portaljuice.app in Safari.</li>
            <li>Tap Share.</li>
            <li>Tap Add to Home Screen.</li>
            <li>Tap Add. The icon is Juice.</li>
          </ol>
        </section>
        <section className="foil-tile p-4">
          <h2 className="text-sm font-black uppercase tracking-[0.16em] text-[color:var(--flat)]">Android</h2>
          <p className="mt-2 text-sm text-zinc-300">
            Chrome can install it directly. If the button is missing, open the browser menu and choose Install app, or Add to Home screen.
          </p>
          <div className="mt-3">
            <InstallButton />
          </div>
        </section>
      </div>
    </>
  );
}
