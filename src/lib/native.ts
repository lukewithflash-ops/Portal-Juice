/**
 * The iOS app is a Capacitor shell that loads portaljuice.app. Capacitor injects window.Capacitor before page
 * scripts run; the UA tag is a backup if the shell appends one. When native, <html> gets the "pj-native" class:
 * `.web-only` hides (VIP purchase, Stripe, install prompts, web push), `.native-only` shows.
 * App Store rule: no purchase path or link to one for digital goods outside in-app purchase.
 */
export const NATIVE_BOOT = `(function(){try{var c=window.Capacitor;var n=(c&&(c.isNativePlatform?c.isNativePlatform():c.platform&&c.platform!=="web"))||/PortalJuiceApp/.test(navigator.userAgent)||/(^|; )pj_native=1/.test(document.cookie);if(n){document.documentElement.classList.add("pj-native");document.cookie="pj_native=1; path=/; max-age=31536000; samesite=lax; secure"}}catch(e){}})();`;

export function isNativeApp(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("pj-native");
}

/* ---------- Native bridge (iOS app only). Web keeps its old behavior. ---------- */

type Cap = {
  isNativePlatform?: () => boolean;
  nativePromise?: (plugin: string, method: string, opts?: unknown) => Promise<unknown>;
  nativeCallback?: (plugin: string, method: string, opts: unknown, cb: (data: unknown) => void) => string;
};

function cap(): Cap | null {
  if (typeof window === "undefined") return null;
  const c = (window as unknown as { Capacitor?: Cap }).Capacitor;
  return c && c.isNativePlatform?.() && typeof c.nativePromise === "function" ? c : null;
}

/** Calls a native plugin method. Resolves undefined if the plugin is missing or fails. */
function call<T = unknown>(plugin: string, method: string, opts?: unknown): Promise<T | undefined> {
  const c = cap();
  if (!c) return Promise.resolve(undefined);
  try {
    return (c.nativePromise!(plugin, method, opts) as Promise<T>).catch(() => undefined);
  } catch {
    return Promise.resolve(undefined);
  }
}

export type HapticKind = "light" | "medium" | "success" | "warning" | "error";
let lastBuzz = 0;

/**
 * Haptic tap. In the iOS app this uses the Taptic Engine; in a browser it falls back to
 * navigator.vibrate(fallback) only when a fallback pattern is given (so web stays as it was).
 */
export function haptic(kind: HapticKind = "light", fallback?: number | number[]) {
  const now = Date.now();
  if (now - lastBuzz < 90) return;
  lastBuzz = now;
  if (cap()) {
    if (kind === "success" || kind === "warning" || kind === "error") void call("Haptics", "notification", { type: kind.toUpperCase() });
    else void call("Haptics", "impact", { style: kind === "medium" ? "MEDIUM" : "LIGHT" });
    return;
  }
  if (fallback == null) return;
  try {
    navigator.vibrate?.(fallback);
  } catch {}
}

/**
 * Share a link or text. iOS app: native share sheet. Browser: Web Share, else copy the link.
 * Returns "shared" | "copied" | "cancelled".
 */
export async function shareLink(d: { title?: string; text?: string; url?: string }): Promise<"shared" | "copied" | "cancelled"> {
  const c = cap();
  if (c) {
    try {
      await c.nativePromise!("Share", "share", { title: d.title, text: d.text, url: d.url, dialogTitle: d.title });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  try {
    if (navigator.share) {
      await navigator.share(d);
      return "shared";
    }
    if (d.url) {
      await navigator.clipboard.writeText(d.url);
      return "copied";
    }
  } catch {}
  return "cancelled";
}

/**
 * iOS app only: write a PNG to the app's cache and open the native share sheet
 * (Save Image, Messages, Instagram...). Returns false when not in the app or it failed,
 * so the caller can fall back to its web path.
 */
export async function shareImageNative(blob: Blob, name: string, title?: string): Promise<boolean> {
  const c = cap();
  if (!c) return false;
  try {
    const data = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1] ?? "");
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
    const w = (await c.nativePromise!("Filesystem", "writeFile", { path: name, data, directory: "CACHE", recursive: true })) as { uri?: string };
    if (!w?.uri) return false;
    await c.nativePromise!("Share", "share", { title, files: [w.uri] }).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

/** iOS app only: listen for the device going offline/online. Returns an unsubscribe. */
export function onNativeNetwork(cb: (connected: boolean) => void): () => void {
  const c = cap();
  if (!c || typeof c.nativeCallback !== "function") return () => {};
  void call<{ connected?: boolean }>("Network", "getStatus").then((s) => {
    if (s && typeof s.connected === "boolean") cb(s.connected);
  });
  let id: string | undefined;
  try {
    id = c.nativeCallback("Network", "addListener", { eventName: "networkStatusChange" }, (s) => {
      const v = s as { connected?: boolean } | null;
      if (v && typeof v.connected === "boolean") cb(v.connected);
    });
  } catch {}
  return () => {
    if (id) void call("Network", "removeListener", { eventName: "networkStatusChange", callbackId: id });
  };
}

/* ---------- iOS sign-in via the system browser (Google blocks webview OAuth) ---------- */

let authListening = false;
/** iOS app: listen for app.portaljuice://auth?code=... and finish sign-in in the webview. Call once on mount. */
export function listenNativeAuth() {
  const c = cap();
  if (!c || authListening || typeof c.nativeCallback !== "function") return;
  authListening = true;
  try {
    c.nativeCallback("App", "addListener", { eventName: "appUrlOpen" }, (d) => {
      const url = (d as { url?: string } | null)?.url ?? "";
      if (!url.startsWith("app.portaljuice://auth")) return;
      const code = new URL(url.replace("app.portaljuice://", "https://x/")).searchParams.get("code");
      void call("Browser", "close");
      if (code) window.location.href = `/api/auth/handoff?code=${encodeURIComponent(code)}`;
    });
  } catch {}
}

/** iOS app: run Google / Apple sign-in in the system browser. Returns false when not in the app (use the normal link). */
export async function nativeSignIn(provider: "google" | "apple", next = "/account"): Promise<boolean> {
  if (!cap()) return false;
  listenNativeAuth();
  const r = await fetch("/api/auth/native", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, next }) }).catch(() => null);
  const j = r?.ok ? ((await r.json()) as { url?: string }) : null;
  if (!j?.url) return false;
  await call("Browser", "open", { url: j.url, presentationStyle: "popover" });
  return true;
}

/* ---------- In-app VIP (StoreKit 2 via @capgo/native-purchases). Server flag IAP_ENABLED gates it. ---------- */

type IapConfig = { enabled: boolean; signedIn?: boolean; products?: { monthly: string; yearly: string }; appAccountToken?: string };
export async function iapConfig(): Promise<IapConfig | null> {
  if (!cap()) return null;
  const r = await fetch("/api/vip/apple", { cache: "no-store" }).catch(() => null);
  return r?.ok ? ((await r.json()) as IapConfig) : null;
}

/** Localized App Store prices for the VIP plans (real prices from StoreKit). */
export async function iapProducts(ids: string[]): Promise<{ identifier: string; priceString: string; title: string }[]> {
  const r = await call<{ products?: { identifier: string; priceString: string; title: string }[] }>("NativePurchases", "getProducts", { productIdentifiers: ids, productType: "subs" });
  return r?.products ?? [];
}

async function sendJws(jws: string | undefined): Promise<boolean> {
  if (!jws) return false;
  const r = await fetch("/api/vip/apple", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jws }) }).catch(() => null);
  return !!r?.ok;
}

/** Buy a VIP plan with Apple. Resolves "ok" once the server verified the signed transaction. */
export async function iapBuy(plan: "monthly" | "yearly"): Promise<"ok" | "cancelled" | "error"> {
  const cfg = await iapConfig();
  if (!cfg?.enabled || !cfg.products || !cfg.appAccountToken) return "error";
  const c = cap();
  if (!c) return "error";
  try {
    const t = (await c.nativePromise!("NativePurchases", "purchaseProduct", { productIdentifier: cfg.products[plan], productType: "subs", appAccountToken: cfg.appAccountToken })) as { jwsRepresentation?: string };
    return (await sendJws(t?.jwsRepresentation)) ? "ok" : "error";
  } catch (e) {
    return /cancel/i.test(String(e)) ? "cancelled" : "error";
  }
}

/** Restore: re-send every current Apple VIP transaction to the server for this account. */
export async function iapRestore(): Promise<boolean> {
  const cfg = await iapConfig();
  if (!cfg?.enabled || !cfg.products) return false;
  await call("NativePurchases", "restorePurchases");
  const r = await call<{ purchases?: { productIdentifier?: string; jwsRepresentation?: string }[] }>("NativePurchases", "getPurchases", { productType: "subs" });
  let any = false;
  for (const p of r?.purchases ?? []) if (p.productIdentifier && Object.values(cfg.products).includes(p.productIdentifier)) any = (await sendJws(p.jwsRepresentation)) || any;
  return any;
}
