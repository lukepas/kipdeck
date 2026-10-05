import * as THREE from 'three';
import { BOARDS, MACHINE_MONITOR, SEATING_BY_ID, TV } from '../../../shared/layout';
import { mesh } from '../toon';
import type { Interactable } from '../types';
import type { Fixture } from './fixture';
import { DECK, box, contactShadow, flat } from './materials';
import { wallBoard } from './props';
import { chair, seatable } from './seats';

// The deck past its walls and its seats: the boards of the situation arc hung north of the mission
// table (Issues, Queue, Attention, Pull requests and Services; the arc's own structure is
// features/amphitheater/arc.ts), the capacity strip under the Attention board and the operator bench. The lamps over the pods and the
// table are the lights' (features/lights/rig.ts).

declare module '../types' {
  interface OfficeHandles {
    boardMeshes: Record<keyof typeof BOARDS, THREE.Mesh>;
    tvScreen: THREE.Mesh;
    /** The capacity strip under the Attention board: how busy the office's machine is (features/boards/machine.ts). */
    machineScreen: THREE.Mesh;
  }
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
    // Its name is painted in its own title bar (features/boards/screen.ts), not hung over it, where
    // the overhead strip would hide it from the conn.
    const it: Interactable = { kind: key, x: b.x + nx * 1.6, z: b.z + nz * 1.6, radius: 2.4 };
    site.interactables.push(it);
    bg.userData.interact = it;
  }
  return { handle: { boardMeshes } };
};

/** The Attention board, the middle of the situation wall due north of the table: the ranked list, or a shared screen. */
export const tv: Fixture<'tvScreen'> = (site) => {
  const nx = Math.sin(TV.rotY);
  const nz = Math.cos(TV.rotY);
  const { group: tvGroup, face: tvScreen } = wallBoard(TV.width, TV.height);
  tvGroup.position.set(TV.x + nx * 0.06, TV.y, TV.z + nz * 0.06);
  tvGroup.rotation.y = TV.rotY;
  site.group.add(tvGroup);
  const it: Interactable = { kind: 'tv', x: TV.x + nx * 3, z: TV.z + nz * 3, radius: 3.2 };
  site.interactables.push(it);
  tvGroup.userData.interact = it;
  return { handle: { tvScreen } };
};

/** The capacity strip along the foot of the situation arc, under the Attention board, facing the conn. */
export const machineMonitor: Fixture<'machineScreen'> = (site) => {
  const { group: monitor, face: machineScreen } = wallBoard(MACHINE_MONITOR.width, MACHINE_MONITOR.height);
  const m = MACHINE_MONITOR;
  monitor.position.set(m.x + Math.sin(m.rotY) * 0.06, m.y, m.z + Math.cos(m.rotY) * 0.06);
  monitor.rotation.y = m.rotY;
  site.group.add(monitor);
  return { handle: { machineScreen } };
};

/** The operator bench due north of the table, facing the Attention board, and a stool either side of it. */
export const lounge: Fixture = (site) => {
  const seat = SEATING_BY_ID.get('couch')!;
  const bench = new THREE.Group();
  // Built along x facing +z, then turned to face the board.
  const len = 3.4;
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
