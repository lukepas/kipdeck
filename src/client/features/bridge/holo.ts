import * as THREE from 'three';
import { MISSION_TABLE } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { DECK } from '../../world/office/materials';
import type { Course } from './readouts';
import { starMap } from './holo-map';
import { COLUMN, columnRing, routePoint, unitSlot } from './holo-route';

// The holo over the mission table: the route as a column of light. Stacked scan rings rise from the
// table, narrowing as they go, with a band of brighter light climbing them; the course winds up round
// the column, a node on it for each waypoint (solid once passed, ringed for the one the ship is making
// for, hollow for the ones after) with its name on a dark plate beside it; the ship's chevron on the
// course between the last waypoint passed and the next, and a small marker for each unit at the
// waypoint its issue belongs to. Over it all floats the star map (holo-map.ts). It is light, not
// furniture: additive ship-cyan writing no depth, kept well under the bloom (only the needs-you and
// stuck signals bloom), and nothing collides with it. The caption is the plate at the table's lip
// (features/life/heading.ts).

export interface Holo {
  /** Plots `course`: a waypoint per milestone, the chevron between the last one passed and the next, its units at their waypoints. */
  setCourse(course: Course): void;
  /** Turns the plot slowly round the table (0.5 turns a minute); the bridge's tick calls it unless motion is reduced. */
  turn(dt: number): void;
  /** Runs the scan up the rings and the dashes along the course, `dt` seconds at `k` times their pace (features/life). */
  flow(dt: number, k: number): void;
  /** The wall boards' rectangles on screen (NDC x0, y0, x1, y1), which the star map keeps out of (features/boardfaces). */
  readonly boards: THREE.Vector4[];
  /** The waypoints' name plates, which stand down while they'd cover a board (holo-labels.ts). */
  plates(): readonly THREE.Sprite[];
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The holo route column over the mission table (features/bridge). */
    holo: Holo;
  }
}

const TURN = (0.5 * Math.PI * 2) / 60;
/** The most units the markers draw. */
const UNITS = 24;

/** Additive ship-cyan, `opacity` of full strength: light added over whatever is behind it. */
function light(opacity: number, color: THREE.ColorRepresentation = DECK.ship): THREE.MeshBasicMaterial {
  return holoMark(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
}

/** Marks a material as the holo's light, for the screen character laid into it (features/cinema). */
export function holoMark<M extends THREE.Material>(m: M): M {
  m.userData.holo = true;
  return m;
}

/** A waypoint's name on a dark plate, as a sprite beside its node: "2  SESSION STORE". */
function plate(n: number, title: string, state: 'done' | 'active' | 'ahead'): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(8,13,19,0.9)';
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = state === 'active' ? DECK.ship : DECK.shipDim;
  g.fillRect(0, 0, 8, 96);
  g.textBaseline = 'middle';
  g.font = '700 40px "JetBrains Mono", ui-monospace, monospace';
  g.fillStyle = state === 'active' ? DECK.ship : '#7FA7B6';
  g.fillText(String(n), 26, 50);
  g.font = '700 40px Archivo, system-ui, sans-serif';
  g.fillStyle = state === 'ahead' ? '#9AA6B2' : DECK.text;
  let t = title.toUpperCase();
  while (t.length > 3 && g.measureText(t).width > 420) t = `${t.slice(0, -2).trimEnd()}.`;
  g.fillText(t, 74, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
  s.scale.set(0.95, 0.18, 1);
  s.center.set(0, 0.5);
  s.renderOrder = 4;
  return s;
}

export const holo: Fixture<'holo'> = (site) => {
  const top = MISSION_TABLE.h;
  const root = new THREE.Group();
  root.position.set(MISSION_TABLE.x, top, MISSION_TABLE.z);
  const plot = new THREE.Group();
  root.add(plot);

  // The emitter ring on the tabletop the column stands on.
  const emitter = new THREE.Mesh(new THREE.RingGeometry(COLUMN.r0 + 0.08, COLUMN.r0 + 0.14, 96).rotateX(-Math.PI / 2), light(0.32));
  emitter.position.y = 0.012;
  root.add(emitter);

  // The scan rings, one draw: each a thin hoop, its brightness set as the scan climbs.
  const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.006, 4, 72).rotateX(Math.PI / 2), light(1), COLUMN.rings);
  rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(COLUMN.rings * 3), 3);
  rings.frustumCulled = false;
  const m = new THREE.Matrix4();
  for (let i = 0; i < COLUMN.rings; i++) {
    const r = columnRing(i);
    m.makeScale(r.radius, 1, r.radius).setPosition(0, r.y, 0);
    rings.setMatrixAt(i, m);
  }
  root.add(rings);

  // The star map over it all, in its cone of light from the emitter.
  const map = starMap(COLUMN.r0 + 0.1);
  plot.add(map.group);

  // The course: winding up round the column from its foot to its top, through every waypoint.
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, i) => {
    const p = routePoint(i / 12);
    return new THREE.Vector3(p.x, p.y, p.z);
  }));
  plot.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.01, 5), light(0.32)));
  plot.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.04, 6), light(0.06)));

  const marks = new THREE.Group();
  plot.add(marks);
  const solid = light(0.4);
  const hollow = holoMark(new THREE.LineBasicMaterial({ color: DECK.ship, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const octa = new THREE.OctahedronGeometry(0.075, 0);
  const edges = new THREE.EdgesGeometry(octa);
  const ringGeo = new THREE.TorusGeometry(0.15, 0.008, 4, 40);
  // The ship: a flat chevron, the Formation mark's shape, lying along the course.
  const chevShape = new THREE.Shape([new THREE.Vector2(0, 0.14), new THREE.Vector2(0.1, -0.06), new THREE.Vector2(0, -0.01), new THREE.Vector2(-0.1, -0.06)]);
  const chevron = new THREE.Mesh(new THREE.ShapeGeometry(chevShape).rotateX(-Math.PI / 2), light(0.42, '#DDEFF5'));
  (chevron.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
  (chevron.material as THREE.MeshBasicMaterial).forceSinglePass = true;
  plot.add(chevron);
  // The units, a small chevron each at their waypoint: one draw.
  const unitShape = new THREE.Shape([new THREE.Vector2(0, 0.06), new THREE.Vector2(0.045, -0.03), new THREE.Vector2(0, -0.005), new THREE.Vector2(-0.045, -0.03)]);
  const units = new THREE.InstancedMesh(new THREE.ShapeGeometry(unitShape), light(0.55, '#BFE6F2'), UNITS);
  (units.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
  units.count = 0;
  units.frustumCulled = false;
  plot.add(units);

  // Dashes of light running along the course from its foot to the ship: the course being made good.
  const DASHES = 9;
  const dashes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.02, 6, 4), light(0.45, '#DDEFF5'), DASHES);
  dashes.frustumCulled = false;
  plot.add(dashes);
  let shipAt = 0.04;
  let flowT = 0;
  let scanT = 0;
  const dash = new THREE.Object3D();
  const c = new THREE.Color();

  const at = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const setCourse = (course: Course) => {
    for (const o of marks.children) if (o instanceof THREE.Sprite) (o.material.map?.dispose(), o.material.dispose());
    marks.clear();
    const ms = course.milestones;
    const n = ms.length;
    let placed = 0;
    ms.forEach((ms1, i) => {
      const u = (i + 1) / (n + 0.4);
      curve.getPointAt(u, at);
      const mark = ms1.done ? new THREE.Mesh(octa, solid) : new THREE.LineSegments(edges, hollow);
      mark.position.copy(at);
      marks.add(mark);
      if (ms1.active) {
        const ring = new THREE.Mesh(ringGeo, solid);
        ring.position.copy(at);
        ring.rotation.x = Math.PI / 2;
        marks.add(ring);
      }
      // Its name on a plate, out from the column beside it.
      const p = plate(i + 1, ms1.title, ms1.done ? 'done' : ms1.active ? 'active' : 'ahead');
      p.position.copy(at).multiply(new THREE.Vector3(1.12, 1, 1.12));
      marks.add(p);
      // The units on it, round the node.
      for (let k = 0; k < (ms1.units ?? 0) && placed < UNITS; k++) {
        const s = unitSlot(at, k);
        dash.position.set(s.x, s.y, s.z);
        dash.rotation.set(0, s.yaw, 0);
        dash.scale.setScalar(1);
        dash.updateMatrix();
        units.setMatrixAt(placed++, dash.matrix);
      }
    });
    units.count = placed;
    units.instanceMatrix.needsUpdate = true;
    // Between the last waypoint passed and the next (at the foot with none passed, or no course).
    const done = ms.filter((x) => x.done).length;
    const t = n ? Math.min(0.98, (done + 0.5) / (n + 0.4)) : 0.04;
    shipAt = t;
    curve.getPointAt(t, at);
    curve.getPointAt(Math.min(1, t + 0.02), ahead);
    chevron.position.copy(at).setY(at.y + 0.03);
    map.ship(chevron.position);
    chevron.rotation.y = Math.atan2(ahead.x - at.x, ahead.z - at.z) + Math.PI;
    for (const o of marks.children) o.renderOrder = o instanceof THREE.Sprite ? 4 : 3;
  };
  setCourse({ statement: '', milestones: [] });
  root.traverse((o) => {
    if (!(o instanceof THREE.Sprite)) o.renderOrder = 3;
    o.castShadow = false;
    o.receiveShadow = false;
  });
  site.group.add(root);
  const turn = (dt: number) => {
    plot.rotation.y += TURN * dt;
  };
  const flow = (dt: number, k: number) => {
    // One lap of the course to the ship every 5 s; each dash a ninth behind the one before.
    flowT = (flowT + (dt * k) / 5) % 1;
    // The scan: a band of brighter light climbing the rings every 3 s (held where it is with motion off).
    scanT = (scanT + (dt * k) / 3) % 1;
    for (let i = 0; i < COLUMN.rings; i++) {
      const d = Math.abs(i / (COLUMN.rings - 1) - scanT);
      const lit = Math.exp(-d * d * 40);
      c.set(DECK.ship).multiplyScalar(COLUMN.base + COLUMN.scan * lit);
      rings.setColorAt(i, c);
    }
    rings.instanceColor!.needsUpdate = true;
    map.step(dt, k);
    for (let i = 0; i < DASHES; i++) {
      const u = (flowT + i / DASHES) % 1;
      curve.getPointAt(u * shipAt, at);
      dash.position.copy(at);
      dash.rotation.set(0, 0, 0);
      // Small as they leave the foot, full size on their way, shrinking into the ship.
      dash.scale.setScalar(Math.sin(u * Math.PI) * 0.8 + 0.2);
      dash.updateMatrix();
      dashes.setMatrixAt(i, dash.matrix);
    }
    dashes.instanceMatrix.needsUpdate = true;
  };
  flow(0, 0);
  const plates = () => marks.children.filter((o): o is THREE.Sprite => o instanceof THREE.Sprite);
  return { handle: { holo: { setCourse, turn, flow, boards: map.boards, plates } } };
};
