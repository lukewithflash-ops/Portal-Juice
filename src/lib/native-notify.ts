/**
 * Local notifications (iOS app only) — add next to src/lib/native.ts.
 * Requires: npm i @capacitor/local-notifications@^7 && npx cap sync ios
 * No server/APNs key needed: the device schedules the alert itself.
 * Use: when a user follows a game, call remindGameStart(gameId, title, startTime).
 */
type Cap = { isNativePlatform?: () => boolean; nativePromise?: (p: string, m: string, o?: unknown) => Promise<unknown> };
function cap(): Cap | null {
  if (typeof window === "undefined") return null;
  const c = (window as unknown as { Capacitor?: Cap }).Capacitor;
  return c && c.isNativePlatform?.() && typeof c.nativePromise === "function" ? c : null;
}
function idFor(key: string): number { let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h) || 1; }

/** Ask once, at a moment the user chose to follow something (not on launch). */
export async function enableGameAlerts(): Promise<boolean> {
  const c = cap(); if (!c) return false;
  try {
    const r = (await c.nativePromise!("LocalNotifications", "requestPermissions")) as { display?: string };
    return r?.display === "granted";
  } catch { return false; }
}

/** Schedules a "starts in 10 min" alert on the device. Returns false on web or if denied. */
export async function remindGameStart(gameId: string, title: string, start: Date, minutesBefore = 10): Promise<boolean> {
  const c = cap(); if (!c) return false;
  const at = new Date(start.getTime() - minutesBefore * 60_000);
  if (at.getTime() <= Date.now()) return false;
  if (!(await enableGameAlerts())) return false;
  try {
    await c.nativePromise!("LocalNotifications", "schedule", {
      notifications: [{ id: idFor(gameId), title: "Portal Juice", body: `${title} starts in ${minutesBefore} min`, schedule: { at: at.toISOString(), allowWhileIdle: true }, extra: { gameId } }],
    });
    return true;
  } catch { return false; }
}

export async function cancelGameReminder(gameId: string): Promise<void> {
  const c = cap(); if (!c) return;
  try { await c.nativePromise!("LocalNotifications", "cancel", { notifications: [{ id: idFor(gameId) }] }); } catch {}
}
