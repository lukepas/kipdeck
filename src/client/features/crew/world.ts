import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PROOF_CORNER } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { DECK } from '../../world/office/materials';
import { onBridgeLayer } from '../bridge/shapes';

// The unit of the watch on the Proof corner's plinth: a still hologram of a unit in cool white light
// standing on the top step, a soft cone of key light over it from the ceiling, and a plaque floating
// over it with its call sign, its epithet and its record on the last watch. All achromatic: the plinth's
// own violet steps stay the only proof colour there. On the bridge layer, never in the Overview.
// Three draw calls while someone stands there, none otherwise.

export interface WatchPlinth {
  /** Puts a unit on the plinth with the plaque's lines, or clears it (null). */
  set(lines: string[] | null): void;
  /** Turns the hologram on `dt` seconds at `k` times its pace (0 holds it): a turn a minute. */
  turn(dt: number, k: number): void;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The unit of the watch on the Proof corner's plinth (features/crew). */
    watch: WatchPlinth;
  }
}

/** Cool white, a touch of blue: the key light's colour, never a state's. */
const KEY = '#DCE7F0';

/** A unit's silhouette, as the hologram draws it: hover base, column, torso, head. Unscaled it stands 1.3 m. */
function silhouette(): THREE.BufferGeometry {
  const parts = [
    new THREE.CylinderGeometry(0.17, 0.2, 0.05, 12).translate(0, 0.12, 0),
    new THREE.CylinderGeometry(0.085, 0.15, 0.3, 8).translate(0, 0.3, 0),
    new THREE.CapsuleGeometry(0.19, 0.22, 3, 10).scale(1, 1, 0.8).translate(0, 0.8, 0),
    new THREE.BoxGeometry(0.34, 0.2, 0.26).translate(0, 1.19, 0),
    new THREE.CylinderGeometry(0.036, 0.018, 0.34, 4).translate(0.25, 0.78, 0.03),
    new THREE.CylinderGeometry(0.036, 0.018, 0.34, 4).translate(-0.25, 0.78, 0.03),
  ];
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
}

/** A vertical fade for the cone of light: bright at the top, gone at the floor's end. */
function fadeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0.0)');
  grad.addColorStop(0.15, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0.05)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const watchPlinth: Fixture<'watch'> = (site) => {
  const p = PROOF_CORNER.plinth;
  const top = p.steps * p.rise;
  const group = new THREE.Group();
  group.name = 'watch-plinth';

  const holoMat = new THREE.MeshBasicMaterial({ color: KEY, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const figure = new THREE.Mesh(silhouette(), holoMat);
  figure.scale.setScalar(0.58);
  figure.position.set(p.x, top + 0.02, p.z);
  figure.rotation.y = Math.PI / 2;
  group.add(figure);

  const coneH = 3.4;
  const coneMat = new THREE.MeshBasicMaterial({ color: KEY, map: fadeTexture(), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.62, coneH, 24, 1, true), coneMat);
  cone.position.set(p.x, top + coneH / 2, p.z);
  group.add(cone);

  const plaque = document.createElement('canvas');
  plaque.width = 1024;
  plaque.height = 240;
  const plaqueTex = new THREE.CanvasTexture(plaque);
  plaqueTex.colorSpace = THREE.SRGBColorSpace;
  plaqueTex.anisotropy = 4;
  // The plaque floats over the plinth's deck side, above the figure's head, facing into the room.
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25 * (240 / 1024)), new THREE.MeshBasicMaterial({ map: plaqueTex, transparent: true, toneMapped: false, depthWrite: false }));
  board.position.set(p.x + 0.35, top + 1.2, p.z);
  board.rotation.y = Math.PI / 2;
  group.add(board);

  site.group.add(onBridgeLayer(group));
  group.visible = false;

  const paint = (lines: string[]) => {
    const g = plaque.getContext('2d')!;
    g.clearRect(0, 0, plaque.width, plaque.height);
    g.fillStyle = 'rgba(11, 18, 25, 0.88)';
    g.fillRect(0, 0, plaque.width, plaque.height);
    g.fillStyle = DECK.steel;
    g.fillRect(0, 0, plaque.width, 3);
    g.fillRect(0, plaque.height - 3, plaque.width, 3);
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    const [head, who, record] = lines;
    g.font = '500 30px "JetBrains Mono", ui-monospace, monospace';
    g.fillStyle = DECK.muted;
    g.fillText(head ?? '', plaque.width / 2, 48);
    g.font = '600 64px Archivo, system-ui, sans-serif';
    g.fillStyle = DECK.text;
    g.fillText(who ?? '', plaque.width / 2, 118, plaque.width - 60);
    g.font = '500 28px "JetBrains Mono", ui-monospace, monospace';
    g.fillStyle = DECK.steelLight;
    g.fillText(record ?? '', plaque.width / 2, 190, plaque.width - 60);
    plaqueTex.needsUpdate = true;
  };

  let shown = '';
  const watch: WatchPlinth = {
    set(lines) {
      const key = lines ? lines.join('\n') : '';
      if (key === shown) return;
      shown = key;
      group.visible = !!lines;
      if (lines) paint(lines);
    },
    turn(dt, k) {
      figure.rotation.y += ((Math.PI * 2) / 60) * dt * k;
    },
  };
  return { handle: { watch } };
};
