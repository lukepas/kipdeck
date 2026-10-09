// The merge hold: Merge doesn't merge at once. For MERGE_HOLD_MS a toast says what is about to happen
// and where ("Squash-merging PR #12 into main"), with the task, a countdown and Undo (Esc or u undo the
// latest, keys.ts); only then is the merge sent. Until it lands the change no longer counts as waiting
// on you (inFlight). The same toast then says how it went: a settled check and "Merged PR #12 into
// main", with how long the change waited on you, or why it didn't merge. A merge can't be taken back
// once GitHub or git has it, so the time to change your mind is before.

import { mergeWords } from '../../shared/inbox';
import type { RosterEntry, ShipRecord } from '../../shared/protocol';
import { waitWords } from '../../shared/wait';
import { h } from '../ui/dom';
import { icon } from '../ui/icons';
import { settle } from './beat';

/** How long a merge waits for an Undo. */
export const MERGE_HOLD_MS = 7_000;

interface Hold {
  until: number;
  timer: ReturnType<typeof setTimeout>;
  tick: ReturnType<typeof setInterval>;
  toast: HTMLElement;
  /** What it said before, for the toast once the merge lands. */
  entry: Pick<RosterEntry, 'into' | 'pr' | 'name'> & { title: string };
}

const holds = new Map<string, Hold>();
/** The toasts of merges that were sent and not answered yet, by agent. */
const sent = new Map<string, { toast: HTMLElement; entry: Hold['entry'] }>();

/** Whether `id`'s merge is held, waiting out its Undo. */
export const isHeld = (id: string) => holds.has(id);

/** When `id`'s held merge will be sent, or undefined when it isn't held. */
export const heldUntil = (id: string): number | undefined => holds.get(id)?.until;

/** The merge held most recently, for the keyboard's Undo; undefined when none is. */
export const latestHeld = (): string | undefined => [...holds.keys()].pop();

/** Whether `id`'s merge is held or sent and not answered yet: it waits on the merge now, not on you. */
export const inFlight = (id: string) => holds.has(id) || sent.has(id);

/** "6s": what's left of a held merge, in whole seconds (the toast's countdown and the row's, clock.ts). */
export const countdownWords = (ms: number) => `${Math.max(0, Math.ceil(ms / 1000))}s`;

function fade(el: HTMLElement, after: number) {
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, after);
}

/**
 * Holds `e`'s merge for MERGE_HOLD_MS, then calls `send`. `changed` redraws the page (the row and the
 * pane show the hold). Merging one already held does nothing.
 */
export function holdMerge(e: RosterEntry, title: string, send: () => void, changed: () => void, ms = MERGE_HOLD_MS) {
  if (holds.has(e.id)) return;
  const until = Date.now() + ms;
  // The countdown is for the eye; the sentence is what a screen reader hears, once.
  const left = h('time.hold-left', { 'aria-hidden': 'true' }, countdownWords(until - Date.now()));
  const undo = h('button.btn.hold-undo', { type: 'button', onclick: () => undoMerge(e.id, changed) }, 'Undo');
  const toast = h(
    'div.toast.hold',
    { role: 'status', style: `--hold-ms:${ms}ms` },
    h('span.toast-icon', { 'aria-hidden': 'true' }, icon('working', 14)),
    h('span.toast-text', {}, mergeWords(e), h('small', {}, `${title} (${e.name}). Undo keeps it unmerged.`)),
    left,
    undo,
    h('span.hold-bar', { 'aria-hidden': 'true' }),
  );
  document.getElementById('toasts')?.append(toast);
  const entry = { into: e.into, pr: e.pr, name: e.name, title };
  const hold: Hold = {
    until,
    toast,
    entry,
    tick: setInterval(() => (left.textContent = countdownWords(until - Date.now())), 250),
    timer: setTimeout(() => {
      clearInterval(hold.tick);
      holds.delete(e.id);
      sent.set(e.id, { toast, entry });
      left.remove();
      undo.remove();
      toast.querySelector('.hold-bar')?.remove();
      toast.querySelector('.toast-text small')?.replaceChildren('Sent. This takes a few seconds.');
      send();
      changed();
    }, ms),
  };
  holds.set(e.id, hold);
  changed();
}

/** Takes a held merge back: nothing was sent. */
export function undoMerge(id: string, changed: () => void) {
  const hold = holds.get(id);
  if (!hold) return;
  clearTimeout(hold.timer);
  clearInterval(hold.tick);
  holds.delete(id);
  hold.toast.querySelector('.toast-text')?.replaceChildren('Merge undone. Nothing was merged.', h('small', {}, `${hold.entry.title} is still in To review.`));
  hold.toast.querySelector('.toast-icon')?.replaceChildren(icon('info', 14));
  hold.toast.querySelectorAll('.hold-left, .hold-undo, .hold-bar').forEach((x) => x.remove());
  hold.toast.classList.remove('hold');
  fade(hold.toast, 2500);
  changed();
}

/** The office answered a merge this page sent: its toast says how it went. False when this page has no toast for it. */
export function mergeLanded(workerId: string, result: { error?: string; record?: ShipRecord }, note?: string): boolean {
  const s = sent.get(workerId);
  if (!s) return false;
  sent.delete(workerId);
  const text = s.toast.querySelector('.toast-text');
  s.toast.classList.remove('hold');
  if (result.error) {
    s.toast.classList.add('warn');
    text?.replaceChildren(result.error);
    fade(s.toast, 6000);
    return true;
  }
  const waited = result.record?.waitedMs;
  // What merged, how long it waited on you, and then the note (the first merge's) or where it went.
  const wait = waited === undefined ? '' : ` It waited on you ${waitWords(waited)}.`;
  const said = `${s.entry.title}.${wait} ${note ?? "It's in Shipped today."}`;
  text?.replaceChildren(mergeWords(s.entry, true), h('small', {}, said));
  settle(s.toast);
  fade(s.toast, 4500);
  return true;
}
