import * as THREE from 'three';
import { CANOPY } from '../bridge/shapes';

// The canopy's ribs on the deck: the table's spot (features/lights/rig.ts) carries a cookie, a small
// texture of the canopy's radial ribs and its halo ring, so the light it throws on the table and the
// deck round it is broken by their shadows. It's set once at load (a spot with a map is part of every
// lit material's program, so it's compiled once there, behind the loading screen), and after that
// only its contrast and its turn change: the contrast by writing the texture again (64 KB, only while
// it eases), the turn through the spot's projection (its shadow camera's up). At zero contrast it is
// plain white, the spot as it was.

/** The cookie's size (px). */
const SIZE = 128;
/** The halo ring's radius in the cookie (0-1 of its half-width), and the ribs' and ring's half-width. */
const RING = { r: 0.34, w: 0.05 } as const;
const RIB_W = 0.07;
/** How dark a rib's shadow is at full contrast (the light under it is 1 minus this). */
export const RIB_SHADE = 0.55;

/** How much of the light each texel loses to a rib or the ring at full contrast (0-1), soft-edged. */
export function ribMask(size = SIZE): Float32Array {
  const out = new Float32Array(size * size);
  const step = (Math.PI * 2) / CANOPY.ribs;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = ((i + 0.5) / size) * 2 - 1;
      const y = ((j + 0.5) / size) * 2 - 1;
      const r = Math.hypot(x, y);
      const a = Math.atan2(y, x);
      // How far round from the nearest rib, as a distance across at this radius.
      const m = ((a % step) + step) % step;
      const off = Math.min(m, step - m) * Math.max(r, 0.05);
      const rib = r > RING.r ? 1 - smooth(RIB_W * 0.4, RIB_W, off) : 0;
      const ring = 1 - smooth(RING.w * 0.4, RING.w, Math.abs(r - RING.r));
      out[j * size + i] = Math.max(rib, ring);
    }
  }
  return out;
}

function smooth(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class Cookie {
  readonly texture: THREE.DataTexture;
  private readonly mask = ribMask();
  private readonly data = new Uint8Array(SIZE * SIZE * 4);
  private shown = -1;
  private turned = Number.NaN;

  constructor(private readonly spot: THREE.SpotLight) {
    this.texture = new THREE.DataTexture(this.data, SIZE, SIZE, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.contrast(0);
    spot.map = this.texture;
    // The spot's projection is a square over its cone.
    spot.shadow.mapSize.set(SIZE, SIZE);
    this.turn(0);
  }

  /** How strongly the ribs show (0 the plain spot, 1 their full shadow). Writes the texture only when it changes. */
  contrast(k: number) {
    const c = Math.round(Math.min(1, Math.max(0, k)) * 100) / 100;
    if (c === this.shown) return;
    this.shown = c;
    const d = this.data;
    for (let i = 0; i < this.mask.length; i++) {
      const v = Math.round(255 * (1 - this.mask[i] * RIB_SHADE * c));
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      d[i * 4 + 3] = 255;
    }
    this.texture.needsUpdate = true;
  }

  /** Turns the ribs to `angle` (radians) round the spot's axis. */
  turn(angle: number) {
    if (angle === this.turned) return;
    this.turned = angle;
    this.spot.shadow.camera.up.set(Math.cos(angle), 0, Math.sin(angle));
  }
}
