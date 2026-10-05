import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Fixture } from '../../world/office/fixture';
import { DECK, contactShadow, flat } from '../../world/office/materials';
import { onBridgeLayer } from '../bridge/shapes';
import { CHARGER } from './path';

// Bolt, drawn: a hovering tool-drone of the ship's own make, built lopsided on purpose. A long
// faceted graphite hull, wider on its left where a stubby thruster pod hangs, a short fin raked back
// off its right shoulder; a sensor turret forward with one round, achromatic eye-light that turns to
// whatever Bolt is serving; one articulated arm under its right side, shoulder, forearm and a
// two-fingered clamp, which folds up in flight and reaches down to carry a small ship-cyan crate of
// work. A short ship-cyan trail follows the crate so a handoff reads from the conn. Its charger is a
// bracket on the west wall. No hue of its own beyond the crate's working cyan: it never competes with a
// state. On the bridge layer, so the Overview never shows it. Eight draws, nine while carrying.

export interface DroidRig {
  /** Moves as a whole: place it at its position and yaw. */
  root: THREE.Group;
  /** The sensor turret: turns (y) toward what it serves and tilts (z) on its own. */
  head: THREE.Group;
  /** The arm: the shoulder swings it down (x), the elbow bends it (x). */
  shoulder: THREE.Group;
  elbow: THREE.Group;
  /** The work it carries, in the clamp; visible while carrying. */
  cube: THREE.Mesh;
  /** The shadow on the deck: placed under it each frame, scaled by its height. */
  shadow: THREE.Mesh;
  /** The crate's trail, in world space: set each frame from the points the crate has passed. */
  trail: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
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

/** Its size: half a hull length (m), about one and a half times the old saucer. */
const L = 0.27;
/** How many points the trail keeps. */
export const TRAIL_POINTS = 24;

/** The hull: a long six-sided body, its left flank fuller than its right, a raked nose. */
function hullGeometry(): THREE.BufferGeometry {
  const hull = new THREE.CylinderGeometry(L * 0.42, L * 0.5, L * 1.7, 6, 1).rotateX(Math.PI / 2).scale(1.12, 0.62, 1);
  // Push the left flank out: the lopsided shoulder that carries the thruster pod.
  const pos = hull.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) if (pos.getX(i) < 0) pos.setX(i, pos.getX(i) * 1.22);
  const nose = new THREE.ConeGeometry(L * 0.36, L * 0.5, 6).rotateX(Math.PI / 2).scale(1.1, 0.6, 1).translate(0.01, -0.01, L * 1.08);
  const pod = new THREE.CylinderGeometry(L * 0.17, L * 0.2, L * 0.9, 8).rotateX(Math.PI / 2).translate(-L * 0.78, -L * 0.08, -L * 0.18);
  const podCap = new THREE.CylinderGeometry(L * 0.22, L * 0.22, L * 0.06, 8).rotateX(Math.PI / 2).translate(-L * 0.78, -L * 0.08, -L * 0.66);
  const fin = new THREE.BoxGeometry(L * 0.05, L * 0.42, L * 0.7).translate(0, L * 0.3, 0).rotateX(-0.5).translate(L * 0.32, L * 0.12, -L * 0.42);
  const parts = [hull, nose, pod, podCap, fin].map((g) => (g.index ? g.toNonIndexed() : g));
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
}

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
  const graphite = flat(DECK.unit);
  const steel = flat(DECK.steel);
  root.add(new THREE.Mesh(hullGeometry(), graphite));

  // The sensor turret, forward on the hull, its eye facing +z.
  const head = new THREE.Group();
  head.position.set(L * 0.1, L * 0.26, L * 0.55);
  const turret = mergeGeometries(
    [new THREE.CylinderGeometry(L * 0.24, L * 0.28, L * 0.2, 8), new THREE.BoxGeometry(L * 0.36, L * 0.16, L * 0.2).translate(0, 0.01, L * 0.2), new THREE.CylinderGeometry(L * 0.012, L * 0.012, L * 0.5, 4).translate(-L * 0.16, L * 0.3, -L * 0.06)].map((g) => (g.index ? g.toNonIndexed() : g)),
  )!;
  head.add(new THREE.Mesh(turret, steel));
  const eye = new THREE.Mesh(new THREE.CircleGeometry(L * 0.075, 20), new THREE.MeshBasicMaterial({ color: DECK.text, toneMapped: false }));
  eye.position.set(0, 0.012, L * 0.305);
  head.add(eye);
  root.add(head);

  // The arm, under the right side: shoulder, upper arm, elbow, forearm and clamp, the crate in the clamp.
  const shoulder = new THREE.Group();
  shoulder.position.set(L * 0.42, -L * 0.2, L * 0.25);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(L * 0.09, L * 0.55, L * 0.09).translate(0, -L * 0.27, 0), steel);
  shoulder.add(upper);
  const elbow = new THREE.Group();
  elbow.position.set(0, -L * 0.55, 0);
  const fore = mergeGeometries(
    [
      new THREE.BoxGeometry(L * 0.08, L * 0.5, L * 0.08).translate(0, -L * 0.25, 0),
      new THREE.BoxGeometry(L * 0.04, L * 0.18, L * 0.05).translate(-L * 0.07, -L * 0.58, 0),
      new THREE.BoxGeometry(L * 0.04, L * 0.18, L * 0.05).translate(L * 0.07, -L * 0.58, 0),
    ].map((g) => (g.index ? g.toNonIndexed() : g)),
  )!;
  elbow.add(new THREE.Mesh(fore, steel));
  shoulder.add(elbow);
  root.add(shoulder);

  // The work it carries: a small ship-cyan crate in the clamp.
  const cubeMat = new THREE.MeshBasicMaterial({ color: DECK.ship, toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false });
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), cubeMat);
  cube.position.set(0, -L * 0.62 - 0.07, 0);
  cube.rotation.set(0.2, 0.4, 0);
  cube.visible = false;
  elbow.add(cube);

  // The crate's trail: a line through where the crate has been, fading toward its tail (vertex alpha by colour).
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3));
  const fade = new Float32Array(TRAIL_POINTS * 3);
  const ship = new THREE.Color(DECK.ship);
  for (let i = 0; i < TRAIL_POINTS; i++) {
    const k = 1 - i / (TRAIL_POINTS - 1);
    fade.set([ship.r * k, ship.g * k, ship.b * k], i * 3);
  }
  trailGeo.setAttribute('color', new THREE.BufferAttribute(fade, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  trail.frustumCulled = false;
  trail.visible = false;
  trail.name = 'droid-trail';

  const shadow = contactShadow(0.7, 0.7, 0, 0, 0, 0.006);
  group.add(root, shadow, trail);
  site.group.add(onBridgeLayer(group));

  const rig: DroidRig = {
    root,
    head,
    shoulder,
    elbow,
    cube,
    shadow,
    trail,
    show(on) {
      root.visible = on;
      shadow.visible = on;
      charger.visible = on;
      if (!on) trail.visible = false;
    },
    fadeCube(k) {
      cubeMat.opacity = 0.9 * k;
    },
  };
  rig.show(false);
  root.position.set(CHARGER.x, CHARGER.y, CHARGER.z);
  return { handle: { droid: rig } };
};
