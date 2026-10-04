import * as THREE from 'three';
import { BOARDS, MACHINE_MONITOR, MISSION_TABLE, PODS, POD_RADIUS, SEATING_BY_ID, TV } from '../../../shared/layout';
import { mesh, textPlane } from '../toon';
import type { Interactable } from '../types';
import type { Fixture } from './fixture';
import { DECK, box, contactShadow, flat, practical } from './materials';
import { wallBoard } from './props';
import { chair, seatable } from './seats';

// The deck past its walls and its seats: the Main board's panels and the Services board, the
// Attention board (the TV's slot), the capacity panel at the head of the Proof corner, the operator
// bench, and the light: a halo over the mission table and a bar over each pod.

declare module '../types' {
  interface OfficeHandles {
    boardMeshes: Record<keyof typeof BOARDS, THREE.Mesh>;
    tvScreen: THREE.Mesh;
    /** The capacity panel on the west wall: how busy the office's machine is (features/boards/machine.ts). */
    machineScreen: THREE.Mesh;
  }
}

/** A board's header: its name in the wide stencil face, small and muted, over its top edge. */
function header(text: string, size = 64): ReturnType<typeof textPlane> {
  const label = textPlane(text.toUpperCase(), { face: 'display', size, color: DECK.muted, track: 0.08 });
  label.scale.multiplyScalar(0.9);
  return label;
}

/** The Main board on the north wall, three panels edge to edge, and the Services board on the east wall. */
export const boards: Fixture<'boardMeshes'> = (site) => {
  const boardMeshes = {} as Record<keyof typeof BOARDS, THREE.Mesh>;
  for (const key of Object.keys(BOARDS) as (keyof typeof BOARDS)[]) {
    const b = BOARDS[key];
    // Out from the wall, the way the board faces.
    const nx = Math.sin(b.rotY);
    const nz = Math.cos(b.rotY);
    const { group: bg, face } = wallBoard(b.width, b.height);
    bg.position.set(b.x + nx * 0.06, b.y, b.z + nz * 0.06);
    bg.rotation.y = b.rotY;
    site.group.add(bg);
    boardMeshes[key] = face;
    const label = header(b.label);
    // Its left end lined up with the panel's, the way a drawing's title sits.
    const w = (label.geometry.parameters.width * label.scale.x) / 2;
    const along = -b.width / 2 + w;
    label.position.set(b.x + nx * 0.04 + Math.cos(b.rotY) * along, b.y + b.height / 2 + 0.32, b.z + nz * 0.04 - Math.sin(b.rotY) * along);
    label.rotation.y = b.rotY;
    site.group.add(label);
    const it: Interactable = { kind: key, x: b.x + nx * 1.6, z: b.z + nz * 1.6, radius: 2.4 };
    site.interactables.push(it);
    bg.userData.interact = it;
  }
  // A lit rule under the Main board, the length of its three panels.
  const main = [BOARDS.issues, BOARDS.queue, BOARDS.pulls];
  const x0 = Math.min(...main.map((b) => b.x - b.width / 2));
  const x1 = Math.max(...main.map((b) => b.x + b.width / 2));
  const y = BOARDS.issues.y - BOARDS.issues.height / 2 - 0.12;
  site.group.add(mesh(box(x1 - x0, 0.015, 0.02), practical(DECK.gridMajor), (x0 + x1) / 2, y, BOARDS.issues.z + 0.1, false));
  return { handle: { boardMeshes } };
};

/** The Attention board on the east wall, in the TV's slot: the ranked list, or a shared screen. */
export const tv: Fixture<'tvScreen'> = (site) => {
  const { group: tvGroup, face: tvScreen } = wallBoard(TV.width, TV.height);
  tvGroup.position.set(TV.x - 0.06, TV.y, TV.z);
  tvGroup.rotation.y = -Math.PI / 2;
  site.group.add(tvGroup);
  const label = header('Attention');
  const w = (label.geometry.parameters.width * label.scale.x) / 2;
  label.position.set(TV.x - 0.08, TV.y + TV.height / 2 + 0.32, TV.z + TV.width / 2 - w);
  label.rotation.y = -Math.PI / 2;
  site.group.add(label);
  const it: Interactable = { kind: 'tv', x: TV.x - 4.5, z: TV.z, radius: 3.2 };
  site.interactables.push(it);
  tvGroup.userData.interact = it;
  return { handle: { tvScreen } };
};

/** The capacity panel at the head of the Proof corner, on the west wall facing the deck. */
export const machineMonitor: Fixture<'machineScreen'> = (site) => {
  const { group: monitor, face: machineScreen } = wallBoard(MACHINE_MONITOR.width, MACHINE_MONITOR.height);
  monitor.position.set(MACHINE_MONITOR.x + 0.06, MACHINE_MONITOR.y, MACHINE_MONITOR.z);
  monitor.rotation.y = Math.PI / 2;
  site.group.add(monitor);
  const label = header('Capacity', 52);
  const w = (label.geometry.parameters.width * label.scale.x) / 2;
  label.position.set(MACHINE_MONITOR.x + 0.08, MACHINE_MONITOR.y + MACHINE_MONITOR.height / 2 + 0.28, MACHINE_MONITOR.z - MACHINE_MONITOR.width / 2 + w);
  label.rotation.y = Math.PI / 2;
  site.group.add(label);
  return { handle: { machineScreen } };
};

/** The operator bench in the east aisle, facing the Attention board, and a stool either side of it. */
export const lounge: Fixture = (site) => {
  const seat = SEATING_BY_ID.get('couch')!;
  const bench = new THREE.Group();
  // Built along x facing +z, then turned to face the board.
  const len = 4.2;
  bench.add(mesh(box(len, 0.4, 0.7), flat(DECK.console), 0, 0.2, 0));
  bench.add(mesh(box(len - 0.06, 0.06, 0.64), flat(DECK.consoleTop), 0, 0.43, 0));
  bench.add(mesh(box(len, 0.36, 0.1), flat(DECK.console), 0, 0.64, -0.32));
  bench.add(contactShadow(len + 0.6, 1.4));
  bench.position.set(seat.x, 0, seat.z);
  bench.rotation.y = seat.rotY;
  site.group.add(bench);
  // Its top on the seat, so someone standing on the bench stands on it.
  site.colliders.push({ minX: seat.x - 0.5, maxX: seat.x + 0.5, minZ: seat.z - len / 2, maxZ: seat.z + len / 2, top: 0.46 });
  seatable(bench, 'couch', 2.6, site.interactables);

  for (const id of ['lounge-beanbag-1', 'lounge-beanbag-2']) {
    const s = SEATING_BY_ID.get(id)!;
    const stool = chair();
    stool.position.set(s.x, 0, s.z);
    stool.rotation.y = s.rotY;
    stool.add(contactShadow(0.9, 0.9));
    site.group.add(stool);
    site.colliders.push({ minX: s.x - 0.3, maxX: s.x + 0.3, minZ: s.z - 0.3, maxZ: s.z + 0.3, top: 0.42 });
    seatable(stool, id, 1.4, site.interactables);
  }
  return {};
};

/** How high the pods' spots hang over the deck. */
const LIGHT_Y = 5.2;

/**
 * The deck's pooled light: a spot over each pod, down onto its arc of consoles, and a soft one over
 * the mission table. They throw no shadows (the key light does, see core/scene.ts), and nothing
 * is drawn for them: the light is the fitting.
 */
export const lamps: Fixture = (site) => {
  for (const pod of PODS) {
    const r = POD_RADIUS - 0.4;
    const x = MISSION_TABLE.x + Math.cos(pod.angle) * r;
    const z = MISSION_TABLE.z + Math.sin(pod.angle) * r;
    const spot = new THREE.SpotLight('#DCE3EA', 90, 13, 0.6, 0.65, 1.3);
    spot.position.set(x, LIGHT_Y, z);
    spot.target.position.set(x, 0, z);
    site.group.add(spot, spot.target);
  }
  const table = new THREE.SpotLight('#C9D2DC', 60, 11, 0.5, 0.7, 1.3);
  table.position.set(MISSION_TABLE.x, LIGHT_Y + 0.6, MISSION_TABLE.z);
  table.target.position.set(MISSION_TABLE.x, 0, MISSION_TABLE.z);
  site.group.add(table, table.target);
  return {};
};
