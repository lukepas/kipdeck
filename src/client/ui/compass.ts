import './compass.css';
import * as THREE from 'three';
import { h } from './dom';
import { icon } from './icons';

/** What a mark at the edge points to: one that needs you, one that's stuck, one to review. In this order of importance. */
export type BearingKind = 'needs-you' | 'stuck' | 'review';
const PRIORITY: Record<BearingKind, number> = { 'needs-you': 0, stuck: 1, review: 2 };

/** A unit waiting on someone: who, why, and where its head is. */
export interface Bearing {
  id: string;
  name: string;
  kind: BearingKind;
  at: THREE.Vector3;
}

/**
 * The marks along one edge, most important first, that fit in `room` pixels at `gap` apart: when an
 * edge is crowded, the ones to review go before the stuck ones, and the stuck before the ones that need you.
 */
export function crowd<T extends { kind: BearingKind }>(marks: readonly T[], room: number, gap: number): T[] {
  const fits = Math.max(1, Math.floor(room / gap) + 1);
  return [...marks].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]).slice(0, fits);
}

/** From a mark's middle to the edge of the screen, or of the HUD it sits beside, with room for its tip (px). */
const MARGIN = 34;
/** How far apart marks on one edge keep: a dial and its name down a side, a name's width along the top or bottom (px). */
const SPACING = { side: 56, across: 110 };

type Edge = 'left' | 'right' | 'top' | 'bottom';

interface Mark {
  el: HTMLElement;
  arrow: HTMLElement;
  dial: HTMLElement;
  who: HTMLElement;
  kind: string;
}

/**
 * An arrow at the edge of the screen for each unit waiting on someone that's out of view, pointing the
 * way to turn to see it: a Signal diamond for one that needs you, a red triangle for one that's stuck,
 * an amber circle for one to review. They keep inside the HUD's panels, pinned to the edge.
 */
export class Compass {
  private readonly marks = new Map<string, Mark>();
  /** Where the marks can go: clear of the top bar, the Units rail, and the bottom bar and hint along the bottom. */
  private box = { top: 0, right: 0, bottom: 0, left: 0 };
  /** Where the Units rail ends on screen (0 when it's folded away): a unit under it is out of view. */
  private railRight = 0;
  private measured = -Infinity;
  private readonly cam = new THREE.Vector3();
  private readonly ndc = new THREE.Vector3();

  constructor(private readonly root: HTMLElement) {}

  /** Call after rendering, so the camera's matrices are this frame's. */
  update(camera: THREE.Camera, bearings: readonly Bearing[], now: number) {
    if (now - this.measured > 1000) this.measure(now);
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const { top, right, bottom, left } = this.box;
    const placed: { b: Bearing; x: number; y: number; angle: number; edge: Edge }[] = [];
    for (const b of bearings) {
      // Where it is from the camera, which looks down its -z.
      const cam = this.cam.copy(b.at).applyMatrix4(camera.matrixWorldInverse);
      let dx: number;
      let dy: number;
      if (cam.z < -0.01) {
        const ndc = this.ndc.copy(b.at).project(camera);
        // In view already, jumping at its desk (under the Units rail doesn't count as in view).
        const px = (ndc.x + 1) * cx;
        if (px >= this.railRight && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1) continue;
        dx = ndc.x * cx;
        dy = -ndc.y * cy;
      } else {
        // Behind you: to the side you'd turn to, or straight down when it's right behind.
        dx = cam.x;
        dy = Math.abs(cam.x) < 0.05 && Math.abs(cam.y) < 0.05 ? 1 : -cam.y;
      }
      // Out from the middle of the screen along that way, to the edge of the box.
      let s = Infinity;
      if (dx > 0) s = (right - cx) / dx;
      else if (dx < 0) s = (left - cx) / dx;
      if (dy > 0) s = Math.min(s, (bottom - cy) / dy);
      else if (dy < 0) s = Math.min(s, (top - cy) / dy);
      if (!Number.isFinite(s)) continue;
      const x = cx + dx * s;
      const y = cy + dy * s;
      const edge = x <= left + 1 ? 'left' : x >= right - 1 ? 'right' : y <= top + 1 ? 'top' : 'bottom';
      placed.push({ b, x, y, angle: Math.atan2(dy, dx), edge });
    }
    // Workers at desks side by side land on top of each other: spread them out along their edge, and
    // where there are more than the edge has room for, keep the most important.
    const kept: typeof placed = [];
    for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
      const side = edge === 'left' || edge === 'right';
      const axis = side ? 'y' : 'x';
      const gap = side ? SPACING.side : SPACING.across;
      const fit = crowd(
        placed.filter((p) => p.edge === edge).map((p) => ({ ...p, kind: p.b.kind })),
        side ? bottom - top : right - left,
        gap,
      );
      const row = fit.sort((a, b) => a[axis] - b[axis]);
      kept.push(...row);
      for (let i = 1; i < row.length; i++) row[i][axis] = Math.max(row[i][axis], row[i - 1][axis] + gap);
      // Pushed off the end: back the lot up.
      const over = row.length ? row[row.length - 1][axis] - (side ? bottom : right) : 0;
      if (over > 0) for (const p of row) p[axis] = Math.max(side ? top : left, p[axis] - over);
    }
    const seen = new Set<string>();
    for (const p of kept) {
      seen.add(p.b.id);
      const m = this.mark(p.b);
      m.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
      // The pin's point is its bottom-left corner, which sits at 135° before it's turned.
      m.arrow.style.transform = `rotate(${(p.angle - (3 * Math.PI) / 4).toFixed(3)}rad)`;
    }
    for (const [id, m] of this.marks) {
      if (seen.has(id)) continue;
      m.el.remove();
      this.marks.delete(id);
    }
  }

  private mark(b: Bearing): Mark {
    let m = this.marks.get(b.id);
    if (!m) {
      const arrow = h('span.compass-arrow');
      const dial = h('span.compass-dial');
      const who = h('span.compass-who');
      const el = h('div.compass-mark', {}, arrow, dial, who);
      this.root.append(el);
      m = { el, arrow, dial, who, kind: '' };
      this.marks.set(b.id, m);
    }
    if (m.kind !== b.kind) {
      m.kind = b.kind;
      m.el.className = `compass-mark ${b.kind}`;
      m.dial.replaceChildren(icon(b.kind, 14));
    }
    if (m.who.textContent !== b.name) m.who.textContent = b.name;
    return m;
  }

  /** The HUD moves as the window resizes and the top bar's buttons wrap, so look again now and then. */
  private measure(now: number) {
    this.measured = now;
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    const bar = document.querySelector('.topbar')?.getBoundingClientRect();
    const rail = document.querySelector('.rail')?.getBoundingClientRect();
    this.railRight = rail?.width && rail.top < hgt / 2 ? rail.right : 0;
    // Never so tight the marks crowd the middle of the screen. The rail is on the left; the bottom bar
    // and the hint over it along the bottom.
    this.box = {
      top: Math.min(Math.max(MARGIN, (bar?.bottom ?? 0) + MARGIN), hgt / 2 - 60),
      right: Math.max(w - MARGIN, w / 2 + 60),
      bottom: Math.max(hgt - 104, hgt / 2 + 60),
      left: Math.min(rail?.width && rail.top < hgt / 2 ? rail.right + MARGIN : MARGIN, w / 2 - 60),
    };
  }
}
