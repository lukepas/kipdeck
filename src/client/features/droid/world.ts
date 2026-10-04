import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Fixture } from '../../world/office/fixture';
import { DECK, contactShadow, flat } from '../../world/office/materials';
import { onBridgeLayer } from '../bridge/shapes';
import { CHARGER } from './path';

// Bolt, drawn: a small hover droid of the ship's own make. A graphite body, slightly squat, with a
// steel hover ring round its middle; a sensor cap on top that turns and tilts on its own, with one
// achromatic lens; a soft shadow on the deck under it; and a small ship-cyan cube of work it carries
// to the Review bay. Its charger is a bracket on the west wall. Five draw calls, six while carrying. No hue of its own beyond the cube's
// working cyan: it never competes with a state. On the bridge layer, so the Overview never shows it.

export interface DroidRig {
  /** Moves as a whole: place it at its position and yaw. */
  root: THREE.Group;
  /** The sensor cap: turns (y) and tilts (z) on its own. */
  head: THREE.Group;
  /** The work it carries, hanging under it; visible while carrying. */
  cube: THREE.Mesh;
  /** The shadow on the deck: placed under it each frame, scaled by its height. */
  shadow: THREE.Mesh;
  /** Shows or hides the droid and its charger's lit seat (the charger stays). */
  show(on: boolean): void;
  /** The cube's opacity as it is set down (0-1). */
  fadeCube(k: number): void;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The bridge droid and its charger (features/droid). */
    droid: DroidRig;
  }
}

const R = 0.17;

export const droid: Fixture<'droid'> = (site) => {
  const group = new THREE.Group();
  group.name = 'droid';

  // The charger: a bracket on the wall with a cradle the droid settles into.
  const charger = new THREE.Group();
  const bracket = mergeGeometries([
    new THREE.BoxGeometry(0.06, 0.62, 0.46).translate(0, 0, 0),
    new THREE.BoxGeometry(0.34, 0.04, 0.4).translate(0.17, -0.27, 0),
    new THREE.TorusGeometry(0.15, 0.018, 6, 24).rotateX(Math.PI / 2).translate(0.24, -0.24, 0),
  ])!;
  charger.add(new THREE.Mesh(bracket, flat(DECK.console)));
  charger.position.set(CHARGER.x - 0.36, CHARGER.y + 0.02, CHARGER.z);
  group.add(charger);

  const root = new THREE.Group();
  // The body: a squat sphere and its hover ring, one mesh.
  const body = mergeGeometries([new THREE.SphereGeometry(R, 20, 14).scale(1, 0.82, 1), new THREE.TorusGeometry(R * 1.04, 0.016, 6, 32).rotateX(Math.PI / 2).translate(0, -0.01, 0)].map((g) => g.toNonIndexed()))!;
  root.add(new THREE.Mesh(body, flat(DECK.unit)));

  // The cap: a low dome a little forward of centre, its lens facing +z.
  const head = new THREE.Group();
  head.position.set(0, R * 0.72, 0.01);
  const cap = mergeGeometries([new THREE.SphereGeometry(R * 0.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.CylinderGeometry(R * 0.6, R * 0.62, 0.02, 16).translate(0, -0.01, 0)].map((g) => g.toNonIndexed()))!;
  head.add(new THREE.Mesh(cap, flat(DECK.steel)));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ color: DECK.text, toneMapped: false }));
  lens.position.set(0, R * 0.28, R * 0.53);
  lens.rotation.x = -0.45;
  head.add(lens);
  root.add(head);

  // The work it carries: a small ship-cyan cube under it.
  const cubeMat = new THREE.MeshBasicMaterial({ color: DECK.ship, toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false });
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.11), cubeMat);
  cube.position.set(0, -R - 0.11, 0);
  cube.rotation.set(0.5, 0.6, 0);
  cube.visible = false;
  root.add(cube);

  const shadow = contactShadow(0.5, 0.5, 0, 0, 0, 0.006);
  group.add(root, shadow);
  site.group.add(onBridgeLayer(group));

  const rig: DroidRig = {
    root,
    head,
    cube,
    shadow,
    show(on) {
      root.visible = on;
      shadow.visible = on;
      charger.visible = on;
    },
    fadeCube(k) {
      cubeMat.opacity = 0.9 * k;
    },
  };
  rig.show(false);
  root.position.set(CHARGER.x, CHARGER.y, CHARGER.z);
  return { handle: { droid: rig } };
};
