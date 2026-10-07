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

/**
 * The zones of `letters`, each in `hex` to start with: their fills merged into one mesh and their
 * outlines into one set of line segments, each pod's hue in its own vertices' colors, so the pods
 * cost the deck two draw calls rather than two each.
 */
export function makeZones(letters: readonly PodLetter[], hex: string): Zones {
  const fillPos: number[] = [];
  const fillIndex: number[] = [];
  const linePos: number[] = [];
  const ranges = new Map<PodLetter, { fill: [number, number]; line: [number, number]; fade: HueFade }>();
  for (const letter of letters) {
    const z = podZone(letter);
    const pts = zoneOutline(z);
    const y = z.h + 0.01;
    // The shape is drawn in x, y; turned so its y runs along the deck's z, and lifted to its tier.
    const geo = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, zz]) => new THREE.Vector2(x, zz)))).rotateX(Math.PI / 2).translate(0, y, 0);
    const base = fillPos.length / 3;
    fillPos.push(...Array.from(geo.getAttribute('position').array));
    for (const i of geo.getIndex()?.array ?? []) fillIndex.push(base + i);
    geo.dispose();
    const lineBase = linePos.length / 3;
    pts.forEach(([x, zz], i) => {
      const [nx, nz] = pts[(i + 1) % pts.length];
      linePos.push(x, y, zz, nx, y, nz);
    });
    ranges.set(letter, { fill: [base, fillPos.length / 3], line: [lineBase, linePos.length / 3], fade: new HueFade(hex) });
  }
  const fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(fillPos, 3));
  fillGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(fillPos.length), 3));
  fillGeo.setIndex(fillIndex);
  const fill = new THREE.Mesh(
    fillGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: ZONE_LOOK.fill, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false }),
  );
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
  lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(linePos.length), 3));
  const line = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: ZONE_LOOK.line, depthWrite: false, toneMapped: false }));
  const group = new THREE.Group();
  group.name = 'pod-zones';
  fill.renderOrder = 1;
  line.renderOrder = 2;
  // Paint on the floor, never in the way: the crosshair's ray passes through (a line's pick reaches a
  // metre either side of it, and would stand between you and a unit as if it were a wall).
  fill.raycast = line.raycast = () => {};
  group.add(fill, line);

  const fillCol = fillGeo.getAttribute('color') as THREE.BufferAttribute;
  const lineCol = lineGeo.getAttribute('color') as THREE.BufferAttribute;
  const lifted = new THREE.Color();
  /** Writes pod `letter`'s hue into its vertices: the fill in it, the outline a brighter tint of it. */
  const paint = (letter: PodLetter) => {
    const r = ranges.get(letter)!;
    const c = r.fade.color;
    for (let i = r.fill[0]; i < r.fill[1]; i++) fillCol.setXYZ(i, c.r, c.g, c.b);
    lifted.copy(c).lerp(WHITE, ZONE_LOOK.lift);
    for (let i = r.line[0]; i < r.line[1]; i++) lineCol.setXYZ(i, lifted.r, lifted.g, lifted.b);
    fillCol.needsUpdate = true;
    lineCol.needsUpdate = true;
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
