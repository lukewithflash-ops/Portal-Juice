"use client";

import { useEffect, useState } from "react";
import type { InstallPromptEvent } from "@/components/InstallCapture";

export default function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [done, setDone] = useState<"idle" | "installed" | "dismissed">("idle");

  useEffect(() => {
    const sync = () => setPrompt(window.__pjPrompt ?? null);
    sync();
    window.addEventListener("pj-install-ready", sync);
    return () => window.removeEventListener("pj-install-ready", sync);
  }, []);

  if (done === "installed") {
    return <p className="text-sm text-[color:var(--plus)]">Installed. Open Juice from your home screen.</p>;
  }

  if (!prompt) {
    return (
      <p className="text-sm text-zinc-400">
        If your browser can install it, a button shows up here. Otherwise use the steps for your phone.
      </p>
    );
  }

  return (
    <button
      type="button"
      className="rounded-xl bg-[color:var(--plus)] px-4 py-2.5 text-sm font-black text-black"
      onClick={async () => {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        setDone(choice.outcome === "accepted" ? "installed" : "dismissed");
        window.__pjPrompt = undefined;
        setPrompt(null);
      }}
    >
      Install Juice
    </button>
  );
}
