// A pod's zone on the floor: its slice of the tier (footprint.ts) washed in its goal's hue at 30%, with
// a line round it in a brighter tint of the hue at 70%, so the Overview shows which pods share a goal
// without reading a word, the way a plan colours each room's floor. A hue that changes cross-fades over 500 ms (eased in and out), never
// a pop; with less motion it changes at once.
import * as THREE from 'three';
import type { PodLetter } from '../../../shared/layout';
import { podZone, zoneOutline } from './footprint';

/** The zone's fill and outline strength, and how long a change of hue takes. */
export const ZONE_LOOK = { fill: 0.3, line: 0.7, lift: 0.5, fadeMs: 500 } as const;

const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

/** A color that eases to the next one it's given, each frame it's ticked. */
export class HueFade {
  readonly color = new THREE.Color();
  private from = new THREE.Color();
  private to = new THREE.Color();
  private at = -Infinity;
  private hex = '';

  constructor(hex: string) {
    this.hex = hex;
    this.color.set(hex);
    this.to.set(hex);
  }

  /** Toward `hex` from wherever it is now; `instant` lands there at once. */
  set(hex: string, now: number, instant: boolean) {
    if (hex === this.hex) return;
    this.hex = hex;
    this.from.copy(this.color);
    this.to.set(hex);
    this.at = instant ? -Infinity : now;
    if (instant) this.color.copy(this.to);
  }

  /** Moves it on to `now`; true while it's still on its way. */
  tick(now: number): boolean {
    const k = Math.min(1, (now - this.at) / ZONE_LOOK.fadeMs);
    if (k >= 1) {
      this.color.copy(this.to);
      return false;
    }
    this.color.lerpColors(this.from, this.to, easeInOut(Math.max(0, k)));
    return true;
  }
}

/** Every pod's zone, drawn in two calls whatever the number of pods: one fill, one outline. */
export interface Zones {
  readonly group: THREE.Group;
  /** Pod `letter`'s hue, eased toward over ZONE_LOOK.fadeMs unless `instant`. */
  setHue(letter: PodLetter, hex: string, now: number, instant: boolean): void;
  /** Moves the fades on; true while one is under way. */
  tick(now: number): boolean;
  /** Pod `letter`'s hue as it is this frame (its label's bar follows it). */
  color(letter: PodLetter): THREE.Color;
}

const WHITE = new THREE.Color('#ffffff');

/** How wide a zone's outline is (m): a band laid in the same mesh as the fill, about a pixel from the Overview. */
export const ZONE_LINE_W = 0.05;

/**
 * The zones of `letters`, each in `hex` to start with: every fill and every outline (a thin band along
 * its edge) merged into one mesh, each pod's hue and each part's strength in its own vertices' colors,
 * so all the pods cost the deck one draw call.
 */
export function makeZones(letters: readonly PodLetter[], hex: string): Zones {
  const pos: number[] = [];
  const index: number[] = [];
  /** Each vertex's strength: the fill's or the outline's. */
  const alpha: number[] = [];
  const ranges = new Map<PodLetter, { fill: [number, number]; line: [number, number]; fade: HueFade }>();
  for (const letter of letters) {
    const z = podZone(letter);
    const pts = zoneOutline(z);
    const y = z.h + 0.01;
    // The shape is drawn in x, y; turned so its y runs along the deck's z, and lifted to its tier.
    const geo = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, zz]) => new THREE.Vector2(x, zz)))).rotateX(Math.PI / 2).translate(0, y, 0);
    const base = pos.length / 3;
    pos.push(...Array.from(geo.getAttribute('position').array));
    for (const i of geo.getIndex()?.array ?? []) index.push(base + i);
    geo.dispose();
    const fillEnd = pos.length / 3;
    for (let i = base; i < fillEnd; i++) alpha.push(ZONE_LOOK.fill);
    // The outline: a band ZONE_LINE_W wide along each edge, a hair above the fill.
    pts.forEach(([x, zz], i) => {
      const [nx, nz] = pts[(i + 1) % pts.length];
      const len = Math.hypot(nx - x, nz - zz) || 1;
      const ox = (-(nz - zz) / len) * (ZONE_LINE_W / 2);
      const oz = ((nx - x) / len) * (ZONE_LINE_W / 2);
      const v = pos.length / 3;
      pos.push(x - ox, y + 0.002, zz - oz, x + ox, y + 0.002, zz + oz, nx - ox, y + 0.002, nz - oz, nx + ox, y + 0.002, nz + oz);
      index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      alpha.push(ZONE_LOOK.line, ZONE_LOOK.line, ZONE_LOOK.line, ZONE_LOOK.line);
    });
    ranges.set(letter, { fill: [base, fillEnd], line: [fillEnd, pos.length / 3], fade: new HueFade(hex) });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const colors = new Float32Array((pos.length / 3) * 4);
  alpha.forEach((a, i) => (colors[i * 4 + 3] = a));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geo.setIndex(index);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false }),
  );
  const group = new THREE.Group();
  group.name = 'pod-zones';
  mesh.renderOrder = 1;
  // Paint on the floor, never in the way: the crosshair's ray passes through.
  mesh.raycast = () => {};
  group.add(mesh);

  const col = geo.getAttribute('color') as THREE.BufferAttribute;
  const lifted = new THREE.Color();
  /** Writes pod `letter`'s hue into its vertices: the fill in it, the outline a brighter tint of it. */
  const paint = (letter: PodLetter) => {
    const r = ranges.get(letter)!;
    const c = r.fade.color;
    for (let i = r.fill[0]; i < r.fill[1]; i++) col.setXYZ(i, c.r, c.g, c.b);
    lifted.copy(c).lerp(WHITE, ZONE_LOOK.lift);
    for (let i = r.line[0]; i < r.line[1]; i++) col.setXYZ(i, lifted.r, lifted.g, lifted.b);
    col.needsUpdate = true;
  };
  for (const letter of letters) paint(letter);
  return {
    group,
    color: (letter) => ranges.get(letter)!.fade.color,
    setHue(letter, next, now, instant) {
      ranges.get(letter)!.fade.set(next, now, instant);
      paint(letter);
    },
    tick(now) {
      let going = false;
      for (const [letter, r] of ranges) {
        const was = r.fade.color.getHex();
        if (r.fade.tick(now)) going = true;
        if (r.fade.color.getHex() !== was) paint(letter);
      }
      return going;
    },
  };
}
