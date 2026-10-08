// The corner peek: where no section and no boundary has room for him and the page has been still
// for a moment, he comes up from the window's bottom-right corner (only if nothing is drawn there),
// looks round, and ducks back down as soon as the page scrolls. The director decides when.
import type { Kit } from './kit';
import type { Host } from './hosts';
import { obstacles, boxAt, type Spot } from './perch';
import { timeline, type Timeline } from './tween';

/** His feet below the window's bottom-right corner, so about two thirds of him shows. On a wide
 *  screen, at the right edge of the content column rather than out at the window's edge, where
 *  motion would pull the eye away from what the visitor reads. */
export function cornerSpot(kit: Kit, fixed: Host, s: number): Spot {
  const wrap = document.querySelector('main .wrap')?.getBoundingClientRect();
  const edge = fixed.width() - kit.w * 0.6 * s;
  const x = wrap && wrap.width ? Math.min(edge, wrap.right + 24) : edge;
  return { x, y: innerHeight + kit.h * 0.32 * s, s, face: 'l' };
}

/** What may be under him: the page's own frame, nothing drawn. */
const BARE = new Set(['HTML', 'BODY', 'MAIN', 'SECTION']);

/** Whether nothing in `roots` (the sections near the window, and the footer) is drawn where he would
 *  show: no text or control (measured where text that is still sliding in will end up), and nothing
 *  at all (a card, a chart, an image, a border) on a 3 x 3 grid of points inside his box. */
export function cornerClear(sp: Spot, roots: Element[]): boolean {
  const box = { ...boxAt(sp), b: innerHeight };
  for (const root of roots) {
    const r = root.getBoundingClientRect();
    if (r.bottom < box.t - 40 || r.top > box.b) continue;
    // Text still revealing (.rv, 22 px lower until it is in) counts where it will land too.
    if (obstacles(root).some((o) => box.l < o.r && box.r > o.l && box.t < o.b + 22 && box.b > o.t - 22)) return false;
  }
  for (const fx of [0.15, 0.5, 0.85]) for (const fy of [0.15, 0.5, 0.85]) {
    const x = box.l + (box.r - box.l) * fx, y = box.t + (box.b - box.t) * fy;
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.closest('.kip, #kip-doc, #kip-fixed, .kip-stage-host')) continue;
      if (BARE.has(el.tagName) || el.classList.contains('wrap') || el.classList.contains('track') || el.classList.contains('stage')) continue;
      return false;
    }
  }
  return true;
}

/** Up from behind the corner, a look at the page, eyes back. */
export function peekUp(kit: Kit, fixed: Host, sp: Spot): Timeline {
  kit.stop();
  kit.mount(fixed);
  kit.setSize(sp.s);
  kit.headroom = 0;
  const tl = timeline().add(kit.riseFrom(sp.x, sp.y, 'l', { hold: 0.4 }));
  tl.add(kit.lookAt({ x: innerWidth * 0.45, y: innerHeight * 0.5 }), '+=0.1');
  tl.add(kit.lookAt(null), '+=0.9');
  return tl;
}

/** Down and back to the page's layer, at once (the page is moving under him). */
export function peekDown(kit: Kit, doc: Host) {
  kit.stop();
  kit.hide();
  kit.mount(doc);
}
