// The wait clocks tick: every second, each clock with a `data-since` (a row waiting on you, the
// pulse's longest wait) gets its text and its tone (fresh, amber from 5m, red from 30m) set again in
// place. Only those text nodes change, so the list isn't drawn again and nothing under the pointer
// moves. Seconds show for the first minute, so a wait that just started is visibly a clock. A
// `data-until` counts down instead ("Merging in 6s", a held merge's row).

import { waitTone, waitWords } from '../../shared/wait';
import { countdownWords } from './merge-hold';

/** Sets each clock under `root` to `now`. */
export function tickClocks(root: ParentNode = document, now = Date.now()) {
  for (const el of root.querySelectorAll<HTMLElement>('[data-until]')) {
    const text = `${el.dataset.prefix} ${countdownWords(Number(el.dataset.until) - now)}`;
    if (el.textContent !== text) el.textContent = text;
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-since]')) {
    const ms = now - Number(el.dataset.since);
    const text = el.dataset.prefix ? `${el.dataset.prefix} ${waitWords(ms)}` : waitWords(ms);
    if (el.textContent !== text) el.textContent = text;
    const tone = waitTone(ms);
    if (el.dataset.tone !== tone) el.dataset.tone = tone;
  }
}

/** Starts the one-second tick. */
export function startClocks() {
  setInterval(() => {
    if (!document.hidden) tickClocks();
  }, 1_000);
}
