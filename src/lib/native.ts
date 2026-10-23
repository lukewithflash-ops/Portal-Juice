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
