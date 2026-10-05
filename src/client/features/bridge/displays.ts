import * as THREE from 'three';
import { BOARDS, MACHINE_MONITOR, TV } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { DECK, box, matte, practical } from '../../world/office/materials';
import { mergeByMaterial, mesh } from '../../world/toon';

// The situation arc as the bridge's forward displays: each board (and the capacity strip) re-cased in a
// graphite bezel with a ship-cyan hairline over and under it. The counts are the Attention board's own
// band, big enough to read from anywhere on the deck, so nothing hangs over the arc to repeat them.
// Only the Attention board's own rows use a state's hue; the bezels never do.

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

export const displays: Fixture = (site) => {
  const bezels = new THREE.Group();
  for (const b of [BOARDS.issues, BOARDS.queue, TV, MACHINE_MONITOR, BOARDS.pulls, BOARDS.services]) bezel(bezels, b);
  site.group.add(mergeByMaterial(bezels));
  return {};
};
