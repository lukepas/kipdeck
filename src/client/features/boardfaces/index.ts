/**
 * The wall boards' faces on screen: each frame, before the callouts are placed, the four work boards'
 * and the Attention board's faces (with their bezels) are projected through whichever camera draws the
 * frame, and their rectangles go to what has to keep out of their way. The holo over the table fades
 * its stars and its cone where they are (features/bridge/holo-mask.ts); the units' callouts dock under
 * them (features/workers/declutter.ts); the focus lean eases in on the one under the crosshair
 * (features/focuslean). One small sum per board a frame; no draw.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { OFF_SCREEN } from '../bridge/holo-mask';
import { contains, pack, rectOf, toPx, type Clip, type PxRect, type Rect } from './logic';

/** The boards whose faces count, west to east along the wall. */
export const FACE_IDS = ['issues', 'queue', 'tv', 'pulls', 'services'] as const;
export type FaceId = (typeof FACE_IDS)[number];

/** A board's face this frame: its rectangle in NDC and in pixels, or null for both when it's off the screen. */
export interface Face {
  id: FaceId;
  rect: Rect | null;
  px: PxRect | null;
}

/** How far past the face its bezel and hairlines reach (m, bridge/displays.ts). */
const BEZEL = 0.16;

export function installBoardFaces(ctx: Ctx, parts: Pick<Parts, 'stage'>) {
  const faces: Face[] = FACE_IDS.map((id) => ({ id, rect: null, px: null }));
  const meshOf = (id: FaceId): THREE.Mesh => (id === 'tv' ? ctx.office.tvScreen : ctx.office.boardMeshes[id]);
  const viewProj = new THREE.Matrix4();
  const v = new THREE.Vector4();
  const corners: Clip[] = Array.from({ length: 4 }, () => ({ x: 0, y: 0, w: 1 }));
  ctx.ticks.add('aim', () => {
    const camera = parts.stage.view ?? ctx.camera;
    camera.updateMatrixWorld();
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const W = window.innerWidth;
    const H = window.innerHeight;
    for (const f of faces) {
      const mesh = meshOf(f.id);
      const geo = mesh.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const box = geo.boundingBox!;
      mesh.updateWorldMatrix(true, false);
      for (let i = 0; i < 4; i++) {
        v.set(i & 1 ? box.max.x + BEZEL : box.min.x - BEZEL, i & 2 ? box.max.y + BEZEL : box.min.y - BEZEL, 0, 1).applyMatrix4(mesh.matrixWorld).applyMatrix4(viewProj);
        corners[i].x = v.x;
        corners[i].y = v.y;
        corners[i].w = v.w;
      }
      f.rect = mesh.visible ? rectOf(corners) : null;
      f.px = f.rect ? toPx(f.rect, W, H) : null;
    }
    pack(
      faces.map((f) => f.rect),
      ctx.office.holo.boards,
      OFF_SCREEN,
    );
  });
  return {
    /** Every board's face this frame. */
    faces: (): readonly Face[] => faces,
    /** The board the crosshair (the middle of the view) is on, if any. */
    aimed: (): Face | null => faces.find((f) => f.rect && contains(f.rect, 0, 0)) ?? null,
  };
}
