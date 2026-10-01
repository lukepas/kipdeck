import * as THREE from 'three';
import type { Theme } from '../../../shared/protocol';
import { elfBoot, elfHat, elfWorker, zombieWorker } from '../costumes';
import type { WorkerRig } from './rig';

// Dressing a worker up for a holiday.

/** What a zombie worker's skin is mixed toward. */
const ZOMBIE = new THREE.Color('#7fa36b');

/**
 * Dresses a worker up for a holiday (a zombie for Halloween, an elf for Christmas), or in just its own
 * skin, `color` (null). What it puts on goes in `outfit`, for taking off again.
 */
export function dressUp(rig: WorkerRig, theme: Theme | null, color: string, outfit: THREE.Object3D[]) {
  const wear = (parent: THREE.Object3D, o: THREE.Object3D) => {
    o.traverse((m) => ((m as THREE.Mesh).castShadow = true));
    parent.add(o);
    outfit.push(o);
  };
  rig.skin.color.set(color);
  if (theme === 'halloween') {
    rig.skin.color.lerp(ZOMBIE, 0.6).multiplyScalar(0.85);
    wear(rig.body, zombieWorker(rig.skin));
  } else if (theme === 'christmas') {
    wear(rig.body, elfHat());
    wear(rig.body, elfWorker(rig.skin));
    for (const f of rig.feet) wear(f, elfBoot());
  }
}
