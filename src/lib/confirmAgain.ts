"use client";

/** Neon confirm popup. Resolves true only on "Add again"; Cancel is the default (focused, Escape, backdrop). */
export function confirmAgain(text = "Already in your log. Add it again?"): Promise<boolean> {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.dataset.testid = "copy-again";
    wrap.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(5,0,15,.72);padding:24px";
    wrap.innerHTML = `<div style="width:100%;max-width:320px;border-radius:20px;padding:20px;background:linear-gradient(160deg,#1a0633,#07101f);border:1px solid rgba(168,85,247,.7);box-shadow:0 0 28px rgba(168,85,247,.55),0 0 60px rgba(34,211,238,.25);color:#fff;text-align:center;font-family:inherit">
<p style="font-size:16px;font-weight:800;margin:0 0 16px"></p>
<div style="display:flex;gap:10px"><button data-a="cancel" style="flex:1;border-radius:12px;padding:10px;font-weight:800;background:#a855f7;color:#fff;border:0">Cancel</button><button data-a="add" style="flex:1;border-radius:12px;padding:10px;font-weight:800;background:transparent;color:#67e8f9;border:1px solid rgba(103,232,249,.6)">Add again</button></div></div>`;
    (wrap.querySelector("p") as HTMLElement).textContent = text;
    const done = (v: boolean) => { document.removeEventListener("keydown", key); wrap.remove(); resolve(v); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") done(false); };
    wrap.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (a === "add") done(true);
      else if (a === "cancel" || e.target === wrap) done(false);
    });
    document.addEventListener("keydown", key);
    document.body.appendChild(wrap);
    (wrap.querySelector('[data-a="cancel"]') as HTMLButtonElement).focus();
  });
}
