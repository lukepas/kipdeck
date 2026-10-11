// Whether a push shown on this device can come down (pwa/app.ts). Its own module so it loads with
// the app's part of the page, not up front (tests/home-budget.test.ts).

/**
 * A push shown on a device is dealt with, and comes down (pwa/app.ts): its agent was put aside, or
 * the question was answered, the request decided, the finished turn seen. A stuck agent can look
 * busy all along, so only a snooze takes that one down; the next push about it replaces it anyway.
 */
export function pushHandled(kind: string | undefined, w: { status: string; acked?: boolean; snooze?: { until: number | 'change' } } | undefined, now: number): boolean {
  if (!w) return false;
  if (w.snooze && (w.snooze.until === 'change' || w.snooze.until > now)) return true;
  if (kind === 'stuck' || kind === 'test') return false;
  return !(w.status === 'needs_input' || (w.status === 'done' && !w.acked));
}
