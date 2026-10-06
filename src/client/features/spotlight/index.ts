/**
 * The spotlight: the grade's local vignette (features/cinema/grade.ts) round what needs the captain.
 * While a unit needs you or is stuck, a dark ring settles round it on screen (the most urgent one, as
 * the ranking orders them) and a lighter one round the Attention board's rows, so the eye lands there
 * without the rest of the room going grey. Inside a focus and on every board's face nothing changes.
 * It eases in and out over 0.6 s; it is a light change, not motion, so it plays under reduced motion
 * too. Only at a tier that draws the grade (High, Medium); Low keeps the marks and the board's chrome.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { UNIT } from '../../world/character/unit-body';
import { signalOf } from '../signals/logic';
import { debugHandle } from '../giveway';
import { FOCUS_NOW } from './focus';
import { SPOT, easeSpot, pickIndex, unitEllipse } from './logic';

export function installSpotlight(ctx: Ctx, parts: Pick<Parts, 'views' | 'stage' | 'giveWay'>) {
  const foot = new THREE.Vector3();
  const head = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const levels: string[] = [];
  const ids: string[] = [];
  let station = 0;
  let board = 0;
  ctx.ticks.add('hud', ({ dt }) => {
    const camera = parts.stage.view ?? ctx.camera;
    levels.length = 0;
    ids.length = 0;
    for (const [id, v] of parts.views.workerViews) {
      const kind = signalOf(v.model.showing);
      if (kind !== 'needs-you' && kind !== 'stuck') continue;
      if (!v.model.root.visible) continue;
      levels.push(kind);
      ids.push(id);
    }
    const i = pickIndex(levels);
    let want = 0;
    if (i >= 0) {
      const v = parts.views.workerViews.get(ids[i])!;
      v.model.where(foot);
      const k = v.model.root.getWorldScale(scale).y || 1;
      head.copy(foot).setY(foot.y + UNIT.top * k);
      foot.project(camera);
      head.project(camera);
      // In front of the camera and on screen, or there is nothing to pick out.
      if (foot.z < 1 && Math.abs(foot.x) < 1.2 && Math.abs(foot.y) < 1.2) {
        const aspect = innerWidth / Math.max(1, innerHeight);
        const { rx, ry } = unitEllipse(foot.y, head.y, aspect);
        FOCUS_NOW.points[0].set(foot.x, (foot.y + head.y) / 2, rx, ry);
        want = SPOT.station;
      }
    }
    station = easeSpot(station, want, dt);
    // The board's rows: the hero's face, as its corners project.
    const tv = ctx.office.tvScreen;
    const geo = tv.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const b = geo.boundingBox!;
    tv.updateWorldMatrix(true, false);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let behind = false;
    for (let c = 0; c < 4; c++) {
      corner.set(c & 1 ? b.max.x : b.min.x, c & 2 ? b.max.y : b.min.y, 0).applyMatrix4(tv.matrixWorld).project(camera);
      if (corner.z > 1) behind = true;
      x0 = Math.min(x0, corner.x);
      x1 = Math.max(x1, corner.x);
      y0 = Math.min(y0, corner.y);
      y1 = Math.max(y1, corner.y);
    }
    const boardWant = i >= 0 && !behind ? SPOT.board : 0;
    if (!behind) FOCUS_NOW.points[1].set((x0 + x1) / 2, (y0 + y1) / 2, Math.max(0.05, ((x1 - x0) / 2) * 1.08), Math.max(0.05, ((y1 - y0) / 2) * 1.12));
    board = easeSpot(board, boardWant, dt);
    FOCUS_NOW.k.set(station, board);
  });
  debugHandle('spotlight', { focus: FOCUS_NOW });
}
