/**
 * Callouts never cover each other (a pod seen end on, the Overview from far off): every frame each
 * unit's callout is measured on screen and placed in the order of who needs someone most (needs you
 * and stuck, then to review, then the nearest). One that would overlap a callout already placed is
 * lifted a little; if that isn't enough it shrinks to its glyph and call sign ("C-02"); a unit at work
 * whose call sign still has no room shows no callout at all. One that needs someone always shows, lifted
 * as far as it must be, a hairline tying it back to its unit. A callout that would run off the side of
 * the view, or under the Units rail, slides back in. The placing itself is declutter() and nudge(),
 * with nothing to draw, so the tests run them.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';

/** A callout on screen, in pixels from the top left: its left edge, its bottom edge, its size. */
export interface LabelBox {
  x: number;
  bottom: number;
  w: number;
  h: number;
}

/** Pixels kept between two stacked callouts. */
const GAP = 3;
/** The most a callout is lifted, in its own heights: past that it may cover, rather than float off its unit. */
const MAX_LIFT = 4;

/**
 * How far (pixels, up) to lift each of `boxes`, in the order given (most important first), so none
 * covers one before it. Each is lifted only as far as it must be, and never past MAX_LIFT of its height.
 */
export function stack(boxes: readonly LabelBox[]): number[] {
  const placed: { x: number; top: number; bottom: number; w: number }[] = [];
  return boxes.map((b) => {
    let lift = 0;
    for (let tries = 0; tries < boxes.length; tries++) {
      const bottom = b.bottom - lift;
      const top = bottom - b.h;
      const hit = placed.find((p) => b.x < p.x + p.w && b.x + b.w > p.x && bottom > p.top && top < p.bottom);
      if (!hit) break;
      lift = b.bottom - hit.top + GAP;
    }
    lift = Math.min(lift, MAX_LIFT * b.h);
    placed.push({ x: b.x, top: b.bottom - lift - b.h, bottom: b.bottom - lift, w: b.w });
    return lift;
  });
}

/** A callout to place: its full box, its call-sign box, and whether it may be left out. */
export interface Label {
  full: LabelBox;
  compact: LabelBox;
  /** Needs someone: it always shows. */
  keep: boolean;
}

export interface Placed {
  mode: 'full' | 'compact' | 'hidden';
  lift: number;
}

/** How far (in its own heights) a callout is lifted before it shrinks instead. */
const SOFT_LIFT = 1.5;

/** The lift that clears `b` of every box placed, or null past `limit` pixels. */
function clearLift(b: LabelBox, placed: { x: number; top: number; bottom: number; w: number }[], limit: number): number | null {
  let lift = 0;
  for (let tries = 0; tries <= placed.length; tries++) {
    const bottom = b.bottom - lift;
    const top = bottom - b.h;
    const hit = placed.find((p) => b.x < p.x + p.w && b.x + b.w > p.x && bottom > p.top && top < p.bottom);
    if (!hit) return lift <= limit ? lift : null;
    lift = b.bottom - hit.top + GAP;
    if (lift > limit) return null;
  }
  return null;
}

/**
 * Where each of `labels` goes, in the order given (most important first): its full callout if it fits
 * with a small lift, else its call sign, else (one that needs nobody) nothing. One that must show and
 * fits nowhere takes its call sign lifted as far as MAX_LIFT allows, as stack() does.
 */
export function declutter(labels: readonly Label[]): Placed[] {
  const placed: { x: number; top: number; bottom: number; w: number }[] = [];
  const put = (b: LabelBox, lift: number) => placed.push({ x: b.x, top: b.bottom - lift - b.h, bottom: b.bottom - lift, w: b.w });
  return labels.map((l) => {
    const full = clearLift(l.full, placed, SOFT_LIFT * l.full.h);
    if (full !== null) {
      put(l.full, full);
      return { mode: 'full', lift: full };
    }
    const compact = clearLift(l.compact, placed, SOFT_LIFT * l.compact.h);
    if (compact !== null) {
      put(l.compact, compact);
      return { mode: 'compact', lift: compact };
    }
    if (!l.keep) return { mode: 'hidden', lift: 0 };
    const lift = Math.min(clearLift(l.compact, placed, Infinity) ?? 0, MAX_LIFT * l.compact.h);
    put(l.compact, lift);
    return { mode: 'compact', lift };
  });
}

/** Pixels kept between a callout and the side of the view (or the rail). */
const EDGE = 8;

/**
 * How far (pixels, positive to the right) `b` slides so it sits between `left` and `right`: none when
 * it fits already; held to the left edge when it's wider than the room.
 */
export function nudge(b: LabelBox, left: number, right: number): number {
  if (b.x < left + EDGE) return left + EDGE - b.x;
  if (b.x + b.w > right - EDGE) return Math.max(left + EDGE - b.x, right - EDGE - (b.x + b.w));
  return 0;
}

export function installDeclutter(ctx: Ctx, parts: Pick<Parts, 'views' | 'overview' | 'stage'>) {
  const bottom = new THREE.Vector3();
  const top = new THREE.Vector3();
  const at = new THREE.Vector3();
  const up = new THREE.Vector3();
  const rise = new THREE.Vector3();
  /** Where the view starts, past the Units rail when it's open (measured now and then: it folds). */
  let left = 0;
  let measured = -Infinity;
  // After the units have moved and sized their callouts ('others'), before the frame is drawn.
  ctx.ticks.add('hud', ({ now }) => {
    const camera = parts.stage.view ?? ctx.camera;
    if (now - measured > 1000) {
      measured = now;
      const rail = document.querySelector('.rail')?.getBoundingClientRect();
      left = rail && rail.width > 0 && rail.top < window.innerHeight / 2 ? rail.right : 0;
    }
    // Where it is this frame, whatever moved it since the last frame was drawn.
    camera.updateMatrixWorld();
    const W = window.innerWidth;
    const H = window.innerHeight;
    const shown: { model: { setLift(m: number): void; setMode(m: Placed['mode']): void; setNudge(f: number): void }; label: Label; rank: number; d: number; pxPerM: number }[] = [];
    // Callouts face the camera: their height runs along its up, which the frame drawn last left in its matrix.
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    /** A callout's box on screen from its edges in the world, or null when it's off the screen. */
    const box = (aspect: number): LabelBox | null => {
      bottom.project(camera);
      top.project(camera);
      if (bottom.z > 1 || bottom.z < -1 || Math.abs(bottom.x) > 1.2 || Math.abs(bottom.y) > 1.2) return null;
      const h = Math.max(1, Math.hypot(((top.x - bottom.x) / 2) * W, ((top.y - bottom.y) / 2) * H));
      const w = h * aspect;
      const cx = ((bottom.x + 1) / 2) * W;
      return { x: cx - w / 2, bottom: ((1 - bottom.y) / 2) * H, w, h };
    };
    for (const v of parts.views.workerViews.values()) {
      const m = v.model;
      if (!m.calloutEdges(bottom, top, up)) {
        m.setLift(0);
        m.setMode('full');
        m.setNudge(0);
        continue;
      }
      const d = camera.position.distanceTo(m.where(at));
      // A callout is lifted straight up in the world, which the camera may see shortened: how many
      // pixels a meter of that is here, to turn a lift on screen back into meters.
      rise.copy(bottom).y += 1;
      rise.project(camera);
      const anchor = bottom.clone().project(camera);
      const pxPerM = Math.max(1, Math.hypot(((rise.x - anchor.x) / 2) * W, ((rise.y - anchor.y) / 2) * H));
      const full = box(m.calloutAspect());
      m.calloutEdges(bottom, top, up, true);
      const compact = box(m.calloutAspect(true));
      // Behind the camera, or off the screen: out of the placing, shown as it is.
      if (!full || !compact) {
        m.setLift(0);
        m.setMode('full');
        m.setNudge(0);
        continue;
      }
      shown.push({ model: m, label: { full, compact, keep: m.rank < 2 }, rank: m.rank, d, pxPerM });
    }
    shown.sort((a, b) => a.rank - b.rank || a.d - b.d);
    const placed = declutter(shown.map((s) => s.label));
    shown.forEach((s, i) => {
      const { mode, lift } = placed[i];
      s.model.setMode(mode);
      s.model.setLift(lift / s.pxPerM);
      const b = mode === 'compact' ? s.label.compact : s.label.full;
      // Only a callout whose unit is in view slides in: one whose unit is off the side, or under the
      // rail, stays over it (the compass points the way).
      const anchor = b.x + b.w / 2;
      s.model.setNudge(mode === 'hidden' || anchor < left || anchor > W ? 0 : nudge(b, left, W) / b.w);
    });
  });
}
