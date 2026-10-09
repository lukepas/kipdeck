// How a wait on a person is said and how it escalates, the same in every place one shows: the inbox's
// rows, its pulse and clocks, Shipped today, Numbers and its Markdown, the toasts, and on the bridge
// the rail, Mission control, the selected unit's card, the callouts over the units, the pod plates and
// the needs-you chip. This is the one source of the wait thresholds. A clock escalates by weight and
// emphasis, never by colour: the hues already say what a row is (needs you orange, stuck red, to
// review amber-yellow, DESIGN.md "Hue is zoned"), so a late clock borrowing one would contradict its
// own row. Pure, so the server, both clients and the tests share it.

import type { AttentionLevel } from './attention.js';
import { ago } from './rowtext.js';

/** A wait turns aging (bold) here: someone has been kept a while. The bridge's CONDITION AMBER alert defaults to the same minute (client/state/persist.ts). */
export const WAIT_AMBER_MS = 5 * 60_000;
/** A wait turns stale (heavier and underlined) here, and a row's wait bar is full. */
export const WAIT_RED_MS = 30 * 60_000;

/** How a wait reads: fresh (muted), aging (white and bold, from 5m) or stale (heavier and underlined, from 30m). */
export type WaitTone = 'fresh' | 'aging' | 'stale';

export function waitTone(ms: number): WaitTone {
  if (ms >= WAIT_RED_MS) return 'stale';
  if (ms >= WAIT_AMBER_MS) return 'aging';
  return 'fresh';
}

/** The font weight a clock is drawn at in each tone (the pages' clocks, ui/waitclock.css, and the canvases' alike). */
export const WAIT_WEIGHT: Record<WaitTone, number> = { fresh: 500, aging: 700, stale: 800 };

/** Whether a level's clock is someone waiting on a person (needs you, stuck, to review): only those take a tone. */
export function waitsOnPerson(level: AttentionLevel): boolean {
  return level === 'needs-you' || level === 'stuck' || level === 'review';
}

/** A bridge unit's clock ('12m') and its tone: a tone only when it waits on a person (a working unit's time is never late). */
export function waitClock(level: AttentionLevel, ms: number): { text: string; tone?: WaitTone } {
  const text = ago(ms);
  return waitsOnPerson(level) ? { text, tone: waitTone(ms) } : { text };
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
