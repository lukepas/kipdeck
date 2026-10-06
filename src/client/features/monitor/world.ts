import * as THREE from 'three';
import { FLOOR } from '../../../shared/layout';
import { SERVICE_MONITOR, SERVICE_MONITOR_DEPTH } from '../../../shared/wall-screens';
import { mesh } from '../../world/toon';
import type { Collider, Interactable } from '../../world/types';
import type { Fixture } from '../../world/office/fixture';
import { DECK, box, matte, practical } from '../../world/office/materials';

// The service monitor: a screen in a graphite bezel flush on the east wall (SERVICE_MONITOR), with a
// ship-cyan hairline under it like the arc's boards (its name is in its own title bar, face.ts; the pier's
// rib steps aside for it, world/office/greebles.ts). Its face shows a card painted
// on a canvas (face.ts); over it, while you stand near and face it, the live page of the service on it
// is laid as a real web page (live.ts).

export interface MonitorScreen {
  /** The face: the card's canvas goes on its material, and the live page is laid over it. */
  face: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  group: THREE.Group;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The service monitor on the east wall (features/monitor). */
    serviceMonitor: MonitorScreen;
  }
}

export const serviceMonitor: Fixture<'serviceMonitor'> = () => {
  const { x, y, z, rotY, width, height } = SERVICE_MONITOR;
  const d = SERVICE_MONITOR_DEPTH;
  const group = new THREE.Group();
  group.name = 'service-monitor';
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  // Built facing +z from its back on the wall (z 0).
  group.add(mesh(box(width + 0.16, height + 0.16, 0.03), matte(DECK.wallReveal), 0, y, 0.015, false));
  group.add(mesh(box(width + 0.08, height + 0.08, d - 0.03), matte(DECK.console, { metalness: 0.3, roughness: 0.5 }), 0, y, 0.03 + (d - 0.03) / 2, false));
  // An attention carrier's rules: its face gives its own light and never takes fog.
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, fog: false }));
  face.position.set(0, y, d + 0.002);
  face.name = 'service-monitor-face';
  group.add(face);
  group.add(mesh(box(width + 0.08, 0.012, 0.012), practical(DECK.ship), 0, y - height / 2 - 0.07, d - 0.01, false));

  const out = Math.sin(rotY);
  const colliders: Collider[] = [{ minX: x + out * (d + 0.02), maxX: FLOOR.maxX, minZ: z - width / 2 - 0.1, maxZ: z + width / 2 + 0.1, bottom: y - height / 2 - 0.1, top: y + height / 2 + 0.1 }];
  const interactable: Interactable = { kind: 'monitor', x: x + out * 1.6, z, radius: 2.2 };
  group.userData.interact = interactable;
  return { group, colliders, interactables: [interactable], handle: { serviceMonitor: { face, group } } };
};
