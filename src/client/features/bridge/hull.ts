import * as THREE from 'three';
import { FLOOR, HULL_FRAMES, PROOF_CORNER, SOUTH_CURB, WALL_HEIGHT, WALL_T, WING } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { DECK, VIEWPORT_GLASS, box, hullPanels, matte, matteUnique, practical } from '../../world/office/materials';
import { mergeByMaterial, mesh } from '../../world/toon';
import { CANOPY, beam, canopyPoint, onBridgeLayer } from './shapes';

// The bridge's hull round the deck: a frame up each wall under every rib of the canopy, a ship-cyan
// cove along the foot of the walls, the canopy itself (a halo ring over the table, ribs out to the
// walls' tops and dark glass between them), the aft glass over the south curb, and outside, the ship
// the bridge is part of: a chamfered hull under the slab with its bow to the north and two nacelles aft.
// All of it is static and merged by material, a handful of draw calls.

/** The drive glow behind the nacelles, which space's speed sets (features/space). */
export interface Drive {
  /** How hard the drive is pushing: 0 (holding station) to 1 (cruise) and past it in a surge. */
  set(throttle: number): void;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The nacelles' drive glow (features/bridge/hull.ts). */
    drive: Drive;
  }
}

/** The glow's opacity at cruise. */
const GLOW = 0.3;

const frameMat = () => matte(DECK.hull, { metalness: 0.35, roughness: 0.55 });

/**
 * The frames up the north, east and west walls (at the corners too), each with a lit line down its
 * face. The three across the bow stand heavier, as its ribs, the glass running behind them.
 */
function wallFrames(into: THREE.Group) {
  const frame = frameMat();
  const lit = practical(DECK.shipDim);
  const inner = FLOOR.maxX - 0.24 / 2;
  const add = (x: number, z: number, alongX: boolean, face: number, heavy = false) => {
    const W = heavy ? 0.8 : 0.42;
    const D = heavy ? 0.6 : 0.24;
    into.add(mesh(alongX ? box(W, WALL_HEIGHT, D) : box(D, WALL_HEIGHT, W), frame, x, WALL_HEIGHT / 2, alongX ? z + face * (D - 0.24) / 2 : z, false));
    // The light line, a centimetre proud of the frame's face, from knee height to just under the eaves.
    const off = face * (heavy ? D - 0.12 + 0.006 : D / 2 + 0.006);
    const h = WALL_HEIGHT - 1.0;
    into.add(mesh(alongX ? box(0.025, h, 0.01) : box(0.01, h, 0.025), lit, alongX ? x : x + off, 0.5 + h / 2, alongX ? z + off : z, false));
  };
  for (const u of HULL_FRAMES) {
    add(u, -inner, true, 1, true);
    add(inner, u, false, -1);
    // On the west wall a frame steps aside for the attestation rail and its label.
    add(-inner, Math.abs(u - PROOF_CORNER.rail.z) < 0.9 ? PROOF_CORNER.rail.z - 0.9 : u, false, 1);
  }
  // The corners, either side of the north wall (the overflow bay's corner is open when it's built).
  add(-inner + 0.09, -inner, true, 1);
  add(-inner, inner - 0.2, false, 1);
  add(inner, inner - 0.2, false, -1);
  add(WING.minX - 0.42 / 2, -inner, true, 1);
  add(inner, -inner + 0.2, false, -1);
}

/** A ship-cyan line along the foot of the north, east and west walls, just over the baseboard. */
function coves(into: THREE.Group) {
  const lit = practical(DECK.shipDim);
  const y = 0.27;
  const t = 0.022;
  const at = FLOOR.maxX - 0.03;
  into.add(mesh(box(WING.minX - FLOOR.minX, t, 0.01), lit, (FLOOR.minX + WING.minX) / 2, y, -at, false));
  for (const s of [-1, 1]) into.add(mesh(box(0.01, t, FLOOR.maxZ - FLOOR.minZ), lit, s * at, y, 0, false));
}

/** The canopy: ribs from the halo ring out to the walls, two rings of purlins, the halo, and dark glass between. */
function canopy(): THREE.Group {
  const g = new THREE.Group();
  const frame = frameMat();
  const lit = practical(DECK.shipDim);
  const STEPS = 6;
  const n = CANOPY.ribs;
  const theta = (k: number) => (k / n) * Math.PI * 2;
  const p = (k: number, f: number) => canopyPoint(theta(k), f);
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < STEPS; i++) {
      const a = p(k, i / STEPS);
      const b = p(k, (i + 1) / STEPS);
      g.add(beam(a, b, 0.16, 0.26, frame));
      // A hairline along its underside.
      g.add(beam(a.clone().setY(a.y - 0.135), b.clone().setY(b.y - 0.135), 0.02, 0.012, lit));
    }
    for (const f of [0.4, 0.74]) g.add(beam(p(k, f), p(k + 1, f), 0.1, 0.16, frame));
  }
  // The halo ring over the table, and its lit underside.
  const halo = new THREE.Mesh(new THREE.TorusGeometry(CANOPY.halo, 0.12, 8, 64).rotateX(Math.PI / 2), frame);
  halo.position.y = CANOPY.top;
  g.add(halo);
  const haloLit = new THREE.Mesh(new THREE.TorusGeometry(CANOPY.halo, 0.022, 6, 96).rotateX(Math.PI / 2), lit);
  haloLit.position.y = CANOPY.top - 0.13;
  g.add(haloLit);
  const merged = mergeByMaterial(g);

  // The glass, one sheet between each pair of ribs, following the dome.
  const pos: number[] = [];
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < STEPS; i++) {
      const [a, b, c, d] = [p(k, i / STEPS), p(k + 1, i / STEPS), p(k + 1, (i + 1) / STEPS), p(k, (i + 1) / STEPS)];
      pos.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray());
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const glass = new THREE.Mesh(geo, VIEWPORT_GLASS);
  glass.renderOrder = 2;
  merged.add(glass);
  return onBridgeLayer(merged);
}

/** The eaves: a beam along the tops of the north, east and west walls, the canopy's ribs landing on it (the south one is the aft glass's). */
function eaves(into: THREE.Group) {
  const frame = frameMat();
  const y = CANOPY.eaves + 0.12;
  const at = FLOOR.maxX + WALL_T / 2;
  into.add(mesh(box(2 * at + 0.4, 0.34, 0.5), frame, 0, y, -at, false));
  for (const s of [-1, 1]) into.add(mesh(box(0.5, 0.34, 2 * at), frame, s * at, y, 0, false));
  // The cove: a ship-cyan line under the eaves' inner edge, where the walls meet the canopy.
  const cove = practical(DECK.ship);
  const cy = CANOPY.eaves - 0.08;
  const inner = at - 0.27;
  into.add(mesh(box(2 * inner, 0.035, 0.03), cove, 0, cy, -inner, false));
  for (const s of [-1, 1]) into.add(mesh(box(0.03, 0.035, 2 * inner), cove, s * inner, cy, 0, false));
}

/** The cove's wash: its light spilling down the top of each wall, fading out a metre and a half down. */
function coveWash(): THREE.Group {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.2)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  const mat = new THREE.MeshBasicMaterial({ color: DECK.ship, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const out = new THREE.Group();
  const H = 1.5;
  const at = FLOOR.maxX - 0.012;
  const y = CANOPY.eaves - 0.1 - H / 2;
  const north = new THREE.Mesh(new THREE.PlaneGeometry(WING.minX - FLOOR.minX, H), mat);
  north.position.set((FLOOR.minX + WING.minX) / 2, y, -at);
  out.add(north);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR.maxZ - FLOOR.minZ, H), mat);
    side.position.set(s * at, y, 0);
    side.rotation.y = -s * (Math.PI / 2);
    out.add(side);
  }
  out.traverse((o) => (o.renderOrder = 3));
  return out;
}

/**
 * The aft glass: full height over the south curb, a frame under each of the canopy's ribs and a
 * transom, so turning round you see the nacelles and the wake. Walk only: the Overview sees over the curb.
 */
function aftGlass(): THREE.Group {
  const g = new THREE.Group();
  const frame = frameMat();
  const lit = practical(DECK.shipDim);
  const z = FLOOR.maxZ + WALL_T / 2;
  const y0 = SOUTH_CURB;
  const h = CANOPY.eaves - y0;
  for (const x of [FLOOR.minX - 0.1, -11.3, ...HULL_FRAMES, 11.3, FLOOR.maxX + 0.1]) {
    const main = HULL_FRAMES.includes(x as (typeof HULL_FRAMES)[number]) || Math.abs(x) > 16;
    g.add(mesh(box(main ? 0.32 : 0.12, h, main ? 0.3 : 0.16), frame, x, y0 + h / 2, z, false));
    if (main) g.add(mesh(box(0.025, h - 0.6, 0.01), lit, x, y0 + h / 2, z - 0.156, false));
  }
  g.add(mesh(box(FLOOR.maxX - FLOOR.minX, 0.1, 0.16), frame, 0, 3.6, z, false));
  g.add(mesh(box(FLOOR.maxX - FLOOR.minX + 1, 0.34, 0.5), frame, 0, CANOPY.eaves + 0.12, z, false));
  const merged = mergeByMaterial(g);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR.maxX - FLOOR.minX, h), VIEWPORT_GLASS);
  pane.position.set(0, y0 + h / 2, z + 0.02);
  pane.renderOrder = 2;
  merged.add(pane);
  return onBridgeLayer(merged);
}

/** The hull's outline seen from above (x, z): the bow to the north, the flanks, the stern. */
export const OUTLINE: readonly [number, number][] = [
  [-16.7, -16.7],
  [-12, -24.5],
  [-5, -29.5],
  [5, -29.5],
  [12, -24.5],
  [16.7, -16.7],
  [20, -9],
  [20, 11],
  [16.7, 17.6],
  [10, 20.6],
  [-10, 20.6],
  [-16.7, 17.6],
  [-20, 11],
  [-20, -9],
];

/** A plume's fade: full at the nozzle (the cone's wide foot, v 0), nothing at its tip. */
function plumeFade(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 64, 0, 0);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.3, '#6a6a6a');
  grad.addColorStop(1, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

/** Under the slab: the ship. A chamfered hull plate with ribs across its flanks, a lit edge, and two nacelles aft. */
function outerHull(): { group: THREE.Group; drive: Drive } {
  const g = new THREE.Group();
  const plate = hullPanels(matteUnique(DECK.hullSeam, { flat: true, metalness: 0.3, roughness: 0.6 }));
  const dark = matte(DECK.wallReveal);
  const lit = practical(DECK.shipDim);
  const shape = new THREE.Shape(OUTLINE.map(([x, z]) => new THREE.Vector2(x, z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.9, bevelSegments: 1 }).rotateX(Math.PI / 2);
  geo.computeBoundingBox();
  const top = -0.33;
  const hull = new THREE.Mesh(geo, plate);
  hull.position.y = top - geo.boundingBox!.max.y;
  hull.receiveShadow = true;
  g.add(hull);
  // A keel under it, narrower, so the ship has depth from the Overview.
  const keel = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(OUTLINE.map(([x, z]) => new THREE.Vector2(x * 0.62, z * 0.78))), { depth: 1.4, bevelEnabled: false }).rotateX(Math.PI / 2), dark);
  keel.position.y = top - 1.9;
  g.add(keel);
  // Ribs across the flanks and the bow, on the column lines, and a lit edge round the top.
  for (let z = -8; z <= 8; z += 4) for (const s of [-1, 1]) g.add(mesh(box(3.2, 0.12, 0.28), plate, s * 18.2, top + 0.06, z, false));
  for (const x of [-8, -4, 0, 4, 8]) g.add(mesh(box(0.28, 0.12, 9 - Math.abs(x) * 0.55), plate, x, top + 0.06, -21 - (9 - Math.abs(x) * 0.55) / 2 + 4.3, false));
  for (let i = 0; i < OUTLINE.length; i++) {
    const [ax, az] = OUTLINE[i];
    const [bx, bz] = OUTLINE[(i + 1) % OUTLINE.length];
    g.add(beam(new THREE.Vector3(ax, top + 0.02, az), new THREE.Vector3(bx, top + 0.02, bz), 0.05, 0.04, lit));
  }
  // The nacelles, on pylons off the stern, each with its intake ring and its drive glow.
  for (const s of [-1, 1]) {
    const x = s * 13;
    const y = 0.5;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.55, 13, 16, 1).rotateX(Math.PI / 2), plate);
    body.position.set(x, y, 27);
    g.add(body);
    g.add(beam(new THREE.Vector3(s * 8, top - 0.4, 19), new THREE.Vector3(x, y - 0.4, 24), 0.5, 0.9, plate));
    const intake = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.12, 8, 32), lit);
    intake.position.set(x, y, 20.6);
    g.add(intake);
    const nozzle = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), practical(DECK.ship, 0.55));
    nozzle.position.set(x, y, 33.55);
    g.add(nozzle);
  }
  const merged = mergeByMaterial(g);
  merged.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = true;
  });
  // The drive glow behind each nozzle: additive, so it adds light to space rather than covering it.
  const glowMat = new THREE.MeshBasicMaterial({ color: DECK.ship, map: plumeFade(), transparent: true, opacity: GLOW, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, forceSinglePass: true });
  for (const s of [-1, 1]) {
    for (const [len, r] of [
      [7, 1.05],
      [12, 0.6],
    ] as const) {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.02, r, len, 20, 1, true).rotateX(Math.PI / 2), glowMat);
      cone.position.set(s * 13, 0.5, 33.6 + len / 2);
      merged.add(cone);
    }
  }
  // A hot core in each plume, white-cyan, and a ring of light round each nozzle's lip.
  const coreMat = glowMat.clone();
  coreMat.color.set('#DFF6FF');
  for (const s of [-1, 1]) {
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.5, 4.5, 16, 1, true).rotateX(Math.PI / 2), coreMat);
    core.position.set(s * 13, 0.5, 33.6 + 2.25);
    merged.add(core);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.06, 8, 40), practical(DECK.ship));
    lip.position.set(s * 13, 0.5, 33.6);
    merged.add(lip);
  }
  const drive: Drive = {
    set: (throttle) => {
      const k = Math.min(1.8, Math.max(0.3, throttle));
      glowMat.opacity = GLOW * k;
      coreMat.opacity = Math.min(1, 0.55 * k);
    },
  };
  return { group: merged, drive };
}

/** The hull round the deck and the ship outside it. */
export const hull: Fixture<'drive'> = (site) => {
  const inside = new THREE.Group();
  wallFrames(inside);
  coves(inside);
  eaves(inside);
  const outer = outerHull();
  const group = new THREE.Group();
  group.add(mergeByMaterial(inside), coveWash(), canopy(), aftGlass(), outer.group);
  site.group.add(group);
  return { handle: { drive: outer.drive } };
};
