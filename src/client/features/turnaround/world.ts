// The pit wall's look: a clock face on the Review bay's roof, facing the deck, with the captain's reply
// and review times as a table in mono (today, the seven-day median, how many waits) and a thin bar for
// each review today; the hairline that runs once along the deck's west aisle from the bay to the drive
// core when a wait clears fast; and the bay's light a step up when three or more units wait for review. Neutral and ship-cyan only: no state's
// hue, never red for a slow number. Three draws, all on the bridge layer but the wash.
import * as THREE from 'three';
import { MEETING_ROOM } from '../../../shared/layout';
import { AFT_CORE, PIT_WALL } from '../../../shared/ritual-slots';
import { clockLine, waitText, type Clock, type Turnaround } from '../../../shared/turnaround';
import { DECK, matte } from '../../world/office/materials';
import { mergeByMaterial } from '../../world/toon';
import { onBridgeLayer } from '../bridge/shapes';
import { INK, ground, screen, titleBar } from '../boards/screen';
import { label, table, type TableRow } from '../boards/table';
import { paintFar, type FarSpec } from '../boards/far';

/** The face's canvas units a metre: read from the deck below the bay and from the conn. */
const UNITS = 240;

/** The pit wall from across the deck: the reply and review clocks today and the queue, neutral and ship-cyan only. Pure. */
export function pitFar(t: Turnaround | null, queue: number): FarSpec {
  return {
    title: 'Pit wall  today',
    hue: DECK.shipDim,
    counts: [
      { n: waitText(t?.reply.today), word: 'reply', hue: INK.text },
      { n: waitText(t?.review.today), word: 'review', hue: INK.text },
      { n: String(queue), word: 'to review', hue: DECK.ship },
    ],
  };
}

export class PitWall {
  readonly mesh = new THREE.Group();
  private readonly face = screen(PIT_WALL.width, PIT_WALL.height, UNITS);
  private readonly mat: THREE.MeshBasicMaterial;
  private key = '';
  /** From across the deck: its headline numbers instead of its table (boards/far.ts). */
  far = true;

  constructor() {
    this.mat = new THREE.MeshBasicMaterial({ map: this.face.texture, toneMapped: false });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(PIT_WALL.width, PIT_WALL.height), this.mat);
    face.position.z = 0.051;
    // A dark housing round the face and a mast down to the bay's roof, one mesh.
    const frame = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.BoxGeometry(PIT_WALL.width + 0.12, PIT_WALL.height + 0.12, 0.1));
    const mastH = PIT_WALL.y - PIT_WALL.height / 2 - PIT_WALL.roof;
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.14, mastH, 0.14));
    mast.position.set(0, -PIT_WALL.height / 2 - mastH / 2, -0.04);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.5));
    foot.position.set(0, -PIT_WALL.y + PIT_WALL.roof + 0.03, -0.04);
    frame.add(housing, mast, foot);
    for (const m of frame.children as THREE.Mesh[]) m.material = matte(DECK.wallReveal, { metalness: 0.4, roughness: 0.6 });
    this.mesh.add(mergeByMaterial(frame), face);
    this.mesh.position.set(PIT_WALL.x, PIT_WALL.y, PIT_WALL.z);
    this.mesh.rotation.y = PIT_WALL.rotY;
    this.mesh.name = 'pit-wall';
    onBridgeLayer(this.mesh);
  }

  /**
   * The face: a table of the two clocks (today, the seven-day median and how many waits each counts),
   * and today's reviews as bars against the median's hairline at the right; the queue in the title.
   */
  paint(t: Turnaround | null, queue: number) {
    const key = JSON.stringify([t?.reply, t?.review, queue, this.far]);
    if (key === this.key) return;
    this.key = key;
    if (this.far) {
      paintFar(this.face, UNITS, pitFar(t, queue));
      return;
    }
    const { g, W, H } = this.face;
    ground(g, W, H);
    g.fillStyle = DECK.shipDim;
    g.fillRect(0, 0, W, 4);
    titleBar(g, W, 'Pit wall', queue ? `${queue} to review` : 'review queue clear', DECK.shipDim);
    const split = Math.round(W * 0.56);
    const cell = (ms: number | undefined) => ({ text: waitText(ms), mono: true, color: ms === undefined ? INK.muted : INK.text });
    const row = (name: string, c: Clock | undefined): TableRow => ({ cells: [name, cell(c?.today), cell(c?.median7), { text: String(c?.samples ?? 0), mono: true, color: INK.dim }] });
    table(g, {
      x: 24,
      y: 104,
      w: split - 40,
      h: H - 112,
      size: 40,
      rowH: 84,
      columns: [
        { label: 'Clock', w: 1.55 },
        { label: 'Today', w: 1.05, align: 'right', mono: true },
        { label: '7-day', w: 1.05, align: 'right', mono: true },
        { label: 'Waits', w: 0.95, align: 'right', mono: true },
      ],
      rows: [row('Reply', t?.reply), row('Review', t?.review)],
    });
    // Today's reviews: a thin bar each, its height the wait, against the seven-day median's hairline.
    g.fillStyle = INK.lineStrong;
    g.fillRect(split, 104, 2, H - 120);
    const bars = t?.review.bars ?? [];
    const x0 = split + 24;
    const x1 = W - 28;
    const top = 150;
    const bottom = H - 30;
    label(g, bars.length ? "Today's reviews" : 'No reviews yet today', x0, 124, 22, 'left', INK.muted);
    g.fillStyle = INK.line;
    g.fillRect(x0, bottom, x1 - x0, 2);
    const max = Math.max(1, ...bars, (t?.review.median7 ?? 0) * 1.6);
    const step = bars.length ? Math.min(26, (x1 - x0) / bars.length) : 26;
    bars.forEach((ms, i) => {
      const h = Math.max(3, ((bottom - top) * ms) / max);
      g.fillStyle = DECK.steelLight;
      g.fillRect(x1 - (bars.length - i) * step + step * 0.3, bottom - h, step * 0.4, h);
    });
    if (t?.review.median7) {
      const y = bottom - ((bottom - top) * t.review.median7) / max;
      g.fillStyle = DECK.ship;
      for (let x = x0; x < x1; x += 14) g.fillRect(x, y - 1, 8, 2);
    }
    this.face.texture.needsUpdate = true;
    this.mesh.userData.lines = [clockLine('REPLY', t?.reply ?? { samples: 0 }), clockLine('REVIEW', t?.review ?? { samples: 0 })];
  }

  /** A step brighter while the review queue is long. */
  raise(on: boolean) {
    this.mat.color.setScalar(on ? 1 : 0.82);
  }
}

/**
 * The hairline's path: out of the Review bay's door, down the west aisle clear of the pods and the
 * Proof corner, along the aft of the deck in front of the Standby bench, to the Deck lift's west side,
 * where the drive core stands behind the glass.
 */
export const HAIRLINE: readonly (readonly [number, number])[] = [
  [(MEETING_ROOM.door.x0 + MEETING_ROOM.door.x1) / 2, MEETING_ROOM.front.z + 0.4],
  [-10.4, MEETING_ROOM.front.z + 1.4],
  [-10.4, 11.2],
  [-9.4, 12.2],
  [-1.9, 12.2],
  [-1.5, AFT_CORE.z - 3.6],
];
/** How long the run takes end to end (ms), and how long its tail is (a fraction of the path). */
export const HAIRLINE_MS = 2600;
const TAIL = 0.16;

const lineVertex = /* glsl */ `
attribute float along;
varying float vAlong;
void main() {
  vAlong = along;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const lineFragment = /* glsl */ `
uniform float uHead;
uniform float uTail;
uniform vec3 uColor;
varying float vAlong;
void main() {
  float d = uHead - vAlong;
  if (d < 0.0 || d > uTail) discard;
  float k = 1.0 - d / uTail;
  gl_FragColor = vec4(uColor * (0.25 + 1.4 * k * k), 1.0);
}`;

export class Hairline {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;

  constructor() {
    const pos: number[] = [];
    const along: number[] = [];
    const idx: number[] = [];
    const lens = [0];
    for (let i = 1; i < HAIRLINE.length; i++) lens.push(lens[i - 1] + Math.hypot(HAIRLINE[i][0] - HAIRLINE[i - 1][0], HAIRLINE[i][1] - HAIRLINE[i - 1][1]));
    const total = lens[lens.length - 1];
    const w = 0.035;
    for (let i = 0; i < HAIRLINE.length; i++) {
      const [x, z] = HAIRLINE[i];
      const a = HAIRLINE[Math.max(0, i - 1)];
      const b = HAIRLINE[Math.min(HAIRLINE.length - 1, i + 1)];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * w;
      const nz = (dx / l) * w;
      pos.push(x + nx, 0.012, z + nz, x - nx, 0.012, z - nz);
      along.push(lens[i] / total, lens[i] / total);
      if (i > 0) {
        const o = (i - 1) * 2;
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
    geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uHead: { value: 0 }, uTail: { value: TAIL }, uColor: { value: new THREE.Color(DECK.ship) } },
      vertexShader: lineVertex,
      fragmentShader: lineFragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
    this.mesh.name = 'pit-hairline';
  }

  /** Where the run's head is (0-1 along, past 1 until its tail is home), or hidden with null. */
  at(head: number | null) {
    this.mesh.visible = head !== null;
    if (head !== null) this.mat.uniforms.uHead.value = head;
  }
}

/** The bay's light a step up: a soft cool wash over its floor, seen through the smoked glass. */
export function bayWash(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, '#9fb3c6');
  grad.addColorStop(1, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const w = MEETING_ROOM.maxX - MEETING_ROOM.minX;
  const d = MEETING_ROOM.maxZ - MEETING_ROOM.minZ;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  mesh.position.set((MEETING_ROOM.minX + MEETING_ROOM.maxX) / 2, 0.015, (MEETING_ROOM.minZ + MEETING_ROOM.maxZ) / 2);
  mesh.visible = false;
  mesh.name = 'bay-wash';
  return mesh;
}
