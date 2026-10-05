/**
 * The deck's static meshes merged into a few draws (./merge.ts), each time a floor arrives (the
 * office's own seats and fittings shown or put away for it): a snapshot on the next frame, and a few
 * frames later the merge of what hasn't moved or hidden since, so what animates all the time is never
 * merged. A check every frame after that splits off anything merged that moves, hides or changes.
 * Units in their seats, their laptops and markers, and the droid are never merged.
 */
import type * as THREE from 'three';
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import { mergeStatic, snapshot, type Merged } from './merge';

/** Frames after a floor arrives that the snapshot is taken on, and the merge made on. */
const SNAP_AFTER = 1;
const MERGE_AFTER = 5;

export function installMerge(ctx: Ctx): { merged(): Merged | null } {
  const root = ctx.office.group;
  /** Frames to go before the snapshot, while one is due. */
  let due = -1;
  let frame = 0;
  let still: Map<THREE.Mesh, Float32Array> | null = null;
  let merged: Merged | null = null;

  /** What moves of its own: whoever sits at each seat and their laptop, the marker over a free one, and the droid. A chair turns only when someone sits, and is split off then. */
  function movers(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [ctx.office.droid.root];
    for (const d of ctx.office.desks.values()) out.push(d.seatAnchor, d.laptopAnchor, d.vacancy);
    return out;
  }

  store.on('floor', () => {
    due = SNAP_AFTER;
    frame = 0;
  });

  ctx.ticks.add('pre', () => {
    if (due >= 0) {
      frame++;
      if (frame === due) {
        merged?.undo();
        merged = null;
        still = snapshot(root);
      } else if (frame === MERGE_AFTER && still) {
        const t0 = performance.now();
        merged = mergeStatic(root, { skip: movers() }, still);
        still = null;
        due = -1;
        root.userData.merge = { meshes: merged.meshes.length, merged: merged.merged, ms: +(performance.now() - t0).toFixed(1), live: () => merged?.live(), undo: () => merged?.undo() };
      }
    } else merged?.check();
  });
  return { merged: () => merged };
}
