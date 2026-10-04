import './litesuggest.css';
// Offering the 2D view (/lite) where the 3D office is hard going: on a phone, with no keys to walk
// with, or on a computer where frames come slowly (see framerate.ts).

import { h } from './dom';

/** Said to stay in 3D: this browser isn't offered the 2D view again (it's in the menu). */
const DECLINED_KEY = 'agent-office.lite-declined';

/** A touch screen and no mouse: a phone or a tablet, which can't walk around the office anyway. */
export function touchOnly(): boolean {
  return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
}

function declined(): boolean {
  try {
    return localStorage.getItem(DECLINED_KEY) === '1';
  } catch {
    return false;
  }
}

let offered = false;

/** A phone held either way: too narrow for the deck and its rail side by side. */
export function phoneSized(): boolean {
  return Math.min(window.innerWidth, window.innerHeight) <= 640;
}

/**
 * Offers the 2D view, at most once a page, unless this browser said to stay in 3D before. A phone goes
 * straight there: the 2D view is the phone's deck, and its 3D button comes back here.
 */
export function offerLite(why: 'touch' | 'slow') {
  if (offered || declined()) return;
  if (why === 'touch' && phoneSized()) {
    location.replace('/lite');
    return;
  }
  offered = true;
  const say =
    why === 'touch'
      ? 'On a tablet? The 2D view is made for touch: every unit ranked by what needs you, its terminal and the boards.'
      : 'The 3D deck is running slowly on this computer. The 2D view has the units, their terminals and the boards, without the 3D.';
  const stay = h('button.btn', { type: 'button' }, 'Stay in 3D');
  const el = h(
    'div.lite-offer.panel',
    { role: 'dialog', 'aria-label': 'Try the 2D view' },
    h('p', {}, say),
    h('div.lite-offer-btns', {}, h('a.btn.primary', { href: '/lite' }, 'Open the 2D view'), stay),
  );
  stay.addEventListener('click', () => {
    try {
      localStorage.setItem(DECLINED_KEY, '1');
    } catch {
      // storage blocked: it's only this page then
    }
    el.remove();
  });
  document.body.append(el);
}
