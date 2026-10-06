import * as THREE from 'three';
import { BOARDS, MACHINE_MONITOR, TV } from '../../../shared/layout';
import type { Interactable } from '../types';
import type { Fixture } from './fixture';
import { wallBoard } from './props';

// The deck past its walls and its seats: the boards of the situation arc hung north of the mission
// table (Issues, Queue, Attention, Pull requests and Services; the arc's own structure is
// features/amphitheater/arc.ts) and the capacity strip under the Attention board. The pit between the
// table and the arc is left clear. The lamps over the pods and the table are the lights' (features/lights/rig.ts).

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
    const { group: bg, face } = wallBoard(b.width, b.height, true);
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
  const { group: tvGroup, face: tvScreen } = wallBoard(TV.width, TV.height, true);
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
  const { group: monitor, face: machineScreen } = wallBoard(MACHINE_MONITOR.width, MACHINE_MONITOR.height, true);
  const m = MACHINE_MONITOR;
  monitor.position.set(m.x + Math.sin(m.rotY) * 0.06, m.y, m.z + Math.cos(m.rotY) * 0.06);
  monitor.rotation.y = m.rotY;
  site.group.add(monitor);
  return { handle: { machineScreen } };
};
