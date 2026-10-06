import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import type { Interactable } from '../../world/types';
import type { MascotRig } from './world';

// Saying hello to the mascot: aim at him and press E (or click), and the hint bar names him. He is on
// the bridge layer, which the aim's ray never tests, so the aim lands on an undrawn stand-in the size of
// him (its material is never drawn, so it costs no draw and the Overview never sees it). Offered only
// while he is free to answer: not while he hides, sits by a unit that needs you or anyone waits.

declare module '../../world/types' {
  interface InteractKinds {
    mascot: true;
  }
}

/** What there is to use of him: move it with him each frame, and say whether he can answer now. */
export interface Hello {
  place(x: number, z: number, open: boolean): void;
}

export function offerHello(ctx: Ctx, rig: MascotRig, clicked: () => void): Hello {
  const it: Interactable = { kind: 'mascot', x: 0, z: 0, radius: 0.9, off: true };
  const standIn = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.8, 8).translate(0, 0.4, 0), new THREE.MeshBasicMaterial({ visible: false }));
  standIn.userData.interact = it;
  rig.root.add(standIn);
  const none = new THREE.Group();
  ctx.interactions.define('mascot', {
    reach: 7,
    hint: () => ({ k: 'mascot', parts: [hintTitle('Kip'), aside('stowaway deck kit'), key('E', 'Say hi')] }),
    use: onE(() => clicked()),
  });
  ctx.usables.add({ usable: () => (it.off ? [] : [it]), pickable: () => (it.off ? none : standIn) });
  return {
    place(x, z, open) {
      it.x = x;
      it.z = z;
      it.off = !open;
    },
  };
}
