import * as THREE from 'three';
import { MISSION_TABLE } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { DECK } from '../../world/office/materials';
import type { Course } from './readouts';

// The holo course plot over the mission table: in a band under half a meter over its top, a curved
// course line rising gently from the stern side of the table toward the bow, a waypoint on it for
// each milestone (solid once passed, ringed for the one the ship is making for, hollow for the ones
// after), and the ship's chevron on the line between the last waypoint passed and the next. It is light,
// not furniture: additive ship-cyan at a third of full strength at most, writing no depth, so it never
// hides the table's top or a unit behind it, and nothing collides with it.

export interface Holo {
  /** Plots `course`: a waypoint per milestone, the chevron between the last one passed and the next. */
  setCourse(course: Course): void;
  /** Turns the plot slowly round the table (0.5 turns a minute); the bridge's tick calls it unless motion is reduced. */
  turn(dt: number): void;
  /** Runs the dashes along the course toward the ship, `dt` seconds at `k` times their pace (features/life). */
  flow(dt: number, k: number): void;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The holo course plot over the mission table (features/bridge). */
    holo: Holo;
  }
}

/** How high over the table's top the plot's band starts and ends, and how far out it reaches. */
const BAND = { from: 0.1, to: 0.45, reach: MISSION_TABLE.r * 0.72 } as const;
const TURN = (0.5 * Math.PI * 2) / 60;

/** Additive ship-cyan, `opacity` of full strength: light added over whatever is behind it. */
function light(opacity: number, color: THREE.ColorRepresentation = DECK.ship): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
}

/** A soft vertical fade, bright at the foot: the plot's volume of light over the table. */
function fadeUp(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 64, 0, 0);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, '#555555');
  grad.addColorStop(1, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

export const holo: Fixture<'holo'> = (site) => {
  const top = MISSION_TABLE.h;
  const root = new THREE.Group();
  root.position.set(MISSION_TABLE.x, top, MISSION_TABLE.z);
  const plot = new THREE.Group();
  root.add(plot);

  // The volume: a faint skin of light round the band, fading upward.
  const skin = new THREE.Mesh(new THREE.CylinderGeometry(BAND.reach + 0.25, BAND.reach + 0.25, BAND.to + 0.05, 64, 1, true), light(0.1));
  (skin.material as THREE.MeshBasicMaterial).map = fadeUp();
  (skin.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
  skin.position.y = (BAND.to + 0.05) / 2;
  root.add(skin);
  // The emitter ring on the tabletop that throws it.
  const emitter = new THREE.Mesh(new THREE.RingGeometry(BAND.reach + 0.2, BAND.reach + 0.27, 96).rotateX(-Math.PI / 2), light(0.3));
  emitter.position.y = 0.012;
  root.add(emitter);

  // The course: a gentle S from the stern side of the table to the bow side, rising as it goes.
  const R = BAND.reach;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.15 * R, BAND.from, 0.92 * R),
    new THREE.Vector3(-0.62 * R, BAND.from + 0.08, 0.35 * R),
    new THREE.Vector3(0.05 * R, BAND.from + 0.17, -0.05 * R),
    new THREE.Vector3(0.6 * R, BAND.from + 0.26, -0.45 * R),
    new THREE.Vector3(0.1 * R, BAND.to, -0.92 * R),
  ]);
  plot.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.012, 5), light(0.35)));
  plot.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.045, 6), light(0.08)));
  // A dropline from each end to the table, so the plot stands on something.
  for (const t of [0, 1]) {
    const p = curve.getPointAt(t);
    const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, p.y, 4), light(0.25));
    drop.position.set(p.x, p.y / 2, p.z);
    plot.add(drop);
  }

  const marks = new THREE.Group();
  plot.add(marks);
  const solid = light(0.35);
  const hollow = new THREE.LineBasicMaterial({ color: DECK.ship, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const octa = new THREE.OctahedronGeometry(0.075, 0);
  const edges = new THREE.EdgesGeometry(octa);
  const ringGeo = new THREE.TorusGeometry(0.15, 0.008, 4, 40);
  // The ship: a flat chevron, the Formation mark's shape, lying along the line.
  const chevShape = new THREE.Shape([new THREE.Vector2(0, 0.14), new THREE.Vector2(0.1, -0.06), new THREE.Vector2(0, -0.01), new THREE.Vector2(-0.1, -0.06)]);
  const chevron = new THREE.Mesh(new THREE.ShapeGeometry(chevShape).rotateX(-Math.PI / 2), light(0.35, '#DDEFF5'));
  (chevron.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
  plot.add(chevron);

  // Dashes of light running along the course from the start to the ship: the course being made good.
  const DASHES = 9;
  const dashes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 6, 4), light(0.5, '#DDEFF5'), DASHES);
  dashes.frustumCulled = false;
  plot.add(dashes);
  let shipAt = 0.04;
  let flowT = 0;
  const dash = new THREE.Object3D();

  const at = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const setCourse = (course: Course) => {
    marks.clear();
    const ms = course.milestones;
    const n = ms.length;
    ms.forEach((m, i) => {
      curve.getPointAt((i + 1) / (n + 0.4), at);
      const mark = m.done ? new THREE.Mesh(octa, solid) : new THREE.LineSegments(edges, hollow);
      mark.position.copy(at);
      mark.renderOrder = 3;
      marks.add(mark);
      if (m.active) {
        const ring = new THREE.Mesh(ringGeo, solid);
        ring.position.copy(at);
        ring.rotation.x = Math.PI / 2;
        ring.renderOrder = 3;
        marks.add(ring);
      }
    });
    // Between the last waypoint passed and the next (at the start with none passed, or no course).
    const done = ms.filter((m) => m.done).length;
    const t = n ? Math.min(0.98, (done + 0.5) / (n + 0.4)) : 0.04;
    shipAt = t;
    curve.getPointAt(t, at);
    curve.getPointAt(Math.min(1, t + 0.02), ahead);
    chevron.position.copy(at).setY(at.y + 0.03);
    chevron.rotation.y = Math.atan2(ahead.x - at.x, ahead.z - at.z) + Math.PI;
  };
  setCourse({ statement: '', milestones: [] });
  root.traverse((o) => {
    o.renderOrder = 3;
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
    for (let i = 0; i < DASHES; i++) {
      const u = (flowT + i / DASHES) % 1;
      curve.getPointAt(u * shipAt, at);
      dash.position.copy(at);
      // Small as they leave the start, full size on their way, shrinking into the ship.
      dash.scale.setScalar(Math.sin(u * Math.PI) * 0.8 + 0.2);
      dash.updateMatrix();
      dashes.setMatrixAt(i, dash.matrix);
    }
    dashes.instanceMatrix.needsUpdate = true;
  };
  flow(0, 0);
  return { handle: { holo: { setCourse, turn, flow } } };
};
