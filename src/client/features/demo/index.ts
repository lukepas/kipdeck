/**
 * Demo mode, for a screen share, a projector or a recording: open the deck with `?demo=1` (it holds
 * for the tab until `?demo=0`). The type is at least about 15px, callouts and glyphs are drawn a
 * quarter bigger, the alert strip can't be put away, the Overview turns slowly round the mission
 * table once you're in (any key, drag or wheel takes over), and the glow round emissive light is a
 * little stronger (features/lights), so a compressed video still reads. Under reduced motion there is no orbit.
 */
import './demo.css';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { Worker } from '../../world/character/worker';
import { storageKey } from '../../shared/storage-key';

const KEY = storageKey('demo', () => sessionStorage);
/** How much bigger units' callouts and glyphs are drawn. */
const WEIGHT = 1.25;
/** The Overview's turn round the table (radians a second): once round in about a minute and three quarters. */
const ORBIT = 0.06;

/** Whether demo mode is on for this tab: `?demo=1` turns it on, `?demo=0` off, and it holds in between. */
export function demoOn(search = location.search): boolean {
  const q = new URLSearchParams(search).get('demo');
  try {
    if (q === '1') sessionStorage.setItem(KEY, '1');
    else if (q === '0') sessionStorage.removeItem(KEY);
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    // storage blocked: the address alone says
    return q === '1';
  }
}

export function installDemo(ctx: Ctx, parts: Pick<Parts, 'overview'>) {
  if (!demoOn()) return { on: false };
  document.body.classList.add('demo');
  Worker.weight = WEIGHT;

  // The glow is the lights' (features/lights), a little stronger here.

  // Up into the Overview and round the table, once the deck is here and you're in.
  const off = store.on('floor', () => {
    off();
    setTimeout(() => {
      if (!ctx.reduceMotion.matches) parts.overview.orbit(ORBIT);
      else parts.overview.toggle(true);
    }, 800);
  });
  return { on: true };
}
