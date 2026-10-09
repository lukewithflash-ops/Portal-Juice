"use client";

import { useState } from "react";
import SlipImport from "@/components/SlipImport";

/** Log: bring in a slip from a photo, a share link, or its text. */
export default function AddSlip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-xl border border-[color:var(--gold)]/50 bg-[color:var(--gold)]/10 px-4 py-2 text-sm font-bold text-[color:var(--flat)]"
      >
        Add slip
      </button>
      {open ? (
        <div className="mt-3">
          <SlipImport />
        </div>
      ) : null}
    </div>
  );
}
