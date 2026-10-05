import * as THREE from 'three';
import type { AttentionCounts } from '../../../shared/attention';
import { BOARDS, TV } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { DECK, box, matte, practical } from '../../world/office/materials';
import { mergeByMaterial, mesh } from '../../world/toon';
import { OVER_WALL, canvasTexture, onBridgeLayer } from './shapes';
import { paintCountStrip } from './readouts';

// The situation wall as the bridge's forward displays: each board re-cased in a graphite bezel with a
// ship-cyan hairline over and under it, and the overhead strip hung from the canopy over the middle
// of the wall, repeating the top bar's counts in glyphs big enough to read from anywhere on the deck.
// Only the Attention board's own rows use a state's hue; the bezels and the strip's frame never do.

export interface Overhead {
  /** The strip's counts: the top bar's. */
  setCounts(c: AttentionCounts): void;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The overhead strip over the forward displays (features/bridge). */
    overhead: Overhead;
  }
}

/** The strip: radius round the table, angle it spans (radians, centred due north), its bottom and height. */
const STRIP = { r: 11.4, arc: 1.06, y: 4.5 + OVER_WALL.lift, h: 0.62 } as const;

/** A graphite bezel round a board (`b`: its middle, facing, size), with a lit hairline above and below. */
function bezel(into: THREE.Group, b: { x: number; y: number; z: number; rotY: number; width: number; height: number }) {
  const frame = matte('#1A212A', { metalness: 0.3, roughness: 0.55 });
  const lit = practical(DECK.shipDim);
  const g = new THREE.Group();
  const F = 0.09;
  const D = 0.1;
  const w = b.width + 0.08;
  const h = b.height + 0.08;
  g.add(mesh(box(w + 2 * F, F, D), frame, 0, h / 2 + F / 2, 0, false));
  g.add(mesh(box(w + 2 * F, F, D), frame, 0, -h / 2 - F / 2, 0, false));
  for (const s of [-1, 1]) g.add(mesh(box(F, h, D), frame, s * (w / 2 + F / 2), 0, 0, false));
  g.add(mesh(box(w, 0.014, 0.014), lit, 0, h / 2 + F + 0.012, D / 2 - 0.01, false));
  g.add(mesh(box(w, 0.014, 0.014), lit, 0, -h / 2 - F - 0.012, D / 2 - 0.01, false));
  // Out from the wall the way the board faces, flush with its face.
  const nx = Math.sin(b.rotY);
  const nz = Math.cos(b.rotY);
  g.position.set(b.x + nx * 0.08, b.y, b.z + nz * 0.08);
  g.rotation.y = b.rotY;
  into.add(g);
}

export const displays: Fixture<'overhead'> = (site) => {
  const bezels = new THREE.Group();
  for (const b of [BOARDS.issues, BOARDS.queue, TV, BOARDS.pulls, BOARDS.services]) bezel(bezels, b);
  site.group.add(mergeByMaterial(bezels));

  // The overhead strip: the inside of a slice of cylinder round the table, so it faces the deck all along.
  const { canvas, g, texture } = canvasTexture(2560, 132);
  texture.wrapS = THREE.RepeatWrapping;
  // Seen from inside, the cylinder's u runs right to left.
  texture.repeat.x = -1;
  texture.offset.x = 1;
  const start = Math.PI - STRIP.arc / 2;
  const strip = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CylinderGeometry(STRIP.r, STRIP.r, STRIP.h, 48, 1, true, start, STRIP.arc), new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, toneMapped: false }));
  face.position.set(OVER_WALL.x, STRIP.y + STRIP.h / 2, OVER_WALL.z);
  strip.add(face);
  const rim = matte(DECK.hull, { metalness: 0.35, roughness: 0.55 });
  const parts = new THREE.Group();
  for (const y of [STRIP.y - 0.03, STRIP.y + STRIP.h + 0.03]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(STRIP.r - 0.02, 0.04, 6, 48, STRIP.arc).rotateX(Math.PI / 2).rotateY(Math.PI / 2 + STRIP.arc / 2), rim);
    t.position.set(OVER_WALL.x, y, OVER_WALL.z);
    parts.add(t);
  }
  // Hung from the canopy on two rods.
  for (const s of [-1, 1]) {
    const a = -Math.PI / 2 + s * (STRIP.arc / 2 - 0.05);
    const x = OVER_WALL.x + Math.cos(a) * STRIP.r;
    const z = OVER_WALL.z + Math.sin(a) * STRIP.r;
    const top = 7.7;
    parts.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, top - STRIP.y - STRIP.h, 6), rim, x, (top + STRIP.y + STRIP.h) / 2, z, false));
  }
  strip.add(mergeByMaterial(parts));
  site.group.add(onBridgeLayer(strip));

  let key = '';
  const setCounts = (c: AttentionCounts) => {
    const k = JSON.stringify(c);
    if (k === key) return;
    key = k;
    paintCountStrip(g, canvas.width, canvas.height, c);
    texture.needsUpdate = true;
  };
  setCounts({ 'needs-you': 0, stuck: 0, review: 0, working: 0, parked: 0 });
  return { handle: { overhead: { setCounts } } };
};
