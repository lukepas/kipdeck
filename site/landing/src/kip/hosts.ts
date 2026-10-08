// Where Kip can be drawn. Three hosts, each a layer the kit mounts into:
// - doc: a layer at the page's top-left in page coordinates, so the browser's own scrolling carries
//   him (section moments and the section-boundary companion);
// - stage: a layer inside a pinned section's sticky stage, added only while it pins, so he holds still
//   while the stage does;
// - fixed: the viewport, only for the K key's corner peek.
// A host change only ever happens while he is away (after a zip out), never mid-gesture.
import type { Place, Pt } from './kit';
import { PIN_MEDIA } from '../engine/drive';

export interface Host extends Place {
  name: 'doc' | 'stage' | 'fixed';
  /** A host point in the viewport. */
  toClient(x: number, y: number): Pt;
  /** The stage's section, for stage hosts. */
  section?: HTMLElement;
}

function layer(id: string | null, cls: string | null, parent: HTMLElement): HTMLElement {
  const el = document.createElement('div');
  if (id) el.id = id;
  if (cls) el.className = cls;
  el.setAttribute('aria-hidden', 'true');
  parent.appendChild(el);
  return el;
}

/** The scroll position and window size, cached by passive listeners: read in the middle of a frame,
 *  after the page's own writes, scrollY and innerHeight would each force a layout. */
export const view = { x: scrollX, y: scrollY, w: innerWidth, h: innerHeight };
addEventListener('scroll', () => {
  view.x = scrollX;
  view.y = scrollY;
}, { passive: true, capture: true });
addEventListener('resize', () => {
  view.w = innerWidth;
  view.h = innerHeight;
  view.x = scrollX;
  view.y = scrollY;
}, { passive: true, capture: true });

/** Reads the scroll position now: where a spot is measured and placed (a rare event), so a scroll the
 *  page made in this frame after its scroll events (an anchor's own jump) cannot put him off by it. */
export function syncView() {
  view.x = scrollX;
  view.y = scrollY;
}

export function docHost(lite: boolean): Host {
  const el = layer('kip-doc', null, document.body);
  return {
    name: 'doc', layer: el, lite,
    toLocal: (cx, cy) => ({ x: cx + view.x, y: cy + view.y }),
    toClient: (x, y) => ({ x: x - view.x, y: y - view.y }),
    width: () => document.documentElement.clientWidth,
  };
}

export function fixedHost(lite: boolean): Host {
  const el = layer('kip-fixed', null, document.body);
  return {
    name: 'fixed', layer: el, lite,
    toLocal: (cx, cy) => ({ x: cx, y: cy }),
    toClient: (x, y) => ({ x, y }),
    width: () => document.documentElement.clientWidth,
  };
}

const stages = new Map<HTMLElement, Host>();

/** The host inside a pinned section's stage (made on first use, kept while it pins). */
export function stageHost(section: HTMLElement, lite: boolean): Host | null {
  const stage = section.querySelector<HTMLElement>('.track > .stage');
  if (!stage || !pinned()) return null;
  let h = stages.get(stage);
  if (h && h.layer.isConnected) return h;
  const el = layer(null, 'kip-stage-host', stage);
  const rect = () => stage.getBoundingClientRect();
  h = {
    name: 'stage', layer: el, lite, section,
    toLocal: (cx, cy) => {
      const r = rect();
      return { x: cx - r.left, y: cy - r.top };
    },
    toClient: (x, y) => {
      const r = rect();
      return { x: x + r.left, y: y + r.top };
    },
    width: () => stage.clientWidth,
  };
  stages.set(stage, h);
  return h;
}

/** Stage hosts go when the window stops pinning (and come back on demand). */
export function dropStages() {
  for (const h of stages.values()) h.layer.remove();
  stages.clear();
}

const pinQuery = typeof matchMedia === 'function' ? matchMedia(PIN_MEDIA) : null;
export const pinned = () => !!pinQuery?.matches;
export function onPinChange(fn: () => void) {
  pinQuery?.addEventListener('change', fn);
}
