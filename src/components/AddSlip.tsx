"use client";

import { useEffect, useState } from "react";
import SlipImport, { type SharedSlip } from "@/components/SlipImport";

/** Log: bring in a slip from a photo, a share link, or its text. Also opens with an item shared from another app (?share=id). */
export default function AddSlip() {
  const [open, setOpen] = useState(false);
  const [shared, setShared] = useState<SharedSlip | null>(null);
  const [shareError, setShareError] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("share");
    const err = q.get("shareError");
    if (!id && !err) return;
    q.delete("share");
    q.delete("shareError");
    window.history.replaceState(null, "", window.location.pathname + (q.size ? `?${q}` : ""));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time open from a share link
    setOpen(true);
    if (err) return setShareError(err);
    fetch(`/api/share/${encodeURIComponent(id!)}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) setShareError(d.error ?? "That share expired. Share it again.");
        else setShared(d);
      })
      .catch(() => setShareError("That share didn’t load. Share it again."));
  }, []);

  return (
    <div className="mt-4" id="add-slip">
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
          {shareError ? <p className="mb-2 text-sm text-[color:var(--cold,#ff6b8a)]">{shareError}</p> : null}
          <SlipImport shared={shared} />
        </div>
      ) : null}
    </div>
  );
}
