// The inbox's small rewards: a settled toast with a green check when something you did landed (an
// answer sent, a change merged). One line that says what happened, never confetti. Under reduced
// motion the check just appears (tokens.css turns the animation into a cut).

import { toast } from '../ui/dom';
import { icon } from '../ui/icons';
import './beat.css';

/** Turns a toast into the settled kind: the green stripe and a check that draws itself in. */
export function settle(el: HTMLElement) {
  el.classList.remove('warn', 'error', 'needs-you', 'proof', 'info');
  el.classList.add('settled');
  el.querySelector('.toast-icon')?.replaceChildren(icon('check', 14));
  // It just happened: a "<1m" stamp would make it read stale.
  el.querySelector('.toast-at')?.remove();
}

/** "Merged PR #12 into main", with "waited on you 32s" under it. */
export function settledToast(text: string, sub?: string): HTMLElement {
  const el = toast(text, 'info', undefined, { ...(sub ? { sub } : {}), ms: 4500 });
  settle(el);
  return el;
}
