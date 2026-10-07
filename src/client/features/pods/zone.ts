// A pod's zone on the floor: its slice of the tier (footprint.ts) washed in its goal's hue at 14%, with
// a hairline round it in a brighter tint of the hue at 40%, so the Overview shows which pods share a
// goal without reading a word. A hue that changes cross-fades over 500 ms (eased in and out), never
// a pop; with less motion it changes at once.
import * as THREE from 'three';
import type { PodLetter } from '../../../shared/layout';
import { podZone, zoneOutline } from './footprint';

/** The zone's fill and outline strength, and how long a change of hue takes. */
export const ZONE_LOOK = { fill: 0.14, line: 0.4, lift: 0.35, fadeMs: 500 } as const;

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

export interface Zone {
  readonly group: THREE.Group;
  /** Its hue, eased toward over ZONE_LOOK.fadeMs unless `instant`. */
  setHue(hex: string, now: number, instant: boolean): void;
  /** Moves the fade on; true while one is under way. */
  tick(now: number): boolean;
  /** The hue as it is this frame (the label's bar follows it). */
  readonly color: THREE.Color;
}

const WHITE = new THREE.Color('#ffffff');

/** Pod `letter`'s zone, in `hex` to start with. */
export function makeZone(letter: PodLetter, hex: string): Zone {
  const z = podZone(letter);
  const pts = zoneOutline(z);
  const shape = new THREE.Shape(pts.map(([x, zz]) => new THREE.Vector2(x, zz)));
  // The shape is drawn in x, y; turned so its y runs along the deck's z.
  const fillGeo = new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2);
  const fill = new THREE.Mesh(
    fillGeo,
    new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: ZONE_LOOK.fill, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false }),
  );
  const lineGeo = new THREE.BufferGeometry().setFromPoints(pts.map(([x, zz]) => new THREE.Vector3(x, 0, zz)));
  const lineMat = new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity: ZONE_LOOK.line, depthWrite: false, toneMapped: false });
  const line = new THREE.LineLoop(lineGeo, lineMat);
  const group = new THREE.Group();
  group.name = `pod-zone-${letter}`;
  group.position.y = z.h + 0.01;
  fill.renderOrder = 1;
  line.renderOrder = 2;
  group.add(fill, line);

  const fade = new HueFade(hex);
  const paint = () => {
    (fill.material as THREE.MeshBasicMaterial).color.copy(fade.color);
    lineMat.color.copy(fade.color).lerp(WHITE, ZONE_LOOK.lift);
  };
  paint();
  return {
    group,
    color: fade.color,
    setHue(next, now, instant) {
      fade.set(next, now, instant);
      paint();
    },
    tick(now) {
      const going = fade.tick(now);
      paint();
      return going;
    },
  };
}
