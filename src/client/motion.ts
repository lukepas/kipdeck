// Less motion: asked for by the system (prefers-reduced-motion), or in Settings > Bridge with Ship
// motion at Off. Either one stills the whole office: the 3D deck reads `matches` (ctx.reduceMotion)
// for its glides, flights, beats and the space outside, and the page's CSS reads the root's
// data-motion="reduce" the same as the media query. Calm keeps the deck's own motion and only slows
// what's outside the glass (features/space). Three.js-free, for the 2D view too.

import type { ShipMotion } from './state/persist';

export interface Motion {
  /** Whether to hold still: the system asks for less motion, or Ship motion is Off. */
  readonly matches: boolean;
  /** How space outside moves: Off whenever the system asks for less motion. */
  readonly ship: ShipMotion;
}

/** The office's motion setting, read live from `setting` (the saved Settings' shipMotion). */
export function makeMotion(setting: () => ShipMotion): Motion {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motion: Motion = {
    get matches() {
      return media.matches || setting() === 'off';
    },
    get ship() {
      return media.matches ? 'off' : setting();
    },
  };
  markMotion(setting());
  return motion;
}

/** Tells the page's CSS whether Ship motion is Off (the media query covers the system's own setting). */
export function markMotion(ship: ShipMotion) {
  if (ship === 'off') document.documentElement.dataset.motion = 'reduce';
  else delete document.documentElement.dataset.motion;
}

/** Whether to hold still now, for a page that has no Motion of its own (the loading screen). */
export function stillNow(): boolean {
  return document.documentElement.dataset.motion === 'reduce' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
