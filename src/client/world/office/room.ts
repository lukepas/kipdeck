import * as THREE from 'three';
import { BOARDS, MACHINE_MONITOR, MISSION_TABLE, PODS, POD_RADIUS, SEATING_BY_ID, SITUATION, TV } from '../../../shared/layout';
import { mesh, textPlane } from '../toon';
import type { Interactable } from '../types';
import type { Fixture } from './fixture';
import { DECK, box, contactShadow, flat, practical } from './materials';
import { wallBoard } from './props';
import { chair, seatable } from './seats';

// The deck past its walls and its seats: the situation wall curving round the north of the mission
// table (its standing panels, with Issues, Queue, Attention, Pull requests and Services on them), the
// capacity panel at the head of the Proof corner, the operator bench, and the light: a halo over the
// mission table and a bar over each pod.

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

/** The work boards on the situation wall's panels: Issues, Queue, Pull requests and Services. */
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
  return { handle: { boardMeshes } };
};

/**
 * The situation wall itself: a slate panel standing on the floor behind each board, turned to face the
 * table, a lit rule along its top and one under its board, so its curve reads from across the deck and
 * from the Overview. Nobody walks through it.
 */
export const situationWall: Fixture = (site) => {
  const slate = flat(DECK.wall);
  const rule = practical(DECK.gridMajor);
  const T = 0.16;
  for (const b of [BOARDS.issues, BOARDS.queue, TV, BOARDS.pulls, BOARDS.services]) {
    const nx = Math.sin(b.rotY);
    const nz = Math.cos(b.rotY);
    const panel = new THREE.Group();
    const w = SITUATION.width + 0.32;
    panel.add(mesh(box(w, SITUATION.top, T), slate, 0, SITUATION.top / 2, -T / 2 - 0.02));
    panel.add(mesh(box(w, 0.015, 0.03), rule, 0, SITUATION.top + 0.01, 0, false));
    panel.add(mesh(box(b.width, 0.015, 0.02), rule, 0, b.y - b.height / 2 - 0.12, 0.08, false));
    panel.add(contactShadow(w + 0.4, 1.0, 0, 0.2));
    panel.position.set(b.x, 0, b.z);
    panel.rotation.y = b.rotY;
    site.group.add(panel);
    // Its footprint, as short boxes along it (a collider is square to the axes).
    const tx = Math.cos(b.rotY);
    const tz = -Math.sin(b.rotY);
    for (let t = -w / 2 + 0.25; t <= w / 2 - 0.25 + 1e-6; t += 0.5) {
      const cx = b.x + tx * t - nx * (T / 2 + 0.02);
      const cz = b.z + tz * t - nz * (T / 2 + 0.02);
      site.colliders.push({ minX: cx - 0.2, maxX: cx + 0.2, minZ: cz - 0.2, maxZ: cz + 0.2, top: SITUATION.top });
    }
  }
  return {};
};

/** The Attention board, the middle of the situation wall due north of the table: the ranked list, or a shared screen. */
export const tv: Fixture<'tvScreen'> = (site) => {
  const nx = Math.sin(TV.rotY);
  const nz = Math.cos(TV.rotY);
  const { group: tvGroup, face: tvScreen } = wallBoard(TV.width, TV.height);
  tvGroup.position.set(TV.x + nx * 0.06, TV.y, TV.z + nz * 0.06);
  tvGroup.rotation.y = TV.rotY;
  site.group.add(tvGroup);
  const label = header('Attention');
  const w = (label.geometry.parameters.width * label.scale.x) / 2;
  const along = -TV.width / 2 + w;
  label.position.set(TV.x + nx * 0.08 + Math.cos(TV.rotY) * along, TV.y + TV.height / 2 + 0.32, TV.z + nz * 0.08 - Math.sin(TV.rotY) * along);
  label.rotation.y = TV.rotY;
  site.group.add(label);
  const it: Interactable = { kind: 'tv', x: TV.x + nx * 3, z: TV.z + nz * 3, radius: 3.2 };
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

/** The operator bench due north of the table, facing the Attention board, and a stool either side of it. */
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
  // Its top on the seat, so someone standing on the bench stands on it: along x or z, the way it's turned.
  const alongX = Math.abs(Math.cos(seat.rotY)) > 0.5;
  site.colliders.push(alongX ? { minX: seat.x - len / 2, maxX: seat.x + len / 2, minZ: seat.z - 0.5, maxZ: seat.z + 0.5, top: 0.46 } : { minX: seat.x - 0.5, maxX: seat.x + 0.5, minZ: seat.z - len / 2, maxZ: seat.z + len / 2, top: 0.46 });
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
