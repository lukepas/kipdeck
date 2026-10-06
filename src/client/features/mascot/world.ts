import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { contactShadow } from '../../world/office/materials';
import { onBridgeLayer } from '../bridge/shapes';
import { SPRIG, sprigShown } from './logic';
import { NEST } from './path';

// Kip, drawn: a stowaway deck kit, two stacked balls of oatmeal-cream fur 0.6 m tall, tall rounded
// leaf ears of plain fur lined in the vest's slate-blue that stand up (0.78 m to the tips), a curly
// antenna tuft between them with a little bead at its end, hazel eyes with a big catchlight and fur
// lids, a small muzzle and a slate button nose, a few tan freckles, stubby charcoal-socked legs on big
// round feet, big slate-blue mitten paws, a curled three-puff tail, a slate-blue quilted deck vest with
// two pockets, a brass toggle and the ship's roundel, and a chunky cream and grey-blue knitted scarf
// knotted at one side, one tail hanging in front and two streaming behind. In his right paw the Spark
// Sprig: a flat glowing crystal leaf on a stubby turned-wood grip, white at its core and rose at its
// rim, the only hue on him. No green, no robe, no hood, no dark ear tips, no cheek spots.
//
// One draw for all of him: every piece, the eyes too, is rigidly bound to one bone of a small pivot
// hierarchy (a skinned mesh with a single weight per vertex, so each pivot moves its pieces as a group
// would), lit like the rest of him, with only the catchlights given a little light of their own. The
// crystal is a plain mesh on its pivot. With his trail of motes, his shadow and his nest that is five
// draws. On the bridge layer, so the Overview never shows him. He dithers out as the camera comes
// within a metre of him and is not drawn nearer than half a metre, so the camera never ends up inside him.

/** His pivots, root first; each one's parent comes before it. */
export const BONES = [
  'body', 'hips', 'legL', 'legR', 'torso', 'armL', 'handL', 'armR', 'handR', 'sprig', 'neck', 'head',
  'tuft0', 'tuft1', 'earL', 'tipL', 'earR', 'tipR', 'lidL', 'lidR', 'lowL', 'lowR', 'tail0', 'tail1', 'tail2',
  'scarfL0', 'scarfL1', 'scarfL2', 'scarfR0', 'scarfR1', 'scarfR2',
] as const;
export type BoneName = (typeof BONES)[number];

/** Where each pivot sits in its parent at rest: parent, position, and a turn (x, y, z radians). */
type Rest = [parent: BoneName | null, pos: [number, number, number], rot?: [number, number, number]];

/** The eyes: how far apart, how high on the head, their radius. */
const EYE = { x: 0.062, y: -0.016, r: 0.041 } as const;
/** The head: a squashed sphere, its radius and its scale. */
const HEAD = { r: 0.15, s: [1, 0.87, 0.95] as const };

/** A point on the head's surface at (x, y) in front, and the way its surface faces there. */
function onHead(x: number, y: number): { at: THREE.Vector3; n: THREE.Vector3 } {
  const [sx, sy, sz] = HEAD.s;
  const a = HEAD.r * sx;
  const b = HEAD.r * sy;
  const c = HEAD.r * sz;
  const z = c * Math.sqrt(Math.max(0, 1 - (x / a) ** 2 - (y / b) ** 2));
  return { at: new THREE.Vector3(x, y, z), n: new THREE.Vector3(x / (a * a), y / (b * b), z / (c * c)).normalize() };
}
const eyeFrame = (side: number) => {
  const { at, n } = onHead(side * EYE.x, EYE.y);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  return { at: at.addScaledVector(n, 0.004), q };
};

function rests(): Record<BoneName, Rest> {
  const lid = (side: number, up: number): Rest => {
    const f = eyeFrame(side);
    const p = f.at.clone().add(new THREE.Vector3(0, up * EYE.r * 1.02, 0.0075).applyQuaternion(f.q));
    // The upper lids tip down toward his nose a touch (never up into a worried brow): a soft, bright look.
    const q = f.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), up > 0 ? side * 0.05 : 0));
    const e = new THREE.Euler().setFromQuaternion(q);
    return ['head', [p.x, p.y, p.z], [e.x, e.y, e.z]];
  };
  return {
    body: [null, [0, 0, 0]],
    hips: ['body', [0, 0.115, 0]],
    legL: ['hips', [0.055, 0, 0]],
    legR: ['hips', [-0.055, 0, 0]],
    torso: ['hips', [0, 0, 0]],
    armL: ['torso', [0.098, 0.165, 0.005], [0, 0, 0.32]],
    handL: ['armL', [0, -0.11, 0]],
    armR: ['torso', [-0.098, 0.165, 0.005], [0, 0, -0.32]],
    handR: ['armR', [0, -0.11, 0]],
    sprig: ['handR', [0, -0.012, 0.012], [1.25, 0, 0]],
    neck: ['torso', [0, 0.215, 0]],
    head: ['neck', [0, 0.125, 0.004]],
    tuft0: ['head', [0, 0.125, 0.01], [0.25, 0, 0]],
    tuft1: ['tuft0', [0, 0.045, 0], [-0.7, 0, 0]],
    earL: ['head', [0.066, 0.104, -0.012], [-0.08, 0, -0.26]],
    tipL: ['earL', [0, 0.132, 0], [0.32, 0, 0]],
    earR: ['head', [-0.066, 0.104, -0.012], [-0.08, 0, 0.26]],
    tipR: ['earR', [0, 0.132, 0], [0.32, 0, 0]],
    lidL: lid(1, 1),
    lidR: lid(-1, 1),
    lowL: lid(1, -1),
    lowR: lid(-1, -1),
    tail0: ['torso', [0, 0.01, -0.1], [-0.5, 0, 0]],
    tail1: ['tail0', [0, 0.06, 0], [-0.9, 0, 0]],
    tail2: ['tail1', [0, 0.055, 0], [-1.0, 0, 0]],
    scarfL0: ['torso', [0.028, 0.2, -0.075], [0.35, 0, 0.1]],
    scarfL1: ['scarfL0', [0, -0.062, 0], [0.12, 0, 0]],
    scarfL2: ['scarfL1', [0, -0.062, 0], [0.1, 0, 0]],
    scarfR0: ['torso', [-0.02, 0.198, -0.078], [0.3, 0, -0.06]],
    scarfR1: ['scarfR0', [0, -0.058, 0], [0.15, 0, 0]],
    scarfR2: ['scarfR1', [0, -0.058, 0], [0.12, 0, 0]],
  };
}

/** His colours (DESIGN.md: low saturation, no state hue, no green). */
export const KIP = {
  fur: '#E9DCC6',
  belly: '#F6EEDF',
  slate: '#3B4350',
  /** The tan of his freckles and the scarf's knit shadow. */
  tan: '#B89F82',
  vest: '#4A5A70',
  /** The scarf's stripe and the ears' lining: the vest's slate-blue, lifted, so it never reads as a dark collar. */
  knit: '#8592A6',
  vestDark: '#3E4C5F',
  brass: '#B9A86E',
  iris: '#6B4A2B',
  pupil: '#1A1410',
  /** The catchlights: bright, but under the glow's threshold so an eye never blooms. */
  glint: '#E8E6E2',
  white: '#D9D3C7',
  wood: '#CDAE84',
} as const;

/** How much of his colours' light his fur sends back (the vertex colours are scaled by it). */
export const FUR_ALBEDO = 0.2;
/** The most light any part of him sends back (linear), whatever spot he stands under: under every glow threshold. */
export const FUR_CLAMP = 0.6;
/** The catchlights' own light (linear), added to their lit colour, under FUR_CLAMP. */
export const GLINT = 0.4;
/** How much of his own colour he shows in shadow (an emissive by vertex colour), well under the glow's threshold. */
export const FUR_GLOW = 0.05;

/** A piece: its geometry in its pivot's own space, painted one colour (or by `paint` per vertex). */
interface Piece {
  bone: BoneName;
  geo: THREE.BufferGeometry;
  color: string;
  paint?: (p: THREE.Vector3) => string;
  /** A catchlight: given a little light of its own. */
  glint?: boolean;
}

const sphere = (r: number, w = 16, h = 10) => new THREE.SphereGeometry(r, w, h);
/** The head's curve near the eyes (m): flat discs on the face are bent to it, so no edge stands off the head. */
const FACE_R = 0.14;
/** Bends a flat disc (in the xy plane, facing +z) round a sphere of radius FACE_R about (cx, cy). */
function bend(g: THREE.BufferGeometry, cx = 0, cy = 0): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - cx;
    const dy = pos.getY(i) - cy;
    pos.setZ(i, pos.getZ(i) - (dx * dx + dy * dy) / (2 * FACE_R));
  }
  g.computeVertexNormals();
  return g;
}

function pieces(): Piece[] {
  const out: Piece[] = [];
  const add = (bone: BoneName, geo: THREE.BufferGeometry, color: string, paint?: Piece['paint']) => out.push({ bone, geo, color, paint });
  // Feet and socks: charcoal, the feet big and round.
  for (const leg of ['legL', 'legR'] as const) {
    add(leg, new THREE.CapsuleGeometry(0.03, 0.05, 4, 12).translate(0, -0.055, 0), KIP.slate);
    // A round foot: a squashed ball, its sole flattened onto the deck.
    const foot = new THREE.SphereGeometry(0.046, 18, 10).scale(0.8, 0.55, 1.05);
    const fp = foot.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) fp.setY(i, Math.max(-0.008, fp.getY(i)));
    foot.computeVertexNormals();
    add(leg, foot.translate(0, -0.11, 0.02), KIP.slate);
  }
  // The body: a pear of fur, a lighter belly, the vest round it (open at the front), pockets, toggle, roundel.
  const pear = [[0, -0.03], [0.07, -0.025], [0.104, 0.01], [0.112, 0.05], [0.104, 0.1], [0.086, 0.15], [0.062, 0.188], [0.034, 0.214], [0, 0.222]].map(([r, y]) => new THREE.Vector2(r, y));
  add('torso', new THREE.LatheGeometry(pear, 24), KIP.fur);
  add('torso', sphere(0.08).scale(0.85, 1, 0.5).translate(0, 0.055, 0.078), KIP.belly);
  const gap = 0.6;
  add('torso', new THREE.CylinderGeometry(0.1, 0.119, 0.13, 24, 2, true, gap, Math.PI * 2 - gap * 2).translate(0, 0.088, 0), KIP.vest, (p) => (Math.abs(p.y - 0.088) < 0.01 ? KIP.vestDark : KIP.vest));
  for (const side of [-1, 1]) {
    const a = side * 0.95;
    add('torso', new THREE.BoxGeometry(0.036, 0.03, 0.008).rotateY(a).translate(Math.sin(a) * 0.118, 0.05, Math.cos(a) * 0.118), KIP.vestDark);
  }
  add('torso', new THREE.CylinderGeometry(0.008, 0.008, 0.022, 6).rotateZ(Math.PI / 2).rotateY(-0.62).translate(Math.sin(-0.62) * 0.108, 0.125, Math.cos(-0.62) * 0.108), KIP.brass);
  add('torso', new THREE.CircleGeometry(0.016, 10).rotateY(0.7).translate(Math.sin(0.7) * 0.112, 0.118, Math.cos(0.7) * 0.112), KIP.slate, (p) => (Math.hypot(p.x - Math.sin(0.7) * 0.112, p.y - 0.118, p.z - Math.cos(0.7) * 0.112) > 0.012 ? KIP.brass : KIP.slate));
  // The scarf: a chunky knit round his neck in broad cream and grey-blue bands, ribbed (each band has a
  // tan shadow line), a knot at his left shoulder with one short tail hanging in front, two streaming behind.
  const band = (a: number) => Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8);
  const knitAt = (p: THREE.Vector3) => {
    const a = Math.atan2(p.z, p.x);
    const f = (((a + Math.PI) / (Math.PI * 2)) * 8) % 1;
    return f < 0.12 ? KIP.tan : band(a) % 2 ? KIP.knit : KIP.belly;
  };
  add('torso', new THREE.TorusGeometry(0.072, 0.027, 8, 28).rotateX(Math.PI / 2).translate(0, 0.196, 0.004), KIP.belly, (p) => knitAt(new THREE.Vector3(p.x, p.y - 0.196, p.z - 0.004)));
  const knot = { x: 0.062, y: 0.19, z: 0.052 };
  add('torso', sphere(0.03, 12, 8).scale(1.1, 0.9, 0.9).translate(knot.x, knot.y, knot.z), KIP.knit);
  add('torso', new THREE.BoxGeometry(0.04, 0.085, 0.014, 1, 3, 1).rotateZ(0.2).rotateX(-0.25).translate(knot.x + 0.012, knot.y - 0.06, knot.z + 0.032), KIP.belly, (p) => (Math.floor((p.y - knot.y + 0.2) / 0.028) % 2 ? KIP.knit : KIP.belly));
  for (const [i, b] of (['scarfL0', 'scarfL1', 'scarfL2', 'scarfR0', 'scarfR1', 'scarfR2'] as const).entries()) {
    add(b, new THREE.BoxGeometry(0.046, 0.064, 0.014).translate(0, -0.03, 0), i % 2 ? KIP.knit : KIP.belly);
  }
  // Arms and big slate-blue mitten paws, a cream cuff where the fur meets them.
  for (const [arm, hand] of [['armL', 'handL'], ['armR', 'handR']] as const) {
    add(arm, new THREE.CapsuleGeometry(0.027, 0.07, 4, 12).translate(0, -0.055, 0), KIP.fur);
    add(hand, new THREE.TorusGeometry(0.028, 0.01, 6, 16).rotateX(Math.PI / 2).translate(0, 0.012, 0), KIP.belly);
    add(hand, sphere(0.043).scale(1, 1.1, 0.9).translate(0, -0.018, 0), KIP.vest);
  }
  // The Sprig's grip: turned biscuit wood with a slate ribbon round it, three beads at the crystal's foot.
  add('sprig', new THREE.CylinderGeometry(0.012, 0.014, 0.075, 6).translate(0, 0.005, 0), KIP.wood, (p) => (Math.abs(p.y + 0.004) < 0.012 ? KIP.slate : KIP.wood));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    add('sprig', new THREE.IcosahedronGeometry(0.009, 0).translate(Math.cos(a) * 0.014, 0.046, Math.sin(a) * 0.006), KIP.wood);
  }
  // The head: fur, a light muzzle, a slate button nose, three tan freckles under each eye.
  add('head', sphere(HEAD.r, 32, 20).scale(...HEAD.s), KIP.fur);
  add('head', sphere(0.06).scale(1.15, 0.7, 0.75).translate(0, -0.062, 0.108), KIP.belly);
  add('head', sphere(0.015, 10, 7).scale(1.35, 0.85, 0.8).translate(0, -0.04, 0.152), KIP.slate);
  for (const side of [-1, 1]) {
    for (const [fx, fy] of [[0.078, -0.058], [0.094, -0.066], [0.084, -0.074]]) {
      const { at, n } = onHead(side * fx, fy);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      add('head', new THREE.CircleGeometry(0.0045, 8).applyQuaternion(q).translate(at.x + n.x * 0.0015, at.y + n.y * 0.0015, at.z + n.z * 0.0015), KIP.tan);
    }
  }
  // The eyes, bent to the head so no edge stands off it.
  for (const side of [-1, 1]) for (const l of eyeLayers(side)) out.push(l);
  // Fur lids over the eyes, bent to the head too: the upper ones blink and droop, the lower ones rise for happy arcs.
  for (const [b, up] of [['lidL', 1], ['lidR', 1], ['lowL', -1], ['lowR', -1]] as const) {
    add(b, bend(new THREE.CircleGeometry(EYE.r * 1.12, 20).translate(0, -up * EYE.r * 1.12, 0), 0, -up * EYE.r * 1.12), KIP.fur);
  }
  // The antenna tuft: a curl of fur between the ears, a little bead at its end.
  add('tuft0', new THREE.CapsuleGeometry(0.011, 0.04, 3, 8).translate(0, 0.022, 0), KIP.fur);
  add('tuft1', new THREE.CapsuleGeometry(0.009, 0.03, 3, 8).translate(0, 0.016, 0), KIP.fur);
  add('tuft1', sphere(0.017, 12, 8).translate(0, 0.042, 0), KIP.belly);
  // Ears: a leaf of plain fur lined with the vest's slate-blue, its top third (the tip that flops) fur too.
  const leaf = (pts: number[][]) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 18).scale(1.08, 1, 0.3);
  for (const [ear, tip] of [['earL', 'tipL'], ['earR', 'tipR']] as const) {
    add(ear, leaf([[0, -0.01], [0.032, 0.005], [0.048, 0.05], [0.05, 0.1], [0.045, 0.134], [0, 0.136]]), KIP.fur);
    add(ear, new THREE.CircleGeometry(0.03, 16).scale(0.72, 1.8, 1).translate(0, 0.066, 0.017), KIP.knit);
    add(tip, leaf([[0, -0.004], [0.045, 0.002], [0.04, 0.03], [0.026, 0.052], [0, 0.066]]), KIP.fur);
  }
  // The tail: three fluffy puffs curling up behind, the last charcoal.
  add('tail0', new THREE.IcosahedronGeometry(0.05, 2), KIP.fur);
  add('tail1', new THREE.IcosahedronGeometry(0.046, 2), KIP.fur);
  add('tail2', new THREE.IcosahedronGeometry(0.038, 2), KIP.belly);
  return out;
}

/** The eyes: white, a big hazel iris sitting a touch low (a soft, open look), pupil and two catchlights, as head pieces. */
function eyeLayers(side: number): Piece[] {
  const { at, q } = eyeFrame(side);
  const layer = (r: number, x: number, y: number, z: number, color: string, glint = false): Piece => ({
    bone: 'head',
    geo: bend(new THREE.CircleGeometry(r, 20).translate(x, y, z), 0, 0).applyQuaternion(q).translate(at.x, at.y, at.z),
    color,
    glint,
  });
  return [
    layer(EYE.r, 0, 0, 0, KIP.white),
    layer(EYE.r * 0.8, 0, -EYE.r * 0.04, 0.0012, KIP.iris),
    layer(EYE.r * 0.44, 0, -EYE.r * 0.04, 0.0024, KIP.pupil),
    layer(EYE.r * 0.26, -side * EYE.r * 0.26, EYE.r * 0.4, 0.0036, KIP.glint, true),
    layer(EYE.r * 0.1, side * EYE.r * 0.22, -EYE.r * 0.12, 0.0036, KIP.glint, true),
  ];
}

/** The Spark Sprig's crystal: a flat faceted leaf, 0.3 m, widest a little under halfway and narrowing to a point; white core, a thin rose rim. */
function crystalGeometry(): THREE.BufferGeometry {
  const prof = [[0, 0], [0.028, 0.03], [0.052, 0.1], [0.056, 0.15], [0.044, 0.21], [0.024, 0.26], [0.009, 0.29], [0, 0.305]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 16).scale(1, 1, 0.3).translate(0, 0.05, 0).toNonIndexed();
  const core = new THREE.Color(SPRIG.core);
  const rim = new THREE.Color(SPRIG.rim);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) - 0.05;
    // How near the rim: out toward the leaf's edge, and toward its foot and tip.
    // Only the outermost edge goes rose (a thin rim), so dimmed it still reads as a pale crystal.
    const half = Math.max(0.001, 0.056 * Math.sin(Math.PI * Math.min(1, Math.max(0, y / 0.305)) * 0.92 + 0.12));
    const k = Math.min(1, Math.max(Math.abs(pos.getX(i)) / half, Math.abs(y - 0.15) / 0.16) ** 6);
    c.copy(core).lerp(rim, k);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** A screen-door dither (interleaved gradient noise): a fragment is dropped when its threshold is over `k`. */
const DITHER = `uniform float uFade;
bool dithered(float k) {
  if (k >= 0.999) return false;
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  return n >= k;
}`;

/** A soft round dot for the motes. */
function dotTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** How many motes the trail keeps at most (High; Medium draws half). */
export const MOTES = 12;

export interface MascotRig {
  group: THREE.Group;
  /** Moves as a whole: his place on the ground and his heading. */
  root: THREE.Group;
  bones: Record<BoneName, THREE.Bone>;
  /** Each pivot's rest position and turn, which the animation works from. */
  rest: Record<BoneName, { pos: THREE.Vector3; rot: THREE.Euler }>;
  body: THREE.SkinnedMesh;
  crystal: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** The trail: positions (world) and colours written each frame. */
  motes: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  shadow: THREE.Mesh;
  nest: THREE.Group;
  /** The Sprig's light, as a part of its peak (0 to 1). */
  glow(k: number): void;
  /** The camera never ends up inside him: dithered out from 0.9 m to 0.5 m from his middle, not drawn nearer. */
  fadeFrom(camera: THREE.Vector3): void;
  show(on: boolean): void;
}

/** Builds him, his trail, his shadow and his nest, on the bridge layer. */
export function buildMascot(): MascotRig {
  const group = new THREE.Group();
  group.name = 'mascot';
  const root = new THREE.Group();
  group.add(root);

  // The pivots, at rest.
  const def = rests();
  const bones = {} as Record<BoneName, THREE.Bone>;
  const rest = {} as MascotRig['rest'];
  for (const name of BONES) {
    const [parent, pos, rot] = def[name];
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...pos);
    if (rot) b.rotation.set(...rot);
    rest[name] = { pos: b.position.clone(), rot: b.rotation.clone() };
    (parent ? bones[parent] : root).add(b);
    bones[name] = b;
  }
  root.updateMatrixWorld(true);

  // Every piece into his pivot's place, coloured, bound to that one pivot.
  const index = new Map(BONES.map((n, i) => [n, i]));
  const parts = pieces().map((p) => {
    const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo).applyMatrix4(bones[p.bone].matrixWorld);
    g.deleteAttribute('uv');
    const pos = g.attributes.position as THREE.BufferAttribute;
    const n = pos.count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    const v = new THREE.Vector3();
    const inv = new THREE.Matrix4().copy(bones[p.bone].matrixWorld).invert();
    for (let i = 0; i < n; i++) {
      c.set(p.paint ? p.paint(v.fromBufferAttribute(pos, i).applyMatrix4(inv)) : p.color);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('glint', new THREE.BufferAttribute(new Float32Array(n).fill(p.glint ? 1 : 0), 1));
    const bi = index.get(p.bone)!;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0).map((_, i) => (i % 4 === 0 ? bi : 0)), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(n * 4).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    return g;
  });
  // Each piece keeps its own smooth normals: soft fur, not facets.
  const geo = mergeGeometries(parts)!;
  // His colours are what you see; the deck's lights are tuned for its dark plate, so his albedo is taken
  // down to the deck's own range (DESIGN.md: about 0.3 at most) and he never glows under a pod's spot.
  const fade = { value: 1 };
  const furMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color().setScalar(FUR_ALBEDO), emissive: new THREE.Color().setScalar(FUR_GLOW), roughness: 0.85, metalness: 0 });
  // A little of each piece's own colour in its shadows, so the night's blue key never turns his cream to
  // slate; a little light of their own in the catchlights; never brighter than FUR_CLAMP under any spot;
  // and dithered out as the camera comes close.
  furMat.onBeforeCompile = (shader) => {
    shader.uniforms.uFade = fade;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glint;\nvarying float vGlint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvGlint = glint;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vGlint;\n${DITHER}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n\tif (dithered(uFade)) discard;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance = totalEmissiveRadiance * vColor.rgb + vec3(vGlint * ${GLINT.toFixed(3)});`)
      .replace('#include <opaque_fragment>', `outgoingLight = min(outgoingLight, vec3(${FUR_CLAMP.toFixed(3)}));\n#include <opaque_fragment>`);
  };
  furMat.customProgramCacheKey = () => 'mascot-fur';
  const body = new THREE.SkinnedMesh(geo, furMat);
  body.name = 'mascot-body';
  root.add(body);
  body.bind(new THREE.Skeleton(BONES.map((n) => bones[n])), body.matrixWorld);
  // Culled by a sphere round all of him, wherever his pivots put his pieces.
  body.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.38, 0), 0.75);

  const crystalMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  crystalMat.onBeforeCompile = (shader) => {
    shader.uniforms.uFade = fade;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DITHER}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n\tif (dithered(uFade)) discard;');
  };
  crystalMat.customProgramCacheKey = () => 'mascot-sprig';
  const crystal = new THREE.Mesh(crystalGeometry(), crystalMat);
  crystal.name = 'mascot-sprig';
  bones.sprig.add(crystal);

  // The trail of motes off the Sprig: a ring of points in world space, written each frame.
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
  moteGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ size: 0.05, map: dotTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, sizeAttenuation: true }));
  motes.frustumCulled = false;
  motes.visible = false;
  motes.name = 'mascot-motes';

  const shadow = contactShadow(0.46, 0.46, 0, 0, 0, 0.006);

  // His nest: a slate blanket folded in a shallow parts tray, under Bolt's charger.
  const nest = new THREE.Group();
  const tray = (g: THREE.BufferGeometry, color: string) => {
    const t = g.toNonIndexed();
    t.deleteAttribute('uv');
    const c = new THREE.Color(color);
    const col = new Float32Array(t.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
    t.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return t;
  };
  const steel = '#4A5664';
  const nestGeo = mergeGeometries([
    tray(new THREE.BoxGeometry(0.5, 0.025, 0.72).translate(0, 0.0125, 0), steel),
    tray(new THREE.BoxGeometry(0.03, 0.09, 0.72).translate(-0.235, 0.045, 0), steel),
    tray(new THREE.BoxGeometry(0.03, 0.09, 0.72).translate(0.235, 0.045, 0), steel),
    tray(new THREE.BoxGeometry(0.44, 0.09, 0.03).translate(0, 0.045, -0.345), steel),
    tray(new THREE.BoxGeometry(0.44, 0.09, 0.03).translate(0, 0.045, 0.345), steel),
    tray(new THREE.SphereGeometry(0.21, 10, 5).scale(1, 0.18, 1.5).translate(0, 0.04, 0), KIP.slate),
    tray(new THREE.BoxGeometry(0.42, 0.03, 0.16).rotateX(0.2).translate(0, 0.07, 0.22), KIP.vest),
  ])!;
  nestGeo.computeVertexNormals();
  const nestMesh = new THREE.Mesh(nestGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.15, flatShading: true }));
  nest.add(nestMesh);
  nest.position.set(NEST.x, NEST.y, NEST.z);
  nest.name = 'mascot-nest';

  group.add(motes, shadow, nest);
  onBridgeLayer(group);
  for (const o of [body, crystal, nestMesh]) {
    o.castShadow = false;
    o.receiveShadow = false;
    o.userData.noMerge = true;
  }

  return {
    group,
    root,
    bones,
    rest,
    body,
    crystal,
    motes,
    shadow,
    nest,
    glow(k) {
      crystalMat.color.setScalar(SPRIG.peak * sprigShown(k));
    },
    fadeFrom(c) {
      const p = root.position;
      const k = Math.min(1, Math.max(0, (Math.hypot(c.x - p.x, c.y - (p.y + 0.38), c.z - p.z) - 0.5) / 0.4));
      fade.value = k;
      body.visible = crystal.visible = k > 0.001;
    },
    show(on) {
      group.visible = on;
    },
  };
}
