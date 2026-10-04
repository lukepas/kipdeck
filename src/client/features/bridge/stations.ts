import * as THREE from 'three';
import { DESKS, DESK_SIZE } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { DECK, matte } from '../../world/office/materials';

// The consoles as bridge stations: a hull fin at each end of every console, under the sightline, and
// a ship-cyan trace along the edge of its top where its unit's hands rest. Two instanced meshes for all
// sixteen. A trace's brightness is the station's to set (how busy it is); it starts dim.

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
    place.position.set(d.x, 0, d.z);
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
