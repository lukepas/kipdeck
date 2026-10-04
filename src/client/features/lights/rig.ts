import * as THREE from 'three';
import { MISSION_TABLE, PODS, POD_RADIUS } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { LIGHT_MODES } from './modes';

/** The deck's own lamps, which the lights' mode retunes (features/lights). */
export interface Lamps {
  /** A spot over each pod, down onto its arc of consoles. */
  pods: THREE.SpotLight[];
  /** The soft spot over the mission table. */
  table: THREE.SpotLight;
  /** The holo table's uplight, glowing up from inside it. */
  holo: THREE.PointLight;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The pods' spots, the table's and the holo's uplight (features/lights). */
    lamps: Lamps;
  }
}

/** How high the pods' spots hang over the deck. */
const LIGHT_Y = 5.2;

/**
 * The deck's pooled light: a spot over each pod, down onto its arc of consoles, a soft one over the
 * mission table, and a cyan uplight in the table under the holo course plot. They throw no shadows
 * (the key light does, see core/scene.ts), and nothing is drawn for them: the light is the fitting.
 * They start at Night's levels; the lights' mode retunes them.
 */
export const lamps: Fixture<'lamps'> = (site) => {
  const night = LIGHT_MODES.night;
  const pods: THREE.SpotLight[] = [];
  for (const pod of PODS) {
    const r = POD_RADIUS - 0.4;
    const x = MISSION_TABLE.x + Math.cos(pod.angle) * r;
    const z = MISSION_TABLE.z + Math.sin(pod.angle) * r;
    const spot = new THREE.SpotLight(night.pods.color, night.pods.i, 13, 0.6, 0.65, 1.3);
    spot.position.set(x, LIGHT_Y, z);
    spot.target.position.set(x, 0, z);
    site.group.add(spot, spot.target);
    pods.push(spot);
  }
  const table = new THREE.SpotLight(night.table.color, night.table.i, 11, 0.5, 0.7, 1.3);
  table.position.set(MISSION_TABLE.x, LIGHT_Y + 0.6, MISSION_TABLE.z);
  table.target.position.set(MISSION_TABLE.x, 0, MISSION_TABLE.z);
  site.group.add(table, table.target);
  // Just over the top's rim, so it lights the faces round the table and the console fronts facing it.
  const holo = new THREE.PointLight(night.holo.color, night.holo.i, 9, 2);
  holo.position.set(MISSION_TABLE.x, MISSION_TABLE.h + 0.5, MISSION_TABLE.z);
  site.group.add(holo);
  return { handle: { lamps: { pods, table, holo } } };
};
