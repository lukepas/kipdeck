import * as THREE from 'three';
import type { AttentionCounts } from '../../../shared/attention';
import { CONN, SEATING_BY_ID } from '../../../shared/layout';
import type { Collider } from '../../world/types';
import type { Fixture } from '../../world/office/fixture';
import { DECK, box, contactShadow, flat, matte, practical } from '../../world/office/materials';
import { seatable } from '../../world/office/seats';
import { mergeByMaterial, mesh } from '../../world/toon';
import { canvasTexture } from './shapes';
import { paintCountRows, paintCourse, type Course } from './readouts';

// The conn: the captain's dais north of the Deck lift, on the axis of the table and the Attention
// board. A low drum with a lit edge, a rail either side (open to the bow and to the lift), the
// captain's chair facing the bow, and an armrest panel either side of it: the counts on the left (the
// top bar's, glyph and number) and the course on the right (the heading and the waypoint).

export interface ConnView {
  /** The left panel: the top bar's counts. */
  setCounts(c: AttentionCounts): void;
  /** The right panel: the heading and the waypoint the ship is making for. */
  setCourse(c: Course): void;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The conn's armrest panels (features/bridge). */
    conn: ConnView;
  }
}

/** A rail along the arc from `from` to `from + arc` (radians from +x toward +z) at radius `r`, on the dais. */
function rail(into: THREE.Group, cols: Collider[], from: number, arc: number, r: number) {
  const metal = matte(DECK.hull, { metalness: 0.4, roughness: 0.5 });
  const lit = practical(DECK.shipDim);
  const y = CONN.h + CONN.rail;
  const ring = (radius: number, tube: number, at: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 40, arc).rotateX(Math.PI / 2).rotateY(-from), mat);
    m.position.set(CONN.x, at, CONN.z);
    into.add(m);
  };
  ring(r, 0.04, y, metal);
  ring(r, 0.012, y + 0.042, lit);
  ring(r, 0.022, CONN.h + 0.45, metal);
  for (let i = 0; i <= 3; i++) {
    const a = from + (arc * i) / 3;
    into.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, CONN.rail, 8), metal, CONN.x + Math.cos(a) * r, CONN.h + CONN.rail / 2, CONN.z + Math.sin(a) * r, false));
  }
  for (let i = 0; i <= 6; i++) {
    const a = from + (arc * i) / 6;
    const x = CONN.x + Math.cos(a) * r;
    const z = CONN.z + Math.sin(a) * r;
    cols.push({ minX: x - 0.16, maxX: x + 0.16, minZ: z - 0.16, maxZ: z + 0.16, top: y, fence: true });
  }
}

/** The captain's chair, built facing +z and turned to the bow: a pedestal, a seat, a back and arms. */
function captainsChair(): THREE.Group {
  const g = new THREE.Group();
  const shell = flat(DECK.console);
  const pad = flat(DECK.consoleTop);
  const metal = matte(DECK.steel, { metalness: 0.4, roughness: 0.5 });
  g.add(mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.05, 20), metal, 0, 0.025, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.36, 10), metal, 0, 0.23, 0));
  g.add(mesh(box(0.62, 0.1, 0.56), shell, 0, 0.45, 0));
  g.add(mesh(box(0.56, 0.05, 0.5), pad, 0, 0.52, 0.01));
  // A low back, so the chair never stands between the lift and the table.
  const back = mesh(box(0.6, 0.36, 0.1), shell, 0, 0.7, -0.27);
  back.rotation.x = -0.12;
  g.add(back);
  g.add(mesh(box(0.012, 0.28, 0.012), practical(DECK.shipDim), 0, 0.7, -0.215, false));
  for (const s of [-1, 1]) g.add(mesh(box(0.08, 0.06, 0.48), shell, s * 0.34, 0.66, 0.02));
  return g;
}

/** An armrest panel at (x, z) on the dais, its face tilted up toward the chair and turned `yaw` in toward it. */
function panel(x: number, z: number, yaw: number) {
  const { canvas, g, texture } = canvasTexture(512, 320);
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.add(mesh(box(0.12, 0.62, 0.12), flat(DECK.console), 0, CONN.h + 0.31, 0));
  const head = new THREE.Group();
  head.position.set(0, CONN.h + 0.7, 0);
  head.rotation.set(-0.95, yaw, 0, 'YXZ');
  head.add(mesh(box(0.5, 0.33, 0.04), flat(DECK.console), 0, 0, -0.025));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.29), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  head.add(face);
  group.add(head);
  return { group, canvas, g, texture };
}

/** The conn: the dais, its rails, the captain's chair and the two armrest panels. */
export const conn: Fixture<'conn'> = (site) => {
  const group = new THREE.Group();
  const cols: Collider[] = [];
  const statics = new THREE.Group();
  // The drum, a step's height, and the lit ring round its top edge.
  statics.add(mesh(new THREE.CylinderGeometry(CONN.r, CONN.r + 0.06, CONN.h, 48), flat(DECK.console), CONN.x, CONN.h / 2, CONN.z));
  statics.add(mesh(new THREE.CylinderGeometry(CONN.r - 0.12, CONN.r - 0.12, 0.012, 48), flat(DECK.consoleTop), CONN.x, CONN.h + 0.006, CONN.z, false));
  const edge = new THREE.Mesh(new THREE.TorusGeometry(CONN.r - 0.03, 0.014, 6, 96).rotateX(Math.PI / 2), practical(DECK.shipDim));
  edge.position.set(CONN.x, CONN.h + 0.004, CONN.z);
  statics.add(edge);
  // The rails: east and west, open toward the bow and toward the lift.
  const arc = 1.7;
  rail(statics, cols, -arc / 2, arc, CONN.r - 0.14);
  rail(statics, cols, Math.PI - arc / 2, arc, CONN.r - 0.14);
  group.add(mergeByMaterial(statics));
  group.add(contactShadow(CONN.r * 2.6, CONN.r * 2.6, CONN.x, CONN.z));
  // The drum underfoot: a few boxes round the circle, a step up from the floor.
  const r = CONN.r;
  const s = r * 0.71;
  for (const [hx, hz] of [
    [s, s],
    [r, r * 0.38],
    [r * 0.38, r],
  ]) {
    cols.push({ minX: CONN.x - hx, maxX: CONN.x + hx, minZ: CONN.z - hz, maxZ: CONN.z + hz, top: CONN.h });
  }

  const seat = SEATING_BY_ID.get('conn')!;
  const chair = captainsChair();
  chair.position.set(seat.x, seat.y, seat.z);
  chair.rotation.y = seat.rotY;
  group.add(chair);
  cols.push({ minX: seat.x - 0.34, maxX: seat.x + 0.34, minZ: seat.z - 0.34, maxZ: seat.z + 0.34, top: seat.y + 0.52 });
  seatable(chair, 'conn', 1.5, site.interactables);

  // The panels either side of the chair, ahead of it, turned in toward whoever sits there: far enough
  // forward that from the arrival view they sit clear of the hint bar along the bottom of the screen.
  const left = panel(seat.x - 0.7, seat.z - 0.62, 0.38);
  const right = panel(seat.x + 0.7, seat.z - 0.62, -0.38);
  group.add(left.group, right.group);
  for (const p of [left, right]) {
    const { x, z } = p.group.position;
    cols.push({ minX: x - 0.1, maxX: x + 0.1, minZ: z - 0.1, maxZ: z + 0.1, top: CONN.h + 0.9, fence: true });
  }

  site.group.add(group);
  let countsKey = '';
  let courseKey = '';
  const setCounts = (c: AttentionCounts) => {
    const key = JSON.stringify(c);
    if (key === countsKey) return;
    countsKey = key;
    paintCountRows(left.g, left.canvas.width, left.canvas.height, c);
    left.texture.needsUpdate = true;
  };
  const setCourse = (c: Course) => {
    const key = JSON.stringify(c);
    if (key === courseKey) return;
    courseKey = key;
    paintCourse(right.g, right.canvas.width, right.canvas.height, c);
    right.texture.needsUpdate = true;
  };
  setCounts({ 'needs-you': 0, stuck: 0, review: 0, working: 0, parked: 0 });
  setCourse({ statement: '', milestones: [] });
  return { colliders: cols, handle: { conn: { setCounts, setCourse } } };
};
