// Kip in the inbox's quiet moments (docs/voice.md#kip): his pose in the all-clear pane, his wave on the
// setup card and on the first job's toast, and on a merge his cheer in the toast's icon slot and the
// tuft's hop. The same Kip as the landing page and the sign-in card (src/shared/kip-art.ts), held still
// in one pose. Loaded through lazy.ts the first time one is wanted, so none of it is in the home page's
// up-front budget. Each one asks quiet() first: nothing shows or plays while anyone needs you, and a
// pose that arrives after a question came in is dropped. Under reduced motion, Ship motion Off or
// Silent running each beat is a cut and Kip holds still (the rule at the end of styles/tokens.css).

import { kipStill, type KipStill } from '../../shared/kip-art';
import { quiet } from './warm';
import './kip-moments.css';

/** Puts Kip in `pose` into `slot`, as decoration (aria-hidden), unless someone needs you by now. */
function put(slot: HTMLElement, pose: KipStill): boolean {
  if (!quiet()) return false;
  slot.setAttribute('aria-hidden', 'true');
  slot.innerHTML = kipStill(pose);
  return true;
}

/** Fills a Kip slot with the pose its markup names (`data-pose`, set up front so a pose change redraws the pane). */
export function fillKip(slot: HTMLElement) {
  if (!put(slot, slot.dataset.pose as KipStill)) slot.replaceChildren();
}

/** Kip in a toast's icon slot, in place of its check. */
export function kipInToast(el: HTMLElement, pose: KipStill) {
  const slot = el.querySelector<HTMLElement>('.toast-icon');
  if (slot && put(slot, pose)) el.classList.add('kip-toast');
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
 * A merge landed: the tuft hops and Kip cheers in the toast's icon slot. One Kip and nothing else, the
 * first merge included; nothing at all over a failed merge or while anyone needs you.
 */
export function celebrate(el: HTMLElement | undefined) {
  if (!quiet() || el?.classList.contains('warn')) return;
  hopTuft();
  if (el) kipInToast(el, 'cheer');
}
