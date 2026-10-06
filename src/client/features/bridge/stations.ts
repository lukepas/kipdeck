import * as THREE from 'three';
import { DESKS, DESK_SIZE, heightAt } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { DECK, matte } from '../../world/office/materials';
import { CONN_GOLD } from './conn';

// The consoles as bridge stations: a hull fin at each end of every console, under the sightline, a
// ship-cyan trace along the edge of its top where its unit's hands rest, and a warm gold practical in
// its footwell with the soft pool it throws on the deck (the warm half of the room's warm and cool key:
// the stations glow warm against the cool violet starlight on the hull). Four instanced meshes for all
// sixteen. A trace's brightness is the station's to set (how busy it is); it starts dim. The footwell
// light is steady: it is the room's, never a state's.

export interface Stations {
  /** How lit `deskId`'s trace is: 0 dark (a dead station), 1 full ship-cyan. */
  trace(deskId: string, k: number): void;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The consoles' fins and traces (features/bridge). */
    stations: Stations;
  }
}

/** How lit a trace is until a station says otherwise. */
const RESTING = 0.45;

export const stations: Fixture<'stations'> = (site) => {
  const { width, depth, height } = DESK_SIZE;
  const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.92, depth - 0.12), matte(DECK.hull, { metalness: 0.35, roughness: 0.55 }), DESKS.length * 2);
  const traces = new THREE.InstancedMesh(new THREE.BoxGeometry(width - 0.24, 0.018, 0.01), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), DESKS.length);
  const place = new THREE.Object3D();
  const local = new THREE.Object3D();
  place.add(local);
  const lit = new THREE.Color(DECK.ship);
  const black = new THREE.Color(DECK.instrument);
  const tint = new THREE.Color();
  const index = new Map<string, number>();
  DESKS.forEach((d, i) => {
    index.set(d.id, i);
    place.position.set(d.x, heightAt(d.x, d.z), d.z);
    place.rotation.set(0, d.rotY, 0);
    for (const [k, s] of [-1, 1].entries()) {
      local.position.set(s * (width / 2 + 0.03), 0.46, -0.06);
      local.updateMatrixWorld(true);
      fins.setMatrixAt(i * 2 + k, local.matrixWorld);
    }
    // Under the top's front edge, toward the unit.
    local.position.set(0, height - 0.045, depth / 2 + 0.006);
    local.updateMatrixWorld(true);
    traces.setMatrixAt(i, local.matrixWorld);
    traces.setColorAt(i, tint.copy(black).lerp(lit, RESTING));
  });
  // The footwell: a lit strip under the console's front on the unit's side, and its pool on the deck.
  const strip = new THREE.InstancedMesh(new THREE.BoxGeometry(width - 0.3, 0.014, 0.014), new THREE.MeshBasicMaterial({ color: new THREE.Color(CONN_GOLD).multiplyScalar(0.9), toneMapped: false, fog: false }), DESKS.length);
  const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(width + 0.5, 1.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(CONN_GOLD).multiplyScalar(0.55), map: poolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }), DESKS.length);
  DESKS.forEach((d, i) => {
    place.position.set(d.x, heightAt(d.x, d.z), d.z);
    place.rotation.set(0, d.rotY, 0);
    local.position.set(0, 0.07, depth / 2 + 0.01);
    local.updateMatrixWorld(true);
    strip.setMatrixAt(i, local.matrixWorld);
    local.position.set(0, 0.012, depth / 2 + 0.35);
    local.updateMatrixWorld(true);
    pool.setMatrixAt(i, local.matrixWorld);
  });
  strip.name = 'station-footwells';
  pool.name = 'station-footwell-pools';
  pool.renderOrder = 1;
  for (const m of [strip, pool]) {
    m.computeBoundingSphere();
    m.castShadow = false;
    m.receiveShadow = false;
  }
  site.group.add(strip, pool);
  fins.castShadow = true;
  fins.receiveShadow = true;
  site.group.add(fins, traces);
  const trace = (deskId: string, k: number) => {
    const i = index.get(deskId);
    if (i === undefined) return;
    traces.setColorAt(i, tint.copy(black).lerp(lit, Math.max(0, Math.min(1, k))));
    traces.instanceColor!.needsUpdate = true;
  };
  return { handle: { stations: { trace } } };
};

/** A soft pool of light, brightest at the console's foot and falling off out onto the deck: drawn once. */
function poolTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 0, 2, 32, 0, 60);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
