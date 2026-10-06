import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DECK } from '../../world/office/materials';
import type { ArmPose, HandsOut } from './pose';

// The captain's forearms and gloves, built in code: a flight suit sleeve in the units' two tones (a
// lighter plate over the forearm), a gauntlet cuff with a brushed steel ring, a glove in dark
// synthetic leather with a steel guard over the knuckles, and fingers in a loose fist. The right
// index finger is its own piece, so it can straighten to tap, and its tip carries a touch pad that
// lights ship-cyan as it presses (the one instrument on the glove, with the left wrist's readout).
// They live in a small scene of their own, in the hands' camera space (-z forward), drawn over the
// deck after its depth is cleared, so they never go through a console or a wall (see index.ts).
// After upstream agent-office's first-person hands (origin/main src/client/world/hands.ts, MIT).

/** The suit, its plates and the glove: one material, coloured per vertex, so each arm is one draw. */
const SUIT = '#36404C';
const PLATE = '#5A6572';
const GLOVE = '#2B3138';

/** Paints every vertex of `geo` one colour (linear), for the shared vertex-coloured material. */
function tint(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = geo.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/** A capsule along -z (`len` between its caps' centres), centred on the origin. */
const capsule = (r: number, len: number, seg = 10) => new THREE.CapsuleGeometry(r, len, 4, seg).rotateX(-Math.PI / 2);

/** Without an index: the rounded boxes have none, and pieces merge only when they all agree. */
function loose(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!geo.index) return geo;
  const flat = geo.toNonIndexed();
  geo.dispose();
  return flat;
}

/** `geo` placed by `m`, then painted. */
function put(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.ColorRepresentation) {
  return tint(loose(geo).applyMatrix4(m), color);
}

const M = () => new THREE.Matrix4();
const at = (x: number, y: number, z: number) => M().makeTranslation(x, y, z);
const turnX = (a: number) => M().makeRotationX(a);
const turnY = (a: number) => M().makeRotationY(a);

/**
 * A finger from its knuckle at `base`: two segments (`len` each), the first bent down by `a1`, the
 * second by `a2` more; `toward` swings it in toward the middle of the hand. Its tip's frame comes back
 * too, for whatever sits on it.
 */
function finger(base: THREE.Vector3, r: number, lens: [number, number], a1: number, a2: number, toward = 0) {
  const root = at(base.x, base.y, base.z).multiply(turnY(toward)).multiply(turnX(-a1));
  const first = put(capsule(r, lens[0]), root.clone().multiply(at(0, 0, -lens[0] / 2)), GLOVE);
  const mid = root.clone().multiply(at(0, 0, -lens[0])).multiply(turnX(-a2));
  const second = put(capsule(r * 0.93, lens[1]), mid.clone().multiply(at(0, 0, -lens[1] / 2)), GLOVE);
  return { parts: [first, second], tip: mid.clone().multiply(at(0, 0, -lens[1] - r * 0.4)) };
}

/** Where the four knuckles sit across the back of the hand, index first (toward the thumb). */
const KNUCKLES = [-0.029, -0.0095, 0.0095, 0.028];
const FINGER_LEN: [number, number][] = [
  [0.036, 0.03],
  [0.04, 0.032],
  [0.037, 0.03],
  [0.03, 0.025],
];

/** One arm: its body (one vertex-coloured mesh), its steel, and on the right the tapping finger. */
export interface Arm {
  group: THREE.Group;
  side: 1 | -1;
  /** The right index finger's pivot at its knuckle (null on the left, whose fingers are all one curl). */
  index: THREE.Group | null;
  /** Its touch pad's material, lit as it presses. */
  touch: THREE.MeshBasicMaterial | null;
}

function buildArm(side: 1 | -1, body: THREE.Material, steel: THREE.Material, touchMat: THREE.MeshBasicMaterial | null): Arm {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [];
  // The sleeve, wider toward the elbow and long enough that its far end is always off screen, and a
  // lighter plate along the top of the forearm.
  geos.push(put(new THREE.CylinderGeometry(0.043, 0.053, 0.52, 20, 1).rotateX(Math.PI / 2), at(0, -0.003, 0.29), SUIT));
  geos.push(put(new RoundedBoxGeometry(0.04, 0.01, 0.12, 2, 0.0045), at(0, 0.041, 0.13).multiply(turnX(-0.04)), PLATE));
  // The gauntlet's cuff, flaring back over the sleeve, with a brushed steel ring at its edge.
  geos.push(put(new THREE.CylinderGeometry(0.039, 0.046, 0.046, 20, 1).rotateX(Math.PI / 2), at(0, 0, 0.02), GLOVE));
  metal.push(loose(new THREE.TorusGeometry(0.0455, 0.0028, 6, 28)).applyMatrix4(at(0, 0, 0.042)));
  // The hand: a rounded, flattened back and palm, narrower at the wrist.
  geos.push(put(new THREE.SphereGeometry(0.05, 20, 12).scale(0.86, 0.34, 1), at(0, 0, -0.052), GLOVE));
  geos.push(put(new THREE.SphereGeometry(0.034, 16, 10).scale(1, 0.55, 0.9), at(0, 0.002, -0.012), GLOVE));
  // A padded panel over the back of the hand, and a steel ridge over the knuckles.
  geos.push(put(new RoundedBoxGeometry(0.042, 0.005, 0.04, 2, 0.002), at(0, 0.0155, -0.05).multiply(turnX(0.06)), PLATE));
  metal.push(loose(new THREE.CapsuleGeometry(0.0048, 0.044, 3, 8)).applyMatrix4(at(side * 0.004, 0.011, -0.088).multiply(M().makeRotationZ(Math.PI / 2))));
  // The thumb, along the inside of the hand and in toward the fingers, curled a little.
  const thumbBase = new THREE.Vector3(-side * 0.036, -0.002, -0.034);
  geos.push(...finger(thumbBase, 0.011, [0.032, 0.027], 0.42, 0.36, -side * 0.42).parts);
  // The fingers, each in a relaxed curl that deepens toward the little one, fanned a touch.
  let index: THREE.Group | null = null;
  let touch: THREE.MeshBasicMaterial | null = null;
  KNUCKLES.forEach((kx, i) => {
    const base = new THREE.Vector3(side * kx, 0.003, -0.094);
    const r = i === 3 ? 0.0083 : 0.0095;
    // A loose fist: each finger bent about 55 degrees at the knuckle and as much again at the middle.
    const curl: [number, number] = [0.92 + i * 0.08, 0.98 + i * 0.07];
    const splay = -base.x * 1.6;
    if (i === 0 && touchMat) {
      // The right index finger on joints of its own, at the knuckle and the middle (see pose), its
      // touch pad a band round the tip.
      const [l1, l2] = FINGER_LEN[i];
      index = new THREE.Group();
      index.position.copy(base);
      index.add(new THREE.Mesh(tint(capsule(r, l1).translate(0, 0, -l1 / 2), GLOVE), body));
      const joint = new THREE.Group();
      joint.position.z = -l1;
      joint.add(new THREE.Mesh(tint(capsule(r * 0.93, l2).translate(0, 0, -l2 / 2), GLOVE), body));
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.99, r * 0.99, 0.008, 14, 1, true).rotateX(Math.PI / 2), touchMat);
      pad.position.z = -l2 + 0.002;
      joint.add(pad);
      index.add(joint);
      touch = touchMat;
      group.add(index);
      return;
    }
    geos.push(...finger(base, r, FINGER_LEN[i], curl[0], curl[1], splay).parts);
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos)!, body);
  const steelMesh = new THREE.Mesh(mergeGeometries(metal)!, steel);
  group.add(mesh, steelMesh);
  for (const g of geos) g.dispose();
  for (const g of metal) g.dispose();
  return { group, side, index, touch };
}

/** The left wrist's readout: the deck's clock in ship-cyan on instrument black, over a hairline. */
class WristReadout {
  readonly mesh: THREE.Mesh;
  private canvas = document.createElement('canvas');
  private texture: THREE.CanvasTexture;
  private shown = '';

  constructor() {
    this.canvas.width = 128;
    this.canvas.height = 56;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: this.texture });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.044, 0.019), mat);
    // On top of the forearm's plate, just back from the cuff, tipped up toward your eye.
    this.mesh.position.set(0, 0.057, 0.115);
    this.mesh.rotation.set(-Math.PI / 2 + 0.5, 0, 0);
    this.paint(new Date());
  }

  /** The clock again, when its minute has changed. */
  paint(now: Date) {
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (hm === this.shown) return;
    this.shown = hm;
    const g = this.canvas.getContext('2d')!;
    g.fillStyle = DECK.instrument;
    g.fillRect(0, 0, 128, 56);
    g.fillStyle = DECK.ship;
    g.font = '500 30px "JetBrains Mono", ui-monospace, monospace';
    g.textBaseline = 'middle';
    g.fillText(hm, 12, 26);
    g.fillStyle = DECK.shipDim;
    g.fillRect(12, 46, 104, 3);
    this.texture.needsUpdate = true;
  }
}

/**
 * Both arms in their scene, with the datapad (index.ts hands it in) and the light to see them by. `pose`
 * places them each frame from the motion's numbers.
 */
export class HandsRig {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(52, 1, 0.01, 4);
  readonly right: Arm;
  readonly left: Arm;
  readonly wrist = new WristReadout();
  readonly hemi = new THREE.HemisphereLight('#7C8AD8', '#262838', 1);
  readonly key = new THREE.DirectionalLight('#B3BCFF', 1);
  readonly fill = new THREE.DirectionalLight('#EEE2D2', 1);
  /** From over your shoulder onto what's in front of you: the deck's screens and practicals, so the gloves never go flat black. */
  readonly front = new THREE.DirectionalLight('#C9D6E6', 1);
  /** Starlight grazing the tops of the forearms and knuckles from over the bow: their edge against the dark. */
  readonly rim = new THREE.DirectionalLight('#C4CCFF', 1);
  private readonly materials: THREE.Material[] = [];

  constructor() {
    const body = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
    const steel = new THREE.MeshStandardMaterial({ color: '#9AA4AF', roughness: 0.35, metalness: 0.85 });
    const touch = new THREE.MeshBasicMaterial({ color: DECK.instrument });
    this.materials.push(body, steel, touch);
    this.right = buildArm(1, body, steel, touch);
    this.left = buildArm(-1, body, steel, null);
    this.left.group.add(this.wrist.mesh);
    this.scene.add(this.right.group, this.left.group, this.hemi, this.key, this.fill, this.front, this.rim);
    this.front.position.set(0.1, 0.6, 1);
    this.rim.position.set(-0.2, 1, -0.7);
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Places both arms (and shows them, or not) from this frame's motion. */
  pose(out: HandsOut) {
    const on = out.shown > 0;
    this.right.group.visible = this.left.group.visible = on;
    if (!on) return;
    place(this.right.group, out.right);
    place(this.left.group, out.left);
    // The index finger straightens out of its curl to tap, its tip lit at the press.
    const index = this.right.index;
    if (index) {
      const k = out.point;
      index.rotation.set(-0.86 * (1 - k) + 0.08 * k, 0.046 * (1 - k), 0);
      index.children[1].rotation.set(-0.94 * (1 - k) + 0.04 * k, 0, 0);
    }
    if (this.right.touch) this.right.touch.color.set(DECK.instrument).lerp(TOUCH_LIT, Math.min(1, out.touch * 1.2));
  }

  /** Every material, to warm their programs up before they're first drawn. */
  all(): readonly THREE.Material[] {
    return this.materials;
  }
}

const TOUCH_LIT = new THREE.Color(DECK.ship);

function place(g: THREE.Group, a: ArmPose) {
  g.position.set(a.x, a.y, a.z);
  g.rotation.set(a.rx, a.ry, a.rz);
}
