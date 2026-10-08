/**
 * The target-acquire bracket: after N (or "go to unit") lands you by a unit in Walk, four corner
 * brackets in the unit's state hue close in on it on screen, hold, and fade, so there's no doubt
 * which unit the office brought you to. They start at 1.8 times the unit's box and close to 1.1 over
 * 260 ms once the flight has landed, hold 900 ms and fade over 200 ms. Under reduced motion they
 * show still at 1.1 for 600 ms. A DOM overlay that never takes the mouse; it follows the unit each
 * 'hud' tick while it shows, and steps aside for a window.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { modalOpen } from '../../ui/dom';
import { UNIT } from '../../world/character/unit-body';
import type { Worker as WorkerModel } from '../../world/character/worker';
import { GLYPH_HUE } from '../../world/glyphs';
import './acquire.css';

export const ACQUIRE = { from: 1.8, to: 1.1, closeMs: 260, holdMs: 900, fadeMs: 200, stillMs: 600 } as const;

const easeOutCubic = (k: number) => 1 - (1 - k) ** 3;

/** How big (times the unit's box) and how opaque the bracket is `ms` after the flight landed; null once it's gone. */
export function acquireAt(ms: number, reduced: boolean): { scale: number; opacity: number } | null {
  if (ms < 0) return null;
  if (reduced) return ms < ACQUIRE.stillMs ? { scale: ACQUIRE.to, opacity: 1 } : null;
  const { from, to, closeMs, holdMs, fadeMs } = ACQUIRE;
  if (ms < closeMs) {
    const k = easeOutCubic(ms / closeMs);
    return { scale: from + (to - from) * k, opacity: Math.min(1, ms / 80) };
  }
  if (ms < closeMs + holdMs) return { scale: to, opacity: 1 };
  if (ms < closeMs + holdMs + fadeMs) return { scale: to, opacity: 1 - (ms - closeMs - holdMs) / fadeMs };
  return null;
}

/** The unit's box on screen (px) grown `scale` times round its middle. */
export function bracketRect(box: { x0: number; y0: number; x1: number; y1: number }, scale: number) {
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const w = (box.x1 - box.x0) * scale;
  const hgt = (box.y1 - box.y0) * scale;
  return { left: cx - w / 2, top: cy - hgt / 2, width: w, height: hgt };
}

/**
 * `r` with its bottom edge held at `floor` (px from the top) at the lowest: the bracket never crosses
 * the bottom bar, the Mission control strip over it or the hint over that. Its top stays where it is.
 */
export function clampBottom<R extends { top: number; height: number }>(r: R, floor: number): R {
  return r.top + r.height <= floor ? r : { ...r, height: Math.max(0, floor - r.top) };
}

/** Pixels kept clear along the bottom of the view: the bottom bar and the strip over it (styles/hud.css --bottom, plus a gap). */
const BOTTOM_CLEAR = 62;

/** Half the unit's width (m) the box takes either side of its middle. */
const HALF_WIDTH = 0.38;

export function makeAcquire(ctx: Ctx, parts: Pick<Parts, 'views' | 'stage' | 'flight'>) {
  const el = document.createElement('div');
  el.className = 'acquire';
  el.hidden = true;
  el.setAttribute('aria-hidden', 'true');
  for (const c of ['tl', 'tr', 'bl', 'br']) el.append(Object.assign(document.createElement('i'), { className: c }));
  (document.getElementById('hud') ?? document.body).append(el);

  let model: WorkerModel | null = null;
  /** When the flight landed (performance.now()), or null while it's still flying. */
  let landed: number | null = null;
  const foot = new THREE.Vector3();
  const pt = new THREE.Vector3();
  const right = new THREE.Vector3();
  const scale = new THREE.Vector3();

  function stop() {
    model = null;
    el.hidden = true;
  }

  /** The unit's box on screen in px, or null while it's behind you or off screen. */
  function boxOf(m: WorkerModel, camera: THREE.Camera) {
    m.where(foot);
    const k = m.root.getWorldScale(scale).y || 1;
    right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize().multiplyScalar(HALF_WIDTH * k);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < 4; i++) {
      pt.copy(foot).addScaledVector(right, i & 1 ? 1 : -1);
      pt.y += i & 2 ? UNIT.top * k : 0;
      pt.project(camera);
      if (pt.z > 1) return null;
      const x = ((pt.x + 1) / 2) * innerWidth;
      const y = ((1 - pt.y) / 2) * innerHeight;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    if (x1 < 0 || x0 > innerWidth || y1 < 0 || y0 > innerHeight) return null;
    return { x0, y0, x1, y1 };
  }

  ctx.ticks.add('hud', ({ now }) => {
    if (!model) return;
    if (landed === null) {
      // It closes in once the view has caught up with where you are.
      if (parts.flight.flying()) return;
      landed = now;
    }
    const at = acquireAt(now - landed, ctx.reduceMotion.matches);
    if (!at || !model.root.parent) return stop();
    const box = modalOpen() ? null : boxOf(model, parts.stage.view ?? ctx.camera);
    if (!box) {
      el.hidden = true;
      return;
    }
    // Clear of the bottom bar, and of the hint over it when that's up (what the unit's keys do).
    const hint = document.getElementById('hint');
    const hintTop = hint && !hint.classList.contains('hidden') ? hint.getBoundingClientRect().top - 6 : Infinity;
    const r = clampBottom(bracketRect(box, at.scale), Math.min(innerHeight - BOTTOM_CLEAR, hintTop));
    el.hidden = false;
    el.style.transform = `translate(${r.left.toFixed(1)}px, ${r.top.toFixed(1)}px)`;
    el.style.width = `${r.width.toFixed(1)}px`;
    el.style.height = `${r.height.toFixed(1)}px`;
    el.style.opacity = at.opacity.toFixed(3);
    el.style.setProperty('--acquire-hue', GLYPH_HUE[model.showing]);
  });

  return {
    /** Brackets the unit `id` once the flight that is taking you to it lands. */
    lock(id: string) {
      const v = parts.views.workerViews.get(id);
      if (!v) return stop();
      model = v.model;
      landed = null;
    },
    /** Whether the bracket is on screen now (for the shots). */
    showing: () => !el.hidden,
  };
}
