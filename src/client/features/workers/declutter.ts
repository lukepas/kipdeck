/**
 * Callouts that would cover each other (a pod seen end on, the Overview from far off) stack instead:
 * every frame, each unit's callout is measured on screen, and one that overlaps a callout placed
 * before it is lifted just clear of it. Units that need someone are placed first, so theirs stay put,
 * then the nearest. The stacking itself is stack(), with nothing to draw, so the tests run it.
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

export function installDeclutter(ctx: Ctx, parts: Pick<Parts, 'views' | 'overview' | 'stage'>) {
  const bottom = new THREE.Vector3();
  const top = new THREE.Vector3();
  const at = new THREE.Vector3();
  const up = new THREE.Vector3();
  const rise = new THREE.Vector3();
  // After the units have moved and sized their callouts ('others'), before the frame is drawn.
  ctx.ticks.add('hud', () => {
    const camera = parts.stage.view ?? ctx.camera;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const shown: { model: { setLift(m: number): void }; box: LabelBox; urgent: boolean; d: number; pxPerM: number }[] = [];
    // Callouts face the camera: their height runs along its up, which the frame drawn last left in its matrix.
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    for (const v of parts.views.workerViews.values()) {
      const m = v.model;
      if (!m.calloutEdges(bottom, top, up)) {
        m.setLift(0);
        continue;
      }
      const d = camera.position.distanceTo(m.where(at));
      // A callout is lifted straight up in the world, which the camera may see shortened: how many
      // pixels a meter of that is here, to turn a lift on screen back into meters.
      rise.copy(bottom).y += 1;
      rise.project(camera);
      bottom.project(camera);
      top.project(camera);
      // Behind the camera, or off the screen: out of the stacking.
      if (bottom.z > 1 || bottom.z < -1 || Math.abs(bottom.x) > 1.2 || Math.abs(bottom.y) > 1.2) {
        m.setLift(0);
        continue;
      }
      const h = Math.max(1, Math.hypot(((top.x - bottom.x) / 2) * W, ((top.y - bottom.y) / 2) * H));
      const w = h * m.calloutAspect();
      const cx = ((bottom.x + 1) / 2) * W;
      const pxPerM = Math.max(1, Math.hypot(((rise.x - bottom.x) / 2) * W, ((rise.y - bottom.y) / 2) * H));
      shown.push({ model: m, box: { x: cx - w / 2, bottom: ((1 - bottom.y) / 2) * H, w, h }, urgent: m.urgent, d, pxPerM });
    }
    shown.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.d - b.d);
    const lifts = stack(shown.map((s) => s.box));
    shown.forEach((s, i) => s.model.setLift(lifts[i] / s.pxPerM));
  });
}
