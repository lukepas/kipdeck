// The holo city's words: one callout per district, over the view rather than in the scene, so it reads at
// any distance (its name at 15 px, never smaller) and costs no draw. Each says the part's status as a
// glyph and a word, its name, and for a stuck part what it waits on; the district the next step points at
// also carries the step, in the accent. Every frame they stand in two columns either side of the city as
// it is on screen, each beside its district's side and level with it as far as the others allow
// (logic.ts columnLayout), with a hairline leader to the district, so none covers another or the city.
// They stand down while the city is down, a window covers the view, or you're too far off to read them.
import * as THREE from 'three';
import { STATUS_LABEL, type Status } from '../../../shared/rundown/schema';
import { icon } from '../../ui/icons';
import { STATUS_ICON } from '../../ui/rundown/glyph';
import { CITY, calloutOrder, columnLayout, type District } from './logic';
import './callouts.css';

/** The most callouts drawn (a judgement has 4 to 8 parts; an inferred map a few more). */
export const MAX_CALLOUTS = 12;
/** How far from the table's middle you can be and still read the city (m): the conn is about 11 away. */
const READ_FROM = 22;
const SVG = 'http://www.w3.org/2000/svg';

export interface CityLabels {
  /** What the callouts say: the districts, the top of each over the tabletop (m), and the next step. */
  set(districts: readonly District[], tops: Map<string, number>, step: { partId: string; text: string } | null): void;
  /** Places them for this frame: `toWorld` takes a point in the table's space to the world, `camera` is what's drawn from, `shown` how far the city is up (0-1). */
  place(toWorld: (p: THREE.Vector3) => THREE.Vector3, camera: THREE.Camera, shown: number): void;
  /** Takes them off the screen (the city is down). */
  hide(): void;
  /** The layer, for tests and shots. */
  readonly layer: HTMLElement;
}

interface Callout {
  district: District;
  el: HTMLElement;
  leader: SVGLineElement;
  dot: SVGCircleElement;
  top: number;
  /** The size measured (px), once its words are in. */
  w: number;
  h: number;
}

export function cityLabels(): CityLabels {
  const layer = document.createElement('div');
  layer.className = 'rd-callouts';
  layer.setAttribute('aria-hidden', 'true');
  layer.hidden = true;
  const leaders = document.createElementNS(SVG, 'svg');
  leaders.classList.add('rd-leaders');
  layer.append(leaders);
  document.body.append(layer);
  let callouts: Callout[] = [];
  let highest: number = CITY.lift;
  /** Where the view starts, past the Units rail when it's open (measured now and then: it folds). */
  let viewLeft = 0;
  let measured = -Infinity;
  const at = new THREE.Vector3();
  const centre = new THREE.Vector3();

  const make = (d: District, top: number, step: string | null): Callout => {
    const el = document.createElement('div');
    el.className = `rd-callout st-${d.status}`;
    const head = document.createElement('div');
    head.className = 'rd-c-status';
    head.append(icon(STATUS_ICON[d.status as Status], 13), STATUS_LABEL[d.status as Status]);
    const name = document.createElement('div');
    name.className = 'rd-c-name';
    name.textContent = d.name;
    el.append(head, name);
    if (d.status === 'stuck' && d.waitingOn) {
      const w = document.createElement('div');
      w.className = 'rd-c-wait';
      w.textContent = `Waiting on ${d.waitingOn}`;
      el.append(w);
    }
    if (step) {
      const s = document.createElement('div');
      s.className = 'rd-c-step';
      s.textContent = `Next: ${step}`;
      el.append(s);
    }
    const leader = document.createElementNS(SVG, 'line');
    leader.classList.add(`st-${d.status}`);
    const dot = document.createElementNS(SVG, 'circle');
    dot.classList.add(`st-${d.status}`);
    dot.setAttribute('r', '2.5');
    leaders.append(leader, dot);
    layer.append(el);
    return { district: d, el, leader, dot, top, w: 0, h: 0 };
  };

  const hide = () => {
    layer.hidden = true;
  };

  /** The city's box on screen: every corner of the square it stands on and of its tallest tower's height. */
  const cityBox = (toWorld: (p: THREE.Vector3) => THREE.Vector3, camera: THREE.Camera, W: number, H: number) => {
    const half = CITY.size / 2;
    const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (const x of [-half, half])
      for (const z of [-half, half])
        for (const y of [CITY.lift, highest]) {
          toWorld(at.set(x, y, z)).project(camera);
          if (at.z > 1) continue;
          const px = ((at.x + 1) / 2) * W;
          const py = ((1 - at.y) / 2) * H;
          box.left = Math.min(box.left, px);
          box.right = Math.max(box.right, px);
          box.top = Math.min(box.top, py);
          box.bottom = Math.max(box.bottom, py);
        }
    return box;
  };

  return {
    layer,
    hide,
    set(districts, tops, step) {
      for (const c of callouts) {
        c.el.remove();
        c.leader.remove();
        c.dot.remove();
      }
      callouts = calloutOrder(districts)
        .slice(0, MAX_CALLOUTS)
        .map((d) => make(d, tops.get(d.id) ?? CITY.lift, step && step.partId === d.id ? step.text : null));
      highest = Math.max(CITY.lift, ...callouts.map((c) => c.top));
    },
    place(toWorld, camera, shown) {
      const W = window.innerWidth;
      const H = window.innerHeight;
      // Down, too far off, or a window over the view: nothing to read.
      toWorld(centre.set(0, CITY.lift, 0));
      const covered = !!document.querySelector('#modal-root > .backdrop');
      if (shown < 0.5 || !callouts.length || covered || camera.position.distanceTo(centre) > READ_FROM) return hide();
      layer.hidden = false;
      layer.style.opacity = String(Math.min(1, (shown - 0.5) * 2));
      leaders.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const city = cityBox(toWorld, camera, W, H);
      const now = performance.now();
      if (now - measured > 1000) {
        measured = now;
        const rail = document.querySelector('.rail')?.getBoundingClientRect();
        viewLeft = rail && rail.width > 0 && rail.top < H / 2 && rail.right < W / 2 ? rail.right : 0;
      }
      const shownNow: { c: Callout; ax: number; ay: number }[] = [];
      for (const c of callouts) {
        if (!c.w) {
          c.el.hidden = false;
          const r = c.el.getBoundingClientRect();
          c.w = Math.ceil(r.width);
          c.h = Math.ceil(r.height);
        }
        // The district's anchor: over its tallest tower. One behind you or well off the screen has none.
        toWorld(at.set(c.district.x, c.top + 0.04, c.district.z)).project(camera);
        const off = at.z > 1 || at.z < -1 || Math.abs(at.x) > 1.05 || Math.abs(at.y) > 1.05;
        c.el.hidden = off;
        c.leader.style.display = off ? 'none' : '';
        c.dot.style.display = off ? 'none' : '';
        if (!off) shownNow.push({ c, ax: ((at.x + 1) / 2) * W, ay: ((1 - at.y) / 2) * H });
      }
      const spots = columnLayout(
        shownNow.map(({ c, ax, ay }) => ({ ax, ay, w: c.w, h: c.h })),
        city,
        W,
        H,
        viewLeft,
      );
      shownNow.forEach(({ c, ax, ay }, i) => {
        const s = spots[i];
        c.el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`;
        // The leader: from the callout's edge nearest the city, at its name's height, to the district.
        const lx = s.side === 'left' ? s.x + c.w : s.x;
        const ly = s.y + Math.min(c.h / 2, 26);
        c.leader.setAttribute('x1', String(Math.round(lx)));
        c.leader.setAttribute('y1', String(Math.round(ly)));
        c.leader.setAttribute('x2', String(Math.round(ax)));
        c.leader.setAttribute('y2', String(Math.round(ay)));
        c.dot.setAttribute('cx', String(Math.round(ax)));
        c.dot.setAttribute('cy', String(Math.round(ay)));
      });
    },
  };
}
