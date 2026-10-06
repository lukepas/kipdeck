import * as THREE from 'three';
import { LADDER, LOUNGE, LOUNGE_SEATS, loungeColliders } from '../../../shared/lounge';
import type { Fixture } from '../../world/office/fixture';
import { DECK, box, matte, practical, rbox, worldUv } from '../../world/office/materials';
import { seatable } from '../../world/office/seats';
import { mesh } from '../../world/toon';
import type { Interactable } from '../../world/types';

// The forward lounge (shared/lounge.ts): a viewing balcony hung at the bow behind the situation arc,
// its deck level with the bow glass's sill, so from up there the glass runs from your feet to over your
// head. Built like the rest of the bridge: deck plate laid with the floor's grid, a graphite fascia with
// the tiers' lit ship-cyan lip along its nosing, brushed steel rails on posts round its open sides, a
// steel ladder up its south face with grab posts and a spring gate at its head, three low lounge seats
// fanned to the glass, and a few warm downlights under it. All of it but the gate stands still, so the
// deck's merge (features/merge) draws it in the buckets the rest of the bridge has already. Kept dark
// (the hull's zone of value): from the captain's chair only its fascia shows, under the arc's foot, and
// nothing of it is a state's hue.

declare module '../../world/types' {
  interface OfficeHandles {
    /** The forward lounge's moving part: the gate at the ladder's head (features/lounge). */
    forwardLounge: LoungeRig;
  }
}

export interface LoungeRig {
  /** Swings the gate at the ladder's head open (1) or shut (0). */
  gate(open: number): void;
}

/** Warm white of low chroma: the lounge's own light, under it and under its seats (DESIGN.md rule 2). */
const WARM = '#D8D2C6';
/** How high over the balcony the gate's bar is, and how far it swings open (radians, in onto the balcony). */
const GATE_Y = 0.92;
const GATE_SWING = 1.45;

/** A straight tube from `a` to `b`, `r` thick. */
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 8, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  return g.translate(mid.x, mid.y, mid.z);
}

/**
 * A guard rail along `pts` (on the balcony's deck): a handrail, a mid rail and a toe plate, on posts at
 * each point and every metre or so between.
 */
function rail(into: THREE.Group, pts: THREE.Vector3[], steel: THREE.Material, plate: THREE.Material) {
  const top = LOUNGE.top;
  const h = LOUNGE.rail;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    into.add(mesh(tube(a.clone().setY(top + h), b.clone().setY(top + h), 0.026), steel, 0, 0, 0, false));
    into.add(mesh(tube(a.clone().setY(top + h * 0.5), b.clone().setY(top + h * 0.5), 0.014), steel, 0, 0, 0, false));
    const len = a.distanceTo(b);
    const toe = mesh(box(len, 0.09, 0.012), plate, (a.x + b.x) / 2, top + 0.045, (a.z + b.z) / 2, false);
    toe.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    into.add(toe);
    const n = Math.max(1, Math.round(len / 1.15));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const p = a.clone().lerp(b, k / n);
      into.add(mesh(new THREE.CylinderGeometry(0.02, 0.024, h, 8), steel, p.x, top + h / 2, p.z, false));
    }
  }
  // A round cap over each end and corner of the handrail.
  for (const p of pts) into.add(mesh(new THREE.SphereGeometry(0.03, 10, 6), steel, p.x, top + h, p.z, false));
}

/** A lounge seat, built facing +z: a swivel on a steel post, a deep cushion, a raked back with a head pad, arms, and a warm line under its front. */
function loungeSeat(): THREE.Group {
  const g = new THREE.Group();
  const steel = matte(DECK.steel);
  const shell = matte(DECK.console);
  const pad = matte(DECK.unit);
  g.add(mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.035, 24), steel, 0, 0.018, 0, false));
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.24, 12), steel, 0, 0.15, 0, false));
  // The shell the cushion sits in, and the cushion.
  g.add(mesh(rbox(0.68, 0.1, 0.62, 0.04, 2), shell, 0, 0.3, 0));
  g.add(mesh(rbox(0.58, 0.09, 0.54, 0.04, 2), pad, 0, 0.385, 0.02));
  // The back, raked, its pad and a head pad over it.
  const back = new THREE.Group();
  back.position.set(0, 0.34, -0.28);
  back.rotation.x = -0.26;
  back.add(mesh(rbox(0.66, 0.74, 0.08, 0.04, 2), shell, 0, 0.37, 0));
  back.add(mesh(rbox(0.56, 0.5, 0.06, 0.03, 2), pad, 0, 0.32, 0.06));
  back.add(mesh(rbox(0.36, 0.14, 0.07, 0.035, 2), pad, 0, 0.66, 0.06));
  g.add(back);
  for (const s of [-1, 1]) g.add(mesh(rbox(0.07, 0.06, 0.5, 0.025, 2), shell, s * 0.33, 0.5, 0.0));
  for (const s of [-1, 1]) g.add(mesh(box(0.05, 0.16, 0.06), shell, s * 0.33, 0.41, 0.16, false));
  // The warm line under the cushion's front edge.
  g.add(mesh(box(0.48, 0.012, 0.012), practical(WARM), 0, 0.247, 0.3, false));
  return g;
}

/** The forward lounge, at the bow behind the arc. */
export const forwardLounge: Fixture<'forwardLounge'> = (site) => {
  const group = new THREE.Group();
  group.name = 'forward-lounge';
  const { x0, x1, z0, z1, top, under } = LOUNGE;
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const fascia = matte(DECK.console);
  const steel = matte(DECK.steelLight);
  const dark = matte(DECK.steel);
  const lip = practical(DECK.shipDim);

  // The deck: its slab, its top laid like the floor (the same grid, in world metres), the lit lip along its nosing.
  group.add(mesh(box(w, top - under, d), fascia, cx, (top + under) / 2, cz));
  const floorGeo = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(cx, top + 0.002, cz);
  worldUv(floorGeo);
  const deckTop = new THREE.Mesh(floorGeo, site.planks);
  deckTop.receiveShadow = true;
  group.add(deckTop);
  group.add(mesh(box(w, 0.018, 0.03), lip, cx, top - 0.02, z1 + 0.006, false));
  // A beam along its underside at the front, and the downlights in it, each in a dark bezel.
  group.add(mesh(box(w, 0.14, 0.2), fascia, cx, under - 0.07, z1 - 0.12));
  for (let i = 0; i < 4; i++) {
    const x = x0 + (w * (i + 0.5)) / 4;
    group.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.016, 16), dark, x, under - 0.006, cz - 0.2, false));
    group.add(mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.004, 16), practical(WARM), x, under - 0.016, cz - 0.2, false));
  }
  // Hung from the canopy: a slim rod up from each front corner and the middle of the front.
  for (const x of [x0 + 0.25, cx, x1 - 0.25]) group.add(mesh(tube(new THREE.Vector3(x, top, z1 - 0.09), new THREE.Vector3(x, 6.75, z1 - 0.09), 0.018), dark, 0, 0, 0, false));
  // A low ledge along the glass, a footrest and a sill to lean on, its edge lit.
  group.add(mesh(rbox(w - 0.1, 0.3, 0.3, 0.03, 2), fascia, cx, top + 0.15, z0 + 0.15));
  group.add(mesh(box(w - 0.2, 0.012, 0.012), lip, cx, top + 0.3, z0 + 0.305, false));

  // The rail round its open sides, broken at the ladder's head.
  const hw = LADDER.width / 2;
  const inset = 0.05;
  const plate = matte(DECK.hullSeam);
  rail(group, [new THREE.Vector3(x0 + inset, 0, z0 + 0.35), new THREE.Vector3(x0 + inset, 0, z1 - inset), new THREE.Vector3(LADDER.x - hw - 0.02, 0, z1 - inset)], steel, plate);
  rail(group, [new THREE.Vector3(LADDER.x + hw + 0.02, 0, z1 - inset), new THREE.Vector3(x1 - inset, 0, z1 - inset), new THREE.Vector3(x1 - inset, 0, z0 + 0.35)], steel, plate);

  // The ladder up its south face: two stringers on the deck, their tops standing on as grab posts over the balcony.
  const ladder = new THREE.Group();
  const lz = z1 + 0.08;
  const foot: Interactable = { kind: 'ladder', x: LADDER.x, y: 0, z: LADDER.foot, radius: 1.5 };
  const head: Interactable = { kind: 'ladder', x: LADDER.x, y: top, z: LADDER.top, radius: 1.3 };
  for (const s of [-1, 1]) {
    const x = LADDER.x + s * hw;
    ladder.add(mesh(box(0.05, top, 0.07), dark, x, top / 2, lz));
    ladder.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), dark, x, 0.01, lz, false));
  }
  for (let y = LADDER.rung; y < top - 0.05; y += LADDER.rung) {
    ladder.add(mesh(new THREE.CylinderGeometry(0.017, 0.017, LADDER.width - 0.04, 8).rotateZ(Math.PI / 2), steel, LADDER.x, y, lz, false));
  }
  // An unseen box over the ladder's face, so aiming between the rungs still finds it.
  const pick = new THREE.Mesh(box(LADDER.width + 0.1, top, 0.2), new THREE.MeshBasicMaterial({ visible: false }));
  pick.position.set(LADDER.x, top / 2, lz + 0.04);
  pick.userData.noMerge = true;
  ladder.add(pick);
  ladder.userData.interact = foot;
  group.add(ladder);
  // Its head: the grab posts curving back over onto the balcony, and the spring gate between them.
  const posts = new THREE.Group();
  for (const s of [-1, 1]) {
    const x = LADDER.x + s * hw;
    const pts = [new THREE.Vector3(x, top, lz), new THREE.Vector3(x, top + LADDER.posts * 0.8, lz), new THREE.Vector3(x, top + LADDER.posts, lz - 0.14), new THREE.Vector3(x, top + LADDER.posts * 0.8, lz - 0.3), new THREE.Vector3(x, top, lz - 0.34)];
    posts.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.024, 8, false), steel, 0, 0, 0, false));
  }
  const gate = new THREE.Group();
  gate.position.set(LADDER.x - hw + 0.04, top + GATE_Y, z1 - inset - 0.04);
  const bar = mesh(new THREE.CylinderGeometry(0.02, 0.02, LADDER.width - 0.1, 8).rotateZ(Math.PI / 2), steel, (LADDER.width - 0.1) / 2, 0, 0, false);
  gate.add(bar);
  const hinge = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 10), dark, 0, 0, 0, false);
  gate.add(hinge);
  posts.add(gate);
  const headPick = new THREE.Mesh(box(LADDER.width + 0.2, LADDER.posts + 0.2, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
  headPick.position.set(LADDER.x, top + (LADDER.posts + 0.2) / 2, lz - 0.17);
  headPick.userData.noMerge = true;
  posts.add(headPick);
  posts.userData.interact = head;
  group.add(posts);
  site.interactables.push(foot, head);

  // The lounge seats along the glass.
  for (const s of LOUNGE_SEATS) {
    const seat = loungeSeat();
    seat.position.set(s.x, s.y, s.z);
    seat.rotation.y = s.rotY;
    group.add(seat);
    seatable(seat, s.id, 1.6, site.interactables);
  }

  // None of it casts a shadow: the deck's merge (features/merge) then folds it into a bucket for each of
  // its few paints with no shadow draws (it sits behind the arc, under its own downlights), where its
  // shadows cost several draws at the conn for nothing anyone sees.
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = false;
  });
  site.group.add(group);
  let open = -1;
  const rig: LoungeRig = {
    gate(k: number) {
      if (k === open) return;
      open = k;
      gate.rotation.y = GATE_SWING * k;
    },
  };
  return { handle: { forwardLounge: rig }, colliders: loungeColliders() };
};
