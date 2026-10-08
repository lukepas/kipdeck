// Kip on the landing page: the investor deck's mascot, running alongside the visitor. main.ts loads
// this chunk in the first idle moment after the opening (never with ?nokip) and calls mountKip.
// Everything Kip adds is aria-hidden and outside the tab order; he only ever moves by transform and
// opacity, and with less motion he is a still drawing in three places, placed once.
import '../styles/kip.css';
import { env, tier } from '../engine/env';
import { createKit, type Kit } from './kit';
import { docHost, fixedHost } from './hosts';
import { direct } from './director';
import { tricks } from './tricks';
import { engine } from './tween';
import { MOMENTS } from './moments/index';
import { obstacles, pick } from './perch';

export interface KipOptions {
  /** The hero's field turns toward a point (Kip, when he is clicked). */
  attend?: (x: number, y: number) => void;
}

/** The test hook (tests/landing-kip.test.ts): where he is drawn and what owns him. What he is doing
 *  and the spot probe are there only in development or with ?kiptest. */
interface KipHook {
  /** His box on screen (and the teammate's), viewport px; empty while he is away. */
  box(): { l: number; t: number; r: number; b: number }[];
  readonly moment: string | null;
  /** Frames his engine has drawn (stays 0 with less motion). */
  readonly ticks: number;
  readonly stills: number;
  readonly blocked?: string[];
  readonly state?: Record<string, unknown>;
  /** A moment's candidate spots and what (if anything) each one would cover. */
  probe?(id: string): unknown;
}
declare global {
  interface Window {
    __kip?: KipHook;
  }
}

export function mountKip(opts: KipOptions = {}) {
  if (document.getElementById('kip-doc')) return;
  const lite = tier === 'lite';
  const doc = docHost(lite);
  if (env.reduced) {
    engine.sync = true;
    const kits = stills(doc);
    window.__kip = { box: () => kits.map((k) => k.box()).filter((b) => !!b), moment: null, get ticks() { return engine.ticks; }, stills: kits.length };
    return;
  }
  const kit = createKit();
  kit.mount(doc);
  kit.hide();
  kit.life(true);
  const fixed = fixedHost(lite);
  const d = direct(kit, doc, fixed, lite);
  const t = tricks(d, { fixed, doc, attend: opts.attend });
  const hook: KipHook = {
    box: () => [kit.box(), ...[...document.querySelectorAll<HTMLElement>('.kip.buddy')].map((b) => boxOf(b))].filter((b): b is NonNullable<typeof b> => !!b),
    get moment() { return d.owner(); },
    get ticks() { return engine.ticks; },
    stills: 0,
  };
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('kiptest')) {
    Object.defineProperties(hook, {
      blocked: { get: () => d.blocked() },
      state: { get: () => ({ ...d.debug(), laps: t.laps }) },
      probe: { value: (id: string) => d.probe(id) },
    });
  }
  window.__kip = hook;
}

function boxOf(el: HTMLElement) {
  if (getComputedStyle(el).visibility === 'hidden' || Number(getComputedStyle(el).opacity) < 0.05) return null;
  const parts = [...el.querySelectorAll('.k-head, .k-torso, .k-legL, .k-legR, .k-armL, .k-armR, .k-tail')].map((p) => p.getBoundingClientRect());
  if (!parts.length) return null;
  return { l: Math.min(...parts.map((p) => p.left)), t: Math.min(...parts.map((p) => p.top)), r: Math.max(...parts.map((p) => p.right)), b: Math.max(...parts.map((p) => p.bottom)) };
}

/** With less motion: a still Kip on the first clear spot of the moments that have one, placed again when the page's layout changes. */
function stills(doc: ReturnType<typeof docHost>): Kit[] {
  const kits: Kit[] = [];
  const places: (() => void)[] = [];
  for (const sec of document.querySelectorAll<HTMLElement>('main > [data-scene]')) {
    const def = MOMENTS[sec.dataset.scene!];
    if (!def?.still) continue;
    const kit = createKit();
    kit.static = true;
    kit.el.classList.add('static');
    kit.mount(doc);
    const still = def.still;
    const place = () => {
      const sp = pick(def.spots(sec), obstacles(sec, { ignore: def.ignore }));
      if (!sp) return void kit.hide();
      const p = doc.toLocal(sp.x, sp.y);
      kit.setSize(sp.s);
      kit.at(p.x, p.y, still.face ?? sp.face ?? 'front');
      kit.pose(still.pose);
      kit.sprig('green');
    };
    place();
    places.push(place);
    kits.push(kit);
  }
  // One observer for all of them: any change to the page's size places each again, once a frame.
  let queued = 0;
  new ResizeObserver(() => {
    if (queued) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      places.forEach((f) => f());
    });
  }).observe(document.querySelector('main')!);
  return kits;
}
