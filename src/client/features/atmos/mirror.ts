import * as THREE from 'three';
import { FLOOR_UNIFORMS, MIRROR_BOARDS } from '../../world/office/floor';

// The floor's mirror of the wall boards (High only). What glows brightest on the deck and stands
// biggest is the situation wall, so the floor reflects exactly that: for each point of the polished
// floor, its shader (world/office/floor.ts) follows the eye's ray off the floor to each board's face,
// a flat rectangle it knows (its inverse world matrix and its size), and where the ray lands on one it
// reads that board's own picture, blurred by the floor's roughness and how far the ray went. No
// second render, no layer of the scene drawn again, no depth texture and no draw call: a few sums a
// pixel, and a texture read only where a board is mirrored. (A reflection camera drawing the room's
// emissive layer cost 187 draw calls a frame.)

/** How strong the mirror is, by Night and by Day (the lit floor hides it more by day). */
export const MIRROR_LEVEL = { night: 0.6, day: 0.3 } as const;

export class Mirror {
  private readonly box = new THREE.Box3();

  constructor(private readonly faces: () => THREE.Mesh[]) {}

  /** Points the floor at the boards as they stand now, with their pictures as they are now; `level` 0 turns it off. */
  update(level: number) {
    const u = FLOOR_UNIFORMS;
    u.uMirrorOn.value = level;
    if (level <= 0) return;
    this.faces()
      .slice(0, MIRROR_BOARDS)
      .forEach((face, i) => {
        const map = (face.material as THREE.MeshBasicMaterial).map;
        const on = face.visible && !!map;
        u.uMirrorMaps.value[i] = on ? map : null;
        if (!on) {
          u.uMirrorBox.value[i].set(0, 0, 0, 0);
          return;
        }
        const geo = face.geometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        this.box.copy(geo.boundingBox!);
        face.updateWorldMatrix(true, false);
        u.uMirrorInv.value[i].copy(face.matrixWorld).invert();
        u.uMirrorBox.value[i].set(this.box.min.x, this.box.min.y, this.box.max.x, this.box.max.y);
      });
  }
}
