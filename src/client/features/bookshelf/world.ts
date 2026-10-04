import * as THREE from 'three';
import { BOOKSHELF } from '../../../shared/layout';
import { deskPoint } from '../../../shared/nav';
import { mergeByMaterial, mesh, textPlane } from '../../world/toon';
import type { Collider, Interactable } from '../../world/types';
import type { Fixture } from '../../world/office/fixture';
import { DECK, contactShadow, flat, matte } from '../../world/office/materials';

// The docs rack against the north wall: a steel case, five shelves of binders in the slate ramp
// (a few leaning over, a stack lying flat), and a "DOCS" stencil over it. E at it opens the project's
// Markdown to read (ui.ts).

export interface BookshelfModel {
  group: THREE.Group;
  collider: Collider;
  interactable: Interactable;
}

const SPINES = [DECK.unit, DECK.console, DECK.consoleTop, DECK.steel, DECK.unit, DECK.consoleTop, '#4A5866'];
const SHELVES = 5;
/** The case's boards, how far the shelves sit off the floor, and how thick they are. */
const SIDE = 0.05;
const BASE = 0.1;
const BOARD = 0.03;

export function buildBookshelf(): BookshelfModel {
  const { width: W, depth: D, height: H } = BOOKSHELF;
  // Seeded, so the shelf looks the same in every browser.
  let seed = 20250928;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

  // Built facing +z, back against z = -D/2.
  const parts = new THREE.Group();
  const wood = matte(DECK.steel, { metalness: 0.3, roughness: 0.6 });
  const woodDark = matte(DECK.wallReveal);
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => parts.add(mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z));
  box(W, H, 0.03, woodDark, 0, H / 2, -D / 2 + 0.015);
  for (const sx of [-1, 1]) box(SIDE, H, D, wood, sx * (W / 2 - SIDE / 2), H / 2, 0);
  // A crown over the top and a kick board at the foot.
  box(W + 0.08, 0.07, D + 0.05, wood, 0, H + 0.035, 0.01);
  box(W - 2 * SIDE, BASE, D - 0.03, woodDark, 0, BASE / 2, -0.015);

  const inner = W - 2 * SIDE;
  const bay = (H - BASE - BOARD) / SHELVES;
  const front = D / 2 - 0.02;
  for (let s = 0; s < SHELVES; s++) {
    const floor = BASE + s * bay + BOARD;
    box(inner, BOARD, D - 0.03, wood, 0, floor - BOARD / 2, -0.015);
    const room = bay - BOARD - 0.04;
    let x = -inner / 2 + 0.02;
    const end = inner / 2 - 0.02;
    while (x < end - 0.03) {
      // A stack lying flat, once in a while.
      if (rand() < 0.07 && end - x > 0.32) {
        let y = floor;
        const n = 2 + Math.floor(rand() * 3);
        for (let i = 0; i < n; i++) {
          const t = 0.04 + rand() * 0.03;
          const w = 0.22 + rand() * 0.08;
          box(w, t, 0.18 + rand() * 0.06, flat(pick(SPINES)), x + 0.15 + (rand() - 0.5) * 0.03, y + t / 2, front - 0.13);
          y += t;
        }
        x += 0.32;
        continue;
      }
      const t = 0.035 + rand() * 0.04;
      const h = Math.min(room, room * (0.62 + rand() * 0.38));
      const d = 0.19 + rand() * 0.08;
      if (x + t > end) break;
      // The last one or two in a row lean over on their neighbour when there's room.
      const lean = end - x < 0.24 && end - x > 0.14 && rand() < 0.6;
      const mat = flat(pick(SPINES));
      if (lean) {
        const g = new THREE.Group();
        const a = 0.32;
        g.add(mesh(new THREE.BoxGeometry(t, h, d), mat, t / 2, h / 2, 0));
        g.rotation.z = -a;
        g.position.set(x + 0.01, floor, front - d / 2);
        parts.add(g);
        x = end;
        break;
      }
      box(t, h, d, mat, x + t / 2, floor + h / 2, front - d / 2);
      // A band across some spines, near the top.
      if (rand() < 0.35) box(t + 0.004, 0.018, d + 0.004, matte(DECK.muted), x + t / 2, floor + h * 0.82, front - d / 2);
      x += t + (rand() < 0.1 ? 0.012 : 0.002);
    }
  }
  const group = new THREE.Group();
  group.add(mergeByMaterial(parts));

  // A stencil over the crown.
  const sign = textPlane('DOCS', { face: 'display', size: 44, color: DECK.muted, track: 0.1 });
  sign.scale.multiplyScalar(0.7);
  sign.position.set(0, H + 0.28, 0.02);
  group.add(sign);
  group.add(contactShadow(W + 0.6, D + 0.9, 0, 0.2));

  // Built facing +z; it stands against its wall facing into the deck, turned `rotY`.
  const def = { id: 'docs', label: 'Docs', x: BOOKSHELF.x, z: BOOKSHELF.z, rotY: BOOKSHELF.rotY };
  group.position.set(BOOKSHELF.x, 0, BOOKSHELF.z);
  group.rotation.y = BOOKSHELF.rotY;
  const corners = [deskPoint(def, -W / 2 - 0.04, -D / 2 - 0.3), deskPoint(def, W / 2 + 0.04, -D / 2 - 0.3), deskPoint(def, -W / 2 - 0.04, D / 2 + 0.03), deskPoint(def, W / 2 + 0.04, D / 2 + 0.03)];
  const xs = corners.map(([cx]) => cx);
  const zs = corners.map(([, cz]) => cz);
  const collider: Collider = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs), top: H + 0.07 };
  const [ix, iz] = deskPoint(def, 0, 1.2);
  const interactable: Interactable = { kind: 'bookshelf', x: ix, z: iz, radius: 1.6 };
  group.userData.interact = interactable;
  return { group, collider, interactable };
}

/** The docs rack of the project's Markdown, against the north wall west of the Main board. */
export const bookshelf: Fixture = () => {
  const built = buildBookshelf();
  return { group: built.group, colliders: [built.collider], interactables: [built.interactable] };
};
