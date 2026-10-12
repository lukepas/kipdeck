// The inbox's warm moments (docs/voice.md#signature-moments): the greeting and Kip in the all-clear
// pane, Kip waving on the setup card, the merge's cheer and tuft bounce, the first merge's sticker and
// the first job's toast. Loaded through lazy.ts the first time one is wanted, so none of it is in the
// home page's up-front budget. Every one asks quiet() first: nothing warm shows or plays while anyone
// needs you, and a pose still loading when a question arrives is dropped. Under reduced motion, Ship
// motion Off or Silent running each beat is a cut and Kip holds still (the rule at the end of
// styles/tokens.css).

import { aboardWords, calmPose, greeting, quiet } from '../../shared/warmth';
import { buildInbox } from '../../shared/inbox';
import { storageKey } from '../shared/storage-key';
import { store } from '../state';
import { h, toast } from '../ui/dom';
import { fillKip } from './kip';
import { waitingNow } from './list';
import './warm.css';

const FIRST_JOB_KEY = storageKey('first-job');

/** How many wait on you across every project and filter: the search box never hides a question from the gate. */
export function needsYouNow(): number {
  return waitingNow(buildInbox(store.ranked())).needYou.length;
}

/** Whether a warm moment may show or play now. */
export const calm = () => quiet(needsYouNow());

/**
 * Fills the all-clear pane's warm slots: the greeting's tape label and Kip's pose in `slot`, and on the
 * night shift the line under the heading in `line`. Left empty while anyone needs you.
 */
export function fillCalm(slot: HTMLElement, line: HTMLElement, working: number, now = new Date()) {
  if (!calm()) {
    slot.replaceChildren();
    line.replaceChildren();
    return;
  }
  const g = greeting(now.getHours());
  const kip = h('span.kip.kip-idle');
  slot.replaceChildren(h('p.tape-label', {}, g.eyebrow), kip);
  line.replaceChildren(g.line ?? '');
  void fillKip(kip, calmPose(working, now.getHours()), calm);
}

/** Kip waving on the setup card, before the first agent. */
export function fillWave(slot: HTMLElement) {
  void fillKip(slot, 'wave', calm);
}

/** The tuft on the top bar's mark hops once (600ms). */
function hopTuft() {
  const mark = document.querySelector('.hb-brand .brand-mark');
  if (!mark) return;
  mark.classList.remove('tuft-hop');
  // A fresh start if a second merge lands inside the first one's beat.
  void (mark as HTMLElement).getBoundingClientRect();
  mark.classList.add('tuft-hop');
  setTimeout(() => mark.classList.remove('tuft-hop'), 700);
}

/**
 * A merge landed: the tuft hops, Kip cheers in the toast's icon slot and, on this install's first
 * merge, his sticker sits on the toast's corner. Nothing at all while anyone needs you.
 */
export function celebrate(el: HTMLElement | undefined, first: boolean) {
  if (!calm()) return;
  hopTuft();
  if (!el) return;
  const slot = el.querySelector<HTMLElement>('.toast-icon');
  if (slot) {
    el.classList.add('kip-toast');
    void fillKip(slot, 'cheer', calm).then((ok) => ok || el.classList.remove('kip-toast'));
  }
  if (first) {
    const sticker = h('span.kip-sticker');
    el.append(sticker);
    void fillKip(sticker, 'sticker', calm).then((ok) => ok || sticker.remove());
  }
}

function seen(key: string): boolean {
  try {
    if (localStorage.getItem(key)) return true;
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // Storage blocked: say it this once.
  }
  return false;
}

/** The first job handed out on this install: "<task> is aboard.", with Kip waving. Once, and only when nobody waits. */
export function firstJob(prompt: string) {
  // Marked seen even when it doesn't show, so someone who already has agents never gets it later.
  if (seen(FIRST_JOB_KEY) || store.roster.length > 0 || !calm()) return;
  const words = aboardWords(prompt);
  const el = toast(words.text, 'info', undefined, { sub: words.sub, ms: 6000 });
  el.querySelector('.toast-at')?.remove();
  const slot = el.querySelector<HTMLElement>('.toast-icon');
  if (!slot) return;
  el.classList.add('kip-toast');
  void fillKip(slot, 'wave', calm).then((ok) => ok || el.classList.remove('kip-toast'));
}
