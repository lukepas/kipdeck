import * as THREE from 'three';
import type { AttentionCounts } from '../../../shared/attention';
import { AISLE, GALLERY } from '../../../shared/amphitheater';
import { CONN, SEATING_BY_ID } from '../../../shared/layout';
import type { Collider } from '../../world/types';
import type { Fixture } from '../../world/office/fixture';
import { DECK, box, flat, matte, practical, rbox } from '../../world/office/materials';
import { seatable } from '../../world/office/seats';
import { mergeByMaterial, mesh } from '../../world/toon';
import { BRASS, rail } from '../amphitheater/tiers';
import { canvasTexture } from './shapes';
import { paintCountStrip, paintCourseStrip, type Course } from './readouts';

// The conn: the captain's dais at the back of the amphitheatre (shared/amphitheater.ts DAIS), on the
// axis of the table and the Attention board. A raised drum with a lit gold lip, a brass rail round its
// back but where the aisle comes up from the pit and the galleries come up from the back tier, and the
// captain's chair, the room's hero: a shoulder-high back with a headrest, gold piping, a cyan rim, a gold underlight on the deck plate
// under it, and the counts (left) and the course (right) on slim strips along its armrests.

export interface ConnView {
  /** The left armrest strip: the top bar's counts. */
  setCounts(c: AttentionCounts): void;
  /** The right armrest strip: the waypoint the ship is making for. */
  setCourse(c: Course): void;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The conn's armrest strips (features/bridge). */
    conn: ConnView;
  }
}

/** The conn's own warm accent (its lip, the chair's piping and underlight): command, never a state. */
export const CONN_GOLD = '#D9C46D';

/** The short way round from `lo` to `hi` (radians), as a [start, span] pair with the span not negative. */
function arcOf(a: number, b: number): [number, number] {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return d >= 0 ? [a, d] : [b, -d];
}

/** Arcs round the dais (start and span, radians from +x toward +z) its rail leaves open: the aisle to the north and the galleries either side. */
function openings(): [number, number][] {
  // The aisle: where the dais's edge is within the aisle's half-width (and a little) of its axis.
  const aisle = Math.asin(Math.min(1, (AISLE.half + 0.15) / CONN.r));
  const open: [number, number][] = [[-Math.PI / 2 - aisle, 2 * aisle]];
  // Each gallery: where its band (r0 to r1 round the table) crosses the dais's edge.
  for (const side of [1, -1]) {
    const cross = (R: number) => {
      const z = (R * R - CONN.r * CONN.r + CONN.z * CONN.z) / (2 * CONN.z);
      const x = side * Math.sqrt(Math.max(0, R * R - z * z));
      return Math.atan2(z - CONN.z, x - CONN.x);
    };
    open.push(arcOf(cross(GALLERY.r0 - 0.1), cross(GALLERY.r1 + 0.1)));
  }
  return open;
}

/** Whether angle `a` round the dais is in one of its rail's openings. */
function isOpen(a: number, open: [number, number][]): boolean {
  return open.some(([from, span]) => {
    const x = Math.atan2(Math.sin(a - from), Math.cos(a - from));
    return x >= 0 && x <= span;
  });
}

/** The drum, its gold lip and band, the deck plate on top, and the rail round it but at its openings. */
function dais(statics: THREE.Group, cols: Collider[]) {
  const shell = flat(DECK.console);
  const gold = practical(CONN_GOLD);
  const brass = matte(BRASS, { metalness: 0.75, roughness: 0.32, trim: false });
  const H = CONN.h;
  statics.add(mesh(new THREE.CylinderGeometry(CONN.r, CONN.r + 0.08, H, 64), shell, CONN.x, H / 2, CONN.z));
  // Ribs down its face, like the hull's frames, every 30 degrees.
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const rib = mesh(box(0.1, H - 0.1, 0.08), matte(DECK.hullSeam), CONN.x + Math.cos(a) * (CONN.r + 0.06), (H - 0.1) / 2, CONN.z + Math.sin(a) * (CONN.r + 0.06), false);
    rib.rotation.y = -a + Math.PI / 2;
    statics.add(rib);
  }
  // A ship-cyan band round it at a seated eye's height from the pit, and the gold lip round its top.
  const band = new THREE.Mesh(new THREE.TorusGeometry(CONN.r + 0.09, 0.012, 4, 96).rotateX(Math.PI / 2), practical(DECK.shipDim));
  band.position.set(CONN.x, H * 0.55, CONN.z);
  statics.add(band);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(CONN.r + 0.01, 0.02, 6, 128).rotateX(Math.PI / 2), gold);
  lip.position.set(CONN.x, H + 0.004, CONN.z);
  statics.add(lip);
  statics.add(mesh(new THREE.CylinderGeometry(CONN.r - 0.1, CONN.r - 0.1, 0.014, 64), flat(DECK.consoleTop), CONN.x, H + 0.007, CONN.z, false));
  // The rail: its top at `rail` over the dais, round the back between the galleries and stubs by the aisle.
  const open = openings();
  const r = CONN.r - 0.1;
  const runs: THREE.Vector3[][] = [];
  let run: THREE.Vector3[] = [];
  for (let k = 0; k <= 96; k++) {
    const a = -Math.PI / 2 + (k / 96) * Math.PI * 2;
    if (isOpen(a, open)) {
      if (run.length) runs.push(run);
      run = [];
      continue;
    }
    run.push(new THREE.Vector3(CONN.x + Math.cos(a) * r, H + CONN.rail, CONN.z + Math.sin(a) * r));
  }
  if (run.length) runs.push(run);
  // Only the rail round the back (a stub between the aisle and a gallery would stand in the captain's view).
  for (const pts of runs.filter((r) => r.length > 12)) {
    rail(statics, pts, () => H, brass, 6);
    // Nobody steps through it: a post's worth of fence every few points.
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      cols.push({ minX: p.x - 0.12, maxX: p.x + 0.12, minZ: p.z - 0.12, maxZ: p.z + 0.12, top: H + CONN.rail, fence: true });
    }
  }
}

/** The captain's chair, built facing +z and turned to the bow: the room's hero, shoulder-high, gold-piped, rim-lit. */
function captainsChair(): { chair: THREE.Group; arms: [THREE.Object3D, THREE.Object3D] } {
  const g = new THREE.Group();
  const shell = flat(DECK.console);
  const pad = flat(DECK.consoleTop);
  const dark = matte(DECK.instrument);
  const brass = matte(BRASS, { metalness: 0.75, roughness: 0.32, trim: false });
  const gold = practical(CONN_GOLD);
  // A round plinth with a brass ring, a column, and the seat on it.
  g.add(mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.08, 32), shell, 0, 0.04, 0));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.016, 4, 48).rotateX(Math.PI / 2), brass);
  ring.position.y = 0.08;
  g.add(ring);
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.34, 12), brass, 0, 0.25, 0));
  g.add(mesh(rbox(0.7, 0.13, 0.62, 0.05), shell, 0, 0.45, 0.02));
  g.add(mesh(rbox(0.6, 0.06, 0.54, 0.03), pad, 0, 0.53, 0.04));
  // The underlight: a gold ring under the seat's edge.
  const under = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.012, 4, 48).rotateX(Math.PI / 2), gold);
  under.position.y = 0.375;
  g.add(under);
  // The back, leaning back a little: shoulder-high, not a wall (standing behind the chair, or coming up
  // onto the dais, the eye clears it and sees the pit). An open frame round a padded spine, a headrest
  // on two posts, gold piping, and a ship-cyan rim down its outer edges so it reads lit from behind.
  const rim = practical(DECK.ship);
  const back = new THREE.Group();
  back.position.set(0, 0.5, -0.29);
  back.rotation.x = -0.14;
  back.add(mesh(rbox(0.66, 0.66, 0.1, 0.05), shell, 0, 0.34, 0));
  back.add(mesh(rbox(0.5, 0.56, 0.04, 0.02), pad, 0, 0.34, 0.06));
  // The headrest, over a gap, on two brass posts.
  for (const s of [-1, 1]) back.add(mesh(box(0.035, 0.16, 0.035), brass, s * 0.13, 0.74, 0.01, false));
  back.add(mesh(rbox(0.42, 0.15, 0.09, 0.045), pad, 0, 0.86, 0.03));
  back.add(mesh(box(0.36, 0.012, 0.012), gold, 0, 0.94, 0.075, false));
  for (const s of [-1, 1]) {
    const wing = mesh(rbox(0.09, 0.46, 0.2, 0.04), shell, s * 0.32, 0.42, 0.06);
    wing.rotation.y = s * -0.3;
    back.add(wing);
    // Gold piping down each edge of the back, and the rim light behind it.
    back.add(mesh(box(0.014, 0.62, 0.014), gold, s * 0.335, 0.34, 0.06, false));
    back.add(mesh(box(0.016, 0.6, 0.016), rim, s * 0.34, 0.34, -0.06, false));
  }
  back.add(mesh(box(0.66, 0.014, 0.014), gold, 0, 0.67, 0.06, false));
  back.add(mesh(box(0.6, 0.016, 0.016), rim, 0, 0.68, -0.06, false));
  g.add(back);
  // The armrests, each with a slim strip along its top, tilted up toward whoever sits there.
  const arms: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    g.add(mesh(rbox(0.13, 0.09, 0.62, 0.035), shell, s * 0.42, 0.7, 0.04));
    g.add(mesh(box(0.06, 0.2, 0.08), brass, s * 0.42, 0.58, -0.2));
    g.add(mesh(box(0.06, 0.2, 0.08), brass, s * 0.42, 0.58, 0.26));
    const strip = new THREE.Group();
    strip.position.set(s * 0.42, 0.752, 0.12);
    strip.rotation.set(-Math.PI / 2 - 0.5, 0, 0);
    strip.add(mesh(box(0.15, 0.36, 0.012), dark, 0, 0, -0.008, false));
    g.add(strip);
    arms.push(strip);
  }
  return { chair: g, arms: arms as [THREE.Object3D, THREE.Object3D] };
}

/** A soft round glow on the deck plate: the chair's gold underlight, as light, not a lamp (no light is added). */
function underGlow(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  grad.addColorStop(0, 'rgba(217,179,108,0.55)');
  grad.addColorStop(0.45, 'rgba(217,179,108,0.18)');
  grad.addColorStop(1, 'rgba(217,179,108,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  m.renderOrder = 1;
  return m;
}

/** An armrest strip's face, `w` by `h` metres on a canvas of its own. */
function stripFace(into: THREE.Object3D, w: number, h: number) {
  const { canvas, g, texture } = canvasTexture(640, Math.round((640 * h) / w));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  face.rotation.z = -Math.PI / 2;
  // Found by name for the take-the-conn boot (features/takeconn).
  face.name = 'conn-strip';
  into.add(face);
  return { canvas, g, texture };
}

/** The conn: the dais, its rail, the captain's chair, its underlight and the two armrest strips. */
export const conn: Fixture<'conn'> = (site) => {
  const group = new THREE.Group();
  const cols: Collider[] = [];
  const statics = new THREE.Group();
  dais(statics, cols);
  group.add(mergeByMaterial(statics));

  const seat = SEATING_BY_ID.get('conn')!;
  const { chair, arms } = captainsChair();
  chair.position.set(seat.x, seat.y, seat.z);
  chair.rotation.y = seat.rotY;
  group.add(chair);
  const glow = underGlow();
  glow.position.set(seat.x, seat.y + 0.018, seat.z);
  group.add(glow);
  cols.push({ minX: seat.x - 0.4, maxX: seat.x + 0.4, minZ: seat.z - 0.4, maxZ: seat.z + 0.4, top: seat.y + 0.53 });
  seatable(chair, 'conn', 1.5, site.interactables);

  const left = stripFace(arms[0], 0.34, 0.13);
  const right = stripFace(arms[1], 0.34, 0.13);
  site.group.add(group);
  let countsKey = '';
  let courseKey = '';
  const setCounts = (c: AttentionCounts) => {
    const key = JSON.stringify(c);
    if (key === countsKey) return;
    countsKey = key;
    paintCountStrip(left.g, left.canvas.width, left.canvas.height, c);
    left.texture.needsUpdate = true;
  };
  const setCourse = (c: Course) => {
    const key = JSON.stringify(c);
    if (key === courseKey) return;
    courseKey = key;
    paintCourseStrip(right.g, right.canvas.width, right.canvas.height, c);
    right.texture.needsUpdate = true;
  };
  setCounts({ 'needs-you': 0, stuck: 0, review: 0, working: 0, parked: 0 });
  setCourse({ statement: '', milestones: [] });
  return { colliders: cols, handle: { conn: { setCounts, setCourse } } };
};
