/**
 * The holo's waypoint plates keep off the boards: ten times a second each plate's rectangle on screen
 * is checked against the wall boards' faces (features/boardfaces), and one that would cover a face is
 * hidden until it wouldn't. From the captain's chair the column stands under the arc, so they all show;
 * from down in the pit the arc rises behind it, and the board wins.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { overlaps } from './holo-route';

const EVERY = 100;

export function platesOffBoards(ctx: Ctx, parts: Pick<Parts, 'boardFaces' | 'stage'>) {
  const c = new THREE.Vector3();
  const e = new THREE.Vector3();
  const right = new THREE.Vector3();
  let at = -Infinity;
  ctx.ticks.add('hud', ({ now }) => {
    if (now - at < EVERY) return;
    at = now;
    const faces = parts.boardFaces?.faces().flatMap((f) => (f.px ? [f.px] : [])) ?? [];
    const camera = parts.stage.view ?? ctx.camera;
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const W = window.innerWidth;
    const H = window.innerHeight;
    for (const s of ctx.office.holo.plates()) {
      // The plate's left edge is its anchor (center.x 0): its box runs right along the view's right.
      s.getWorldPosition(c);
      const sc = s.getWorldScale(e);
      const p0 = c.clone().project(camera);
      const p1 = c.clone().addScaledVector(right, sc.x).project(camera);
      if (p0.z > 1) continue;
      const x0 = ((p0.x + 1) / 2) * W;
      const x1 = ((p1.x + 1) / 2) * W;
      const hPx = (Math.abs(x1 - x0) * sc.y) / sc.x;
      const y = ((1 - p0.y) / 2) * H;
      s.visible = !overlaps({ left: Math.min(x0, x1), right: Math.max(x0, x1), top: y - hPx / 2, bottom: y + hPx / 2 }, faces);
    }
  });
}
