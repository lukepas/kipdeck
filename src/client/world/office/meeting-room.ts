import * as THREE from 'three';
import { MEETING_BOARD, MEETING_ROOM, MEETING_SEATS, MEETING_TABLE, deskSeat, type DeskDef } from '../../../shared/layout';
import { mesh, textPlane } from '../toon';
import type { Collider, DeskView, Interactable } from '../types';
import type { Fixture } from './fixture';
import { DECK, box, contactShadow, flat, glassPane, matte, practical } from './materials';
import { wallBoard } from './props';
import { chair } from './seats';
import type { Door } from './shell';

/** A chair at the meeting table, with its laptop on the table in front of it. */
function buildMeetingSeat(def: DeskDef, index: number): DeskView {
  const group = new THREE.Group();
  group.position.set(def.x, 0, def.z);
  group.rotation.y = def.rotY;
  const laptopAnchor = new THREE.Object3D();
  laptopAnchor.position.set(0, MEETING_TABLE.height, 0);
  laptopAnchor.scale.setScalar(1.15);
  group.add(laptopAnchor);
  const seatAnchor = new THREE.Object3D();
  seatAnchor.position.set(0, 0.4, 0.85);
  seatAnchor.rotation.y = Math.PI;
  seatAnchor.scale.setScalar(0.82);
  group.add(seatAnchor);
  const ch = chair();
  void index;
  ch.position.set(0, 0, 0.85);
  group.add(ch);
  // Nobody is hired here from the floor, so there's no '+' over a free chair: a meeting fills them.
  const vacancy = new THREE.Group();
  group.add(vacancy);
  return { def, group, laptopAnchor, seatAnchor, chair: ch, vacancy, vacancyY: 0 };
}

/**
 * The Review bay (the meeting room): smoked glass in the south-east corner round to the outside walls,
 * open to the sky so the Overview sees in, a sliding glass door facing the deck, a small table with its
 * stools (MEETING_SEATS) and pull requests stacked on it as lit sheets, a board on the east wall for the
 * review's output and a panel by the door for how it's going.
 */
export function buildMeetingRoom(group: THREE.Group, colliders: Collider[], interactables: Interactable[], desks: Map<string, DeskView>, doors: Door[]): { board: THREE.Mesh; sign: THREE.Mesh } {
  const R = MEETING_ROOM;
  const H = R.height;
  const T = 0.1;
  const frameMat = matte(DECK.steel, { metalness: 0.3, roughness: 0.6 });
  const walls = new THREE.Group();
  const bar = (w: number, h: number, d: number, x: number, y: number, z: number) => walls.add(mesh(box(w, h, d), frameMat, x, y, z, false));
  /** A run of glass along x (north wall) or z (west wall), from a to b, in panes about `pane` wide. */
  const run = (axis: 'x' | 'z', a: number, b: number, at: number, pane = 2.2) => {
    const len = b - a;
    const n = Math.max(1, Math.round(len / pane));
    for (let i = 0; i < n; i++) {
      const g = glassPane(len / n, H);
      const u = a + (i + 0.5) * (len / n);
      if (axis === 'x') g.position.set(u, H / 2, at);
      else {
        g.position.set(at, H / 2, u);
        g.rotation.y = Math.PI / 2;
      }
      walls.add(g);
    }
    for (let i = 0; i <= n; i++) {
      const u = a + i * (len / n);
      if (axis === 'x') bar(0.08, H, T + 0.04, u, H / 2, at);
      else bar(T + 0.04, H, 0.08, at, H / 2, u);
    }
    for (const y of [0.05, H - 0.05]) {
      if (axis === 'x') bar(len, 0.1, T + 0.06, (a + b) / 2, y, at);
      else bar(T + 0.06, 0.1, len, at, y, (a + b) / 2);
    }
    colliders.push(axis === 'x' ? { minX: a, maxX: b, minZ: at - T / 2, maxZ: at + T / 2, top: H } : { minX: at - T / 2, maxX: at + T / 2, minZ: a, maxZ: b, top: H });
  };
  run('x', R.minX, R.door.x0, R.minZ);
  run('x', R.door.x1, R.maxX, R.minZ);
  run('z', R.minZ, R.maxZ, R.minX);
  // Over the door, up to the roof.
  bar(R.door.x1 - R.door.x0, 0.1, T + 0.06, (R.door.x0 + R.door.x1) / 2, 2.3, R.minZ);
  group.add(walls);
  // No roof: the Overview looks straight in. Nobody climbs over the glass, though.
  const roofT = 0.25;
  colliders.push({ minX: R.minX - T / 2, maxX: R.maxX, minZ: R.minZ - T / 2, maxZ: R.maxZ, bottom: H, top: H + roofT });

  // The door: two glass leaves that slide apart over the glass on either side when someone comes up.
  const dx = (R.door.x0 + R.door.x1) / 2;
  const half = (R.door.x1 - R.door.x0) / 2;
  const alu = frameMat;
  const leaves: [THREE.Group, number][] = [];
  for (const side of [-1, 1]) {
    const leaf = new THREE.Group();
    const h = 2.25;
    for (const y of [0.04, h - 0.04]) leaf.add(mesh(box(half, 0.07, 0.04), alu, 0, y, 0, false));
    for (const x of [-half / 2 + 0.03, half / 2 - 0.03]) leaf.add(mesh(box(0.06, h, 0.04), alu, x, h / 2, 0, false));
    const pane = glassPane(half - 0.12, h - 0.14);
    pane.position.y = h / 2;
    leaf.add(pane);
    leaf.add(mesh(box(0.03, 0.4, 0.07), matte(DECK.wallReveal), -side * (half / 2 - 0.1), 1.05, 0, false));
    const x0 = dx + (side * half) / 2;
    leaf.position.set(x0, 0, R.minZ - T / 2 - 0.04);
    group.add(leaf);
    leaves.push([leaf, x0]);
  }
  doors.push({
    x: dx,
    y: 0,
    z: R.minZ,
    open: 0,
    show: (k) => {
      const e = k * k * (3 - 2 * k);
      for (const [leaf, x0] of leaves) leaf.position.x = x0 + Math.sign(x0 - dx) * e * (half - 0.06);
    },
  });
  const label = textPlane('REVIEW BAY', { face: 'display', size: 56, color: DECK.text, track: 0.08 });
  label.scale.multiplyScalar(0.62);
  // In front of the glass wall's frame (out to R.minZ - 0.08) and the sliding leaves (to R.minZ - 0.11),
  // which it runs across once its text is wider than the door.
  label.position.set(dx, 2.52, R.minZ - 0.13);
  label.rotation.y = Math.PI;
  group.add(label);

  // The table, in the consoles' language: a slate top with a lit edge on two pedestals, and the
  // pull requests waiting for review stacked on it as lit sheets.
  const table = new THREE.Group();
  const top = MEETING_TABLE;
  table.add(mesh(box(top.width, 0.07, top.depth), flat(DECK.consoleTop), 0, top.height - 0.035, 0));
  table.add(mesh(box(top.width + 0.01, 0.01, 0.01), practical(DECK.line), 0, top.height, top.depth / 2));
  table.add(mesh(box(top.width + 0.01, 0.01, 0.01), practical(DECK.line), 0, top.height, -top.depth / 2));
  for (const sx of [-1, 1]) {
    table.add(mesh(box(0.5, top.height - 0.07, 0.4), flat(DECK.console), sx * (top.width / 2 - 0.7), (top.height - 0.07) / 2, 0));
  }
  const sheet = new THREE.MeshBasicMaterial({ color: DECK.review, toneMapped: false, transparent: true, opacity: 0.55 });
  for (let i = 0; i < 3; i++) {
    const card = mesh(box(0.42, 0.006, 0.3), i === 2 ? sheet : matte(DECK.steelLight), 0.3 + i * 0.015, top.height + 0.006 + i * 0.008, 0.02 - i * 0.01, false);
    card.rotation.y = 0.12 - i * 0.07;
    table.add(card);
  }
  table.add(contactShadow(top.width + 1.4, top.depth + 2.2));
  table.position.set(top.x, 0, top.z);
  group.add(table);
  colliders.push({ minX: top.x - top.width / 2, maxX: top.x + top.width / 2, minZ: top.z - top.depth / 2, maxZ: top.z + top.depth / 2, top: top.height });
  const talk: Interactable = { kind: 'meeting', x: top.x, z: top.z, radius: 2.6 };
  interactables.push(talk);
  table.userData.interact = talk;
  MEETING_SEATS.forEach((def, i) => {
    const view = buildMeetingSeat(def, i);
    group.add(view.group);
    desks.set(def.id, view);
    const at = deskSeat(def, 1.2);
    const it: Interactable = { kind: 'desk', deskId: def.id, x: at.x, z: at.z, radius: 1 };
    interactables.push(it);
    view.group.userData.interact = it;
  });

  // The board on the east wall: the review's output file as it's being written.
  const b = MEETING_BOARD;
  const { group: frame, face } = wallBoard(b.width, b.height);
  frame.position.set(b.x - 0.03, b.y, b.z);
  frame.rotation.y = b.rotY;
  group.add(frame);
  const read: Interactable = { kind: 'meeting', x: b.x + Math.sin(b.rotY) * 1.4, z: b.z + Math.cos(b.rotY) * 1.4, radius: 2.4 };
  interactables.push(read);
  frame.userData.interact = read;

  // The panel on the glass beside the door, like a room-booking screen: what's on, the round, the
  // tokens, and the summary once it's over. Beside the door rather than past it, so the board shows.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.96), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  // Inside the glass, facing out: the door's left leaf slides across outside it (out to R.minZ - 0.125)
  // and would cut through a panel on the outer face, its glints flickering with the screen.
  sign.position.set((R.minX + R.door.x0) / 2 + 0.01, 1.45, R.minZ + T / 2 + 0.03);
  sign.rotation.y = Math.PI;
  group.add(sign);
  const plate = mesh(box(0.66, 1.03, 0.03), matte(DECK.wallReveal), sign.position.x, sign.position.y, R.minZ + T / 2 + 0.05, false);
  group.add(plate);
  const door: Interactable = { kind: 'meeting', x: sign.position.x, z: R.minZ - 1.2, radius: 1.8 };
  interactables.push(door);
  sign.userData.interact = door;
  plate.userData.interact = door;

  // A lit rule along the top of the glass, so the bay's outline reads from across the deck.
  group.add(mesh(box(R.maxX - R.minX, 0.012, 0.012), practical(DECK.line), (R.minX + R.maxX) / 2, H + 0.01, R.minZ));
  group.add(mesh(box(0.012, 0.012, R.maxZ - R.minZ), practical(DECK.line), R.minX, H + 0.01, (R.minZ + R.maxZ) / 2));
  return { board: face, sign };
}

declare module '../types' {
  interface OfficeHandles {
    /** The meeting room's board, showing the meeting's output as it's written, and the sign by its door. */
    meetingBoard: THREE.Mesh;
    meetingSign: THREE.Mesh;
  }
}

/** The Review bay, in the south-east corner. */
export const meetingRoom: Fixture<'meetingBoard' | 'meetingSign'> = (site) => {
  const built = buildMeetingRoom(site.group, site.colliders, site.interactables, site.desks, site.doors);
  return { handle: { meetingBoard: built.board, meetingSign: built.sign } };
};
