"use client";
import { DNB_KEY, hits, label, parseList, recText, type DnbEntry, type LegLike } from "./dnb";
import { getPicks } from "./pickStore";

const EMPTY: DnbEntry[] = [];
let raw: string | null = null;
let cache: DnbEntry[] = EMPTY;
const ls = new Set<() => void>();

export function getDnb(): DnbEntry[] {
  const r = localStorage.getItem(DNB_KEY);
  if (r !== raw) {
    raw = r;
    cache = parseList(r);
  }
  return cache;
}
export const getServerDnb = () => EMPTY;
export function subscribeDnb(cb: () => void) {
  ls.add(cb);
  const on = (e: StorageEvent) => e.key === DNB_KEY && cb();
  window.addEventListener("storage", on);
  const t = setInterval(cb, 5000); // cloud sync writes localStorage directly
  return () => {
    ls.delete(cb);
    window.removeEventListener("storage", on);
    clearInterval(t);
  };
}
function write(next: DnbEntry[]) {
  localStorage.setItem(DNB_KEY, JSON.stringify(next));
  ls.forEach((l) => l());
}
export function addDnb(e: Omit<DnbEntry, "id" | "at">) {
  const name = e.name.trim().slice(0, 60);
  if (!name) return;
  write([{ ...e, name, note: e.note?.trim().slice(0, 140) || undefined, market: e.market?.trim() || undefined, id: crypto.randomUUID(), at: Date.now() }, ...getDnb()].slice(0, 30));
}
export function removeDnb(id: string) {
  write(getDnb().filter((e) => e.id !== id));
}

/** Gentle heads-up when legs match the list. Never blocks: resolves true on "Log anyway" (default), false on "Skip". */
export function dnbHeadsUp(legs: LegLike[]): Promise<boolean> {
  const found = hits(getDnb(), legs, getPicks());
  if (!found.length || typeof document === "undefined") return Promise.resolve(true);
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.dataset.testid = "dnb-headsup";
    wrap.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-end;justify-content:center;background:rgba(5,0,15,.6);padding:16px 16px calc(24px + env(safe-area-inset-bottom))";
    wrap.innerHTML = `<div style="width:100%;max-width:360px;border-radius:20px;padding:16px;background:linear-gradient(160deg,#1a0633,#07101f);border:1px solid rgba(251,191,36,.55);box-shadow:0 0 22px rgba(251,191,36,.25);color:#fff;font-family:inherit">
<p style="font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;color:#fcd34d;margin:0 0 6px">Heads-up · Do Not Bet list</p><ul data-l style="list-style:none;margin:0 0 12px;padding:0;font-size:14px"></ul>
<div style="display:flex;gap:10px"><button data-a="skip" style="flex:1;border-radius:12px;padding:10px;font-weight:800;background:transparent;color:#d4d4d8;border:1px solid rgba(255,255,255,.2)">Skip</button><button data-a="go" style="flex:1;border-radius:12px;padding:10px;font-weight:800;background:#a855f7;color:#fff;border:0">Log anyway</button></div></div>`;
    const ul = wrap.querySelector("[data-l]") as HTMLElement;
    for (const { e, rec } of found.slice(0, 4)) {
      const li = document.createElement("li");
      li.style.cssText = "padding:4px 0";
      li.textContent = `${label(e)}: you're ${rec.t.w + rec.t.l + rec.t.p ? recText(rec.t) : "no graded picks yet"}${rec.streak < -1 ? ` · ${-rec.streak} straight L` : ""}${e.note ? ` · “${e.note}”` : ""}`;
      ul.appendChild(li);
    }
    const done = (v: boolean) => { document.removeEventListener("keydown", key); wrap.remove(); resolve(v); };
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") done(false); };
    wrap.addEventListener("click", (ev) => {
      const a = (ev.target as HTMLElement).dataset.a;
      if (a === "go") done(true);
      else if (a === "skip" || ev.target === wrap) done(false);
    });
    document.addEventListener("keydown", key);
    document.body.appendChild(wrap);
    (wrap.querySelector('[data-a="go"]') as HTMLButtonElement).focus();
  });
}
