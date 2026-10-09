// How a wait on a person is said and colored, the same in every place the inbox shows one: a row's
// clock, the pulse, Shipped today, Numbers and its Markdown, and the toasts. Pure, so the server,
// both clients and the tests share it.

/** A wait turns amber here: someone has been kept a while. The bridge's amber alert defaults to the same minute (client/state/persist.ts). */
export const WAIT_AMBER_MS = 5 * 60_000;
/** A wait turns red and bold here, and a row's wait bar is full. */
export const WAIT_RED_MS = 30 * 60_000;

/** How a wait reads: fresh (muted), aging (amber, from 5m) or stale (red and bold, from 30m). */
export type WaitTone = 'fresh' | 'aging' | 'stale';

export function waitTone(ms: number): WaitTone {
  if (ms >= WAIT_RED_MS) return 'stale';
  if (ms >= WAIT_AMBER_MS) return 'aging';
  return 'fresh';
}

/**
 * A wait the way the inbox says it: "38s", "4m", "1h 12m", "2d 3h". Seconds under a minute, so a
 * clock that just started visibly moves; whole units after that, never rounded up, so a ticking
 * clock never runs ahead of itself.
 */
export function waitWords(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h}h ${min % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

/** Agent-hours the way every place says them: "<0.1", "0.4", "3.5", "12". */
export function hoursWords(hours: number): string {
  if (hours <= 0) return '0';
  if (hours < 0.1) return '<0.1';
  if (hours < 10) return hours.toFixed(1);
  return String(Math.round(hours));
}

/** Fewer reviews than this and a merge rate says "-": one merge out of one is not 100% of anything. */
export const MIN_REVIEWS = 5;

/** "67%", or "-" with nothing to divide or too few reviews to say. */
export function rateWords(rate: number | undefined, reviews: number): string {
  return rate === undefined || reviews < MIN_REVIEWS ? '-' : `${Math.round(rate * 100)}%`;
}
