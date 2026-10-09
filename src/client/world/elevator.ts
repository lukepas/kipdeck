import * as THREE from 'three';
import { ELEVATOR, ELEVATOR_BACK, ELEVATOR_CAR, ELEVATOR_FRONT } from '../../shared/layout';
import { mesh, stretch } from './toon';
import type { Collider, Interactable } from './types';
import type { Fixture } from './office/fixture';
import { DECK, box, contactShadow, flat, matte, practical } from './office/materials';
import { drawMark } from './office/floorpaint';

// The Deck lift (the elevator): a slate housing in the middle of the south curb, open to the
// deck through a portal with a lit frame, Kip's mark and the deck's number over it. Every deck
// has it in the same place: it's where you arrive, and E there opens the Decks window. It's built
// along `dir`, the way from its back wall out through its portal (shared/layout.ts ELEVATOR_BACK).

/** How tall the housing stands: the lift's walls go on up out of reach, past what's drawn. */
const HOUSING = 3.6;

export interface Elevator {
  group: THREE.Group;
  /** What stops you walking out through the sides. Part of the office's colliders. */
  colliders: Collider[];
  /** Step in, or up to it, and press E. */
  interactable: Interactable;
  /** The sign over the portal: which deck this is, and its number. */
  setSign(text: string, n?: number): void;
}

/** The sign's face, pixels across and down. */
const SIGN_PX = { w: 1024, h: 256 };

function paintSign(g: CanvasRenderingContext2D, text: string, n?: number) {
  const { w, h } = SIGN_PX;
  g.clearRect(0, 0, w, h);
  g.fillStyle = DECK.wall;
  g.fillRect(0, 0, w, h);
  drawMark(g, 22, 24, 8.5, DECK.text);
  g.textBaseline = 'alphabetic';
  g.fillStyle = DECK.muted;
  g.font = '700 46px Archivo, system-ui, sans-serif';
  stretch(g, true);
  g.letterSpacing = '6px';
  g.fillText(n ? `DECK ${String(n).padStart(2, '0')}` : 'DECK', 250, 104);
  g.letterSpacing = '0px';
  stretch(g, false);
  g.fillStyle = DECK.text;
  g.font = '500 62px "JetBrains Mono", ui-monospace, monospace';
  let t = text;
  while (t.length > 3 && g.measureText(t).width > w - 280) t = `${t.slice(0, -2)}.`;
  g.fillText(t, 250, 196);
}

/** The Deck lift. */
export function buildElevator(): Elevator {
  const { x, width, depth, wall, doorWidth, doorHeight } = ELEVATOR;
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const minX = x - width / 2;
  const maxX = x + width / 2;
  const back = ELEVATOR_BACK;
  const front = ELEVATOR_FRONT;
  /** +1 when the portal looks toward +z, -1 toward -z. */
  const dir = Math.sign(front - back);
  const midZ = (back + front) / 2;
  const z0 = Math.min(back, front);
  const z1 = Math.max(back, front);
  /** A collider's z extent from `a` to `b` either way round. */
  const span = (a: number, b: number) => ({ minZ: Math.min(a, b), maxZ: Math.max(a, b) });
  const slate = flat(DECK.wall);
  const lit = practical(DECK.working);
  /** Faces the deck: the way out through the portal. */
  const outward = dir > 0 ? 0 : Math.PI;

  // Side walls: the colliders go on up, the housing stops at HOUSING.
  for (const sx of [minX + wall / 2, maxX - wall / 2]) {
    group.add(mesh(box(wall, HOUSING, depth), slate, sx, HOUSING / 2, midZ));
    colliders.push({ minX: sx - wall / 2, maxX: sx + wall / 2, minZ: z0, maxZ: z1, bottom: 0, top: 99 });
  }
  // The front: a pillar either side of the portal, and a lintel over it.
  for (const [x0, x1] of [
    [minX, x - doorWidth / 2],
    [x + doorWidth / 2, maxX],
  ]) {
    group.add(mesh(box(x1 - x0, HOUSING, wall), slate, (x0 + x1) / 2, HOUSING / 2, front - (dir * wall) / 2));
    colliders.push({ minX: x0, maxX: x1, ...span(front - dir * wall, front), bottom: 0, top: 99 });
  }
  group.add(mesh(box(doorWidth, HOUSING - doorHeight, wall), slate, x, doorHeight + (HOUSING - doorHeight) / 2, front - (dir * wall) / 2));
  // The back wall, standing on the curb.
  group.add(mesh(box(width, HOUSING, wall), slate, x, HOUSING / 2, back + (dir * wall) / 2));
  colliders.push({ minX, maxX, ...span(back, back + dir * wall), bottom: 0, top: 99 });
  // The roof of the housing, and a lit hairline round its top.
  group.add(mesh(box(width, 0.06, depth), slate, x, HOUSING + 0.03, midZ, false));
  group.add(mesh(box(width, 0.012, 0.012), practical(DECK.line), x, HOUSING + 0.066, front, false));
  // The portal's lit frame, set back GAP from the opening's edges so that from inside the car (where
  // everyone arrives) the pillars hide it, rather than it showing as two bright slivers down the doorway.
  const F = 0.035;
  const GAP = 0.04;
  group.add(mesh(box(doorWidth + 2 * (F + GAP), F, 0.02), lit, x, doorHeight + GAP + F / 2, front + dir * 0.011, false));
  for (const sx of [-1, 1]) group.add(mesh(box(F, doorHeight + GAP, 0.02), lit, x + sx * (doorWidth / 2 + GAP + F / 2), (doorHeight + GAP) / 2, front + dir * 0.011, false));

  // Inside: a dark floor with a lit threshold, and a strip light over the portal.
  const inW = ELEVATOR_CAR.maxX - ELEVATOR_CAR.minX;
  const inD = ELEVATOR_CAR.maxZ - ELEVATOR_CAR.minZ;
  group.add(mesh(box(inW, 0.02, inD), matte(DECK.wallReveal), x, 0.012, (ELEVATOR_CAR.minZ + ELEVATOR_CAR.maxZ) / 2, false));
  group.add(mesh(box(doorWidth, 0.022, 0.04), lit, x, 0.013, front - (dir * wall) / 2, false));
  group.add(mesh(box(inW - 0.2, 0.03, 0.1), lit, x, doorHeight - 0.04, front - dir * (wall + 0.08), false));
  // The back wall of the car: the mark stencilled big, faint.
  const markCanvas = document.createElement('canvas');
  markCanvas.width = markCanvas.height = 256;
  drawMark(markCanvas.getContext('2d')!, 8, 8, 10, DECK.steel);
  const markTex = new THREE.CanvasTexture(markCanvas);
  markTex.colorSpace = THREE.SRGBColorSpace;
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: markTex, transparent: true, toneMapped: false }));
  mark.position.set(x, 1.5, back + dir * (wall + 0.02));
  mark.rotation.y = outward;
  group.add(mark);
  group.add(contactShadow(width + 0.8, 1.0, x, front + dir * 0.2));

  // Which deck this is: a sign over the portal, facing the deck.
  const canvas = document.createElement('canvas');
  canvas.width = SIGN_PX.w;
  canvas.height = SIGN_PX.h;
  const g = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const signH = HOUSING - doorHeight - 0.2;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(signH * (SIGN_PX.w / SIGN_PX.h), signH), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  sign.scale.setScalar(Math.min(1, (width - 0.1) / (signH * (SIGN_PX.w / SIGN_PX.h))));
  sign.position.set(x, doorHeight + (HOUSING - doorHeight) / 2, front + dir * 0.004);
  sign.rotation.y = outward;
  group.add(sign);
  const setSign = (text: string, n?: number) => {
    paintSign(g, text, n);
    tex.needsUpdate = true;
  };
  setSign('Lobby');

  const interactable: Interactable = { kind: 'elevator', x, z: front - dir * 0.4, radius: 1.9 };
  group.userData.interact = interactable;
  return { group, colliders, interactable, setSign };
}

declare module './types' {
  interface OfficeHandles {
    /** The sign over the Deck lift's portal: which deck you're on (see Office.setProjectName). */
    setLiftSign(name: string, n?: number): void;
  }
}

/** The Deck lift to the other decks, in the middle of the south curb. */
export const elevator: Fixture<'setLiftSign'> = () => {
  const built = buildElevator();
  return {
    group: built.group,
    colliders: built.colliders,
    interactables: [built.interactable],
    handle: { setLiftSign: (name, n) => built.setSign(name, n) },
  };
};
