/**
 * A unit's wait clock on the page: '12m' in its wait's tone (shared/wait.ts), fresh muted, aging
 * white and bold, stale heavier and underlined. It ticks to the minute, never by the second: when the minute
 * it shows changes, the new one fades in (320 ms), and a change of tone eases its color over 200 ms.
 * Under reduced motion both cut (styles/tokens.css). The rail, Mission control, the selected unit's
 * card and the needs-you chip all draw their clocks here, so they look and move the same.
 */
import './waitclock.css';
import type { AttentionLevel } from '../../shared/attention';
import { waitClock, type WaitTone } from '../../shared/wait';
import { h } from './dom';

/** What each keyed clock showed last, for clocks drawn anew on each render (the rail's rows): a change still ticks. */
export const shown = new Map<string, string>();

/** Draws `text` in `tone` (none: a plain muted clock) into `el`; with `key`, remembered across redraws so a new minute ticks in. */
export function paintWait(el: HTMLElement, text: string, tone?: WaitTone, key?: string): void {
  el.classList.add('wait-clock');
  if (tone) el.dataset.tone = tone;
  else delete el.dataset.tone;
  const was = key ? shown.get(key) : el.textContent;
  if (el.textContent !== text) el.textContent = text;
  if (key) shown.set(key, text);
  if (!was || was === text) return;
  el.classList.remove('tick');
  // Read back, so taking the class off and putting it on again starts the fade over.
  void el.offsetWidth;
  el.classList.add('tick');
}

/** A clock for a unit at `level` that has been so for `ms`: toned only when it waits on a person. */
export function waitSpan(level: AttentionLevel, ms: number, key?: string, cls = ''): HTMLElement {
  const el = h('span', { class: cls || undefined, title: 'How long it has waited' });
  const c = waitClock(level, ms);
  paintWait(el, c.text, c.tone, key);
  return el;
}

const minuteFns = new Set<() => void>();
let minuteTimer: ReturnType<typeof setTimeout> | undefined;

/** Calls every subscriber on the wall clock's whole minute, so the clocks that keep their own time all turn together. */
function minuteTick() {
  for (const fn of minuteFns) fn();
  minuteTimer = setTimeout(minuteTick, 60_000 - (Date.now() % 60_000));
}

/** Runs `fn` on every whole minute (one shared timer for every clock that subscribes); returns the way to stop. */
export function onMinute(fn: () => void): () => void {
  minuteFns.add(fn);
  minuteTimer ??= setTimeout(minuteTick, 60_000 - (Date.now() % 60_000));
  return () => {
    minuteFns.delete(fn);
    if (minuteFns.size || minuteTimer === undefined) return;
    clearTimeout(minuteTimer);
    minuteTimer = undefined;
  };
}

/**
 * Forgets the clocks of units no longer `alive` (keys like 'rail:<id>'), so the memory of what each
 * showed doesn't only grow. A key whose rest isn't a plain id (a review item's own key) is kept.
 */
export function forgetClocks(alive: (id: string) => boolean): void {
  for (const key of shown.keys()) {
    const at = key.indexOf(':');
    const id = key.slice(at + 1);
    if (at > 0 && !id.includes(':') && !alive(id)) shown.delete(key);
  }
}
