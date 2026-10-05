import * as THREE from 'three';
import { FLOOR, WALL_HEIGHT, WINDOWS, WING } from '../../../shared/layout';
import type { Fixture } from './fixture';
import { DECK, matte } from './materials';

// The working detail of a ship's hull, inside: cable trays and two conduits along the foot of the east,
// west and north walls under the ports' sills, a clamp on them every so often, a conduit round the
// tops of the east, west and north walls under the canopy's eaves, and a strut rib with lightening holes on each pier
// between the side ports. Each kind is one instanced draw (four in all), casts no shadow, and takes the
// trim atlas like the rest of the steel. Nothing here stands in anyone's way: it all hugs the walls.

/** How far off a wall's inside face the runs stand (m), and their heights. */
const RUN = { off: 0.12, tray: { y: 0.16, h: 0.14, d: 0.18 }, pipes: [0.42, 0.53], pipeR: 0.035, top: WALL_HEIGHT - 0.35, topR: 0.06 } as const;
/** A clamp over the conduits every this far (m). */
const CLAMP_EVERY = 1.6;
/** The ribs: how wide, how deep, and from and to what height. */
const RIB = { w: 0.34, d: 0.07, y0: 0.62, y1: 3.55, holes: 4 } as const;

/** One straight run along a wall's inside face: from `a` to `b` along it, at `inward` toward the room. */
interface Run {
  /** The wall's axis: runs along x (north) or along z (east, west). */
  alongX: boolean;
  /** Where the face is, on the other axis, and which way the room is from it (+1 or -1). */
  at: number;
  inward: 1 | -1;
  a: number;
  b: number;
}

/** The runs at the foot of the walls: the north wall up to the overflow bay, and the east and west walls end to end. */
function footRuns(): Run[] {
  return [
    { alongX: true, at: FLOOR.minZ, inward: 1, a: FLOOR.minX + 0.4, b: WING.minX - 0.3 },
    { alongX: false, at: FLOOR.minX, inward: 1, a: FLOOR.minZ + 0.4, b: FLOOR.maxZ - 0.5 },
    { alongX: false, at: FLOOR.maxX, inward: -1, a: FLOOR.minZ + 0.4, b: FLOOR.maxZ - 0.5 },
  ];
}

/** The piers between the side ports: where each wall's ports leave a stretch of wall, its middle. */
function piers(): { side: 'east' | 'west'; z: number }[] {
  const out: { side: 'east' | 'west'; z: number }[] = [];
  for (const side of ['east', 'west'] as const) {
    const ports = WINDOWS.filter((w) => w.wall === side && w.y0 < 1).sort((p, q) => p.u - q.u);
    for (let i = 1; i < ports.length; i++) {
      const from = ports[i - 1].u + ports[i - 1].width / 2;
      const to = ports[i].u - ports[i].width / 2;
      if (to - from > RIB.w + 0.4) out.push({ side, z: (from + to) / 2 });
    }
  }
  return out;
}

/** A rib plate with its lightening holes, standing on y = 0, its face toward +x. */
function ribGeometry(): THREE.BufferGeometry {
  const h = RIB.y1 - RIB.y0;
  const shape = new THREE.Shape();
  shape.moveTo(-RIB.w / 2, 0);
  shape.lineTo(RIB.w / 2, 0);
  shape.lineTo(RIB.w / 2 - 0.05, h);
  shape.lineTo(-RIB.w / 2 + 0.05, h);
  shape.closePath();
  const step = h / (RIB.holes + 1);
  for (let i = 1; i <= RIB.holes; i++) {
    const hole = new THREE.Path();
    hole.absellipse(0, i * step, RIB.w * 0.26, step * 0.32, 0, Math.PI * 2, false, 0);
    shape.holes.push(hole);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: RIB.d, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 10 });
  // Its face toward +x: the plate's width runs along z, its depth into the wall.
  g.rotateY(Math.PI / 2);
  return g;
}

export const greebles: Fixture = (site) => {
  const group = new THREE.Group();
  group.name = 'greebles';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);

  /** Places a unit box or a unit cylinder (along x) `len` long along `run` at its middle, `h` by `d`, `y` up and `off` out. */
  const along = (run: Run, mid: number, len: number, y: number, off: number, h: number, d: number) => {
    const across = run.at + run.inward * off;
    if (run.alongX) {
      p.set(mid, y, across);
      q.identity();
    } else {
      p.set(across, y, mid);
      q.setFromAxisAngle(yAxis, Math.PI / 2);
    }
    s.set(len, h, d);
    return m.compose(p, q, s).clone();
  };

  const runs = footRuns();
  const trays: THREE.Matrix4[] = [];
  const pipes: THREE.Matrix4[] = [];
  const clamps: THREE.Matrix4[] = [];
  for (const run of runs) {
    const len = run.b - run.a;
    const mid = (run.a + run.b) / 2;
    trays.push(along(run, mid, len, RUN.tray.y, RUN.off, RUN.tray.h, RUN.tray.d));
    for (const y of RUN.pipes) pipes.push(along(run, mid, len, y, RUN.off + 0.02, RUN.pipeR * 2, RUN.pipeR * 2));
    for (let u = run.a + 0.6; u < run.b - 0.3; u += CLAMP_EVERY) clamps.push(along(run, u, 0.07, (RUN.pipes[0] + RUN.pipes[1]) / 2, RUN.off + 0.02, 0.2, 0.1));
  }
  // The conduit round the tops of the walls (the south is a curb), under the canopy's eaves.
  const top: Run[] = [
    { alongX: true, at: FLOOR.minZ, inward: 1, a: FLOOR.minX, b: FLOOR.maxX },
    { alongX: false, at: FLOOR.minX, inward: 1, a: FLOOR.minZ, b: FLOOR.maxZ },
    { alongX: false, at: FLOOR.maxX, inward: -1, a: FLOOR.minZ, b: FLOOR.maxZ },
  ];
  for (const run of top) pipes.push(along(run, (run.a + run.b) / 2, run.b - run.a, RUN.top, 0.2, RUN.topR * 2, RUN.topR * 2));

  const ribs: THREE.Matrix4[] = [];
  for (const pier of piers()) {
    const west = pier.side === 'west';
    p.set(west ? FLOOR.minX + 0.005 : FLOOR.maxX - 0.005, RIB.y0, pier.z);
    q.setFromAxisAngle(yAxis, west ? 0 : Math.PI);
    ribs.push(m.compose(p, q, s.set(1, 1, 1)).clone());
  }

  const steel = matte(DECK.steel);
  const dark = matte(DECK.wallReveal);
  const kinds: [THREE.BufferGeometry, THREE.Material, THREE.Matrix4[]][] = [
    [new THREE.BoxGeometry(1, 1, 1), dark, trays],
    [new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1).rotateZ(Math.PI / 2), steel, pipes],
    [new THREE.BoxGeometry(1, 1, 1), matte(DECK.steelLight), clamps],
    [ribGeometry(), steel, ribs],
  ];
  for (const [geo, mat, list] of kinds) {
    if (!list.length) continue;
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((mm, i) => inst.setMatrixAt(i, mm));
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = false;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    group.add(inst);
  }
  site.group.add(group);
  return {};
};
