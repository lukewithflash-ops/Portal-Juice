/**
 * When the "Turn on notifications" prompt may show. Pure. Never on a first visit, never on first paint
 * (a delay after load), never inline above content. Each "Not now" pushes it further out; after three it
 * stays off (Account → Alerts still has the switch).
 */
export const NOTIFY_DELAY_MS = 20_000;
export const NOTIFY_MIN_VISITS = 2;
const BACKOFF_DAYS = [7, 30];

export function notifyHiddenUntil(dismissals: number, lastDismiss: number): number {
  if (dismissals <= 0) return 0;
  if (dismissals > BACKOFF_DAYS.length) return Number.POSITIVE_INFINITY;
  return lastDismiss + BACKOFF_DAYS[dismissals - 1] * 86400000;
}

export function mayShowNotify(s: { visits: number; dismissals: number; lastDismiss: number; now: number }): boolean {
  if (s.visits < NOTIFY_MIN_VISITS) return false;
  return s.now >= notifyHiddenUntil(s.dismissals, s.lastDismiss);
}
