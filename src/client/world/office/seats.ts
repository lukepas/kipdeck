import * as THREE from 'three';
import { BEANBAGS, DESKS, DESK_SIZE, FLOOR, KIOSK, SEATING_BY_ID, STATIONS, STATION_AGENT, deskSeat, type DeskDef, type StationKind } from '../../../shared/layout';
import { deskPoint } from '../../../shared/nav';
import { mesh, textPlane } from '../toon';
import type { Collider, DeskView, Interactable } from '../types';
import type { Fixture } from './fixture';
import { DECK, box, contactShadow, flat, matte, practical } from './materials';

// Where people sit: the seats you use (see SEATING), and the consoles, the Standby bench and the board
// agents' lecterns that units sit (or stand) at, with the plus over a free one.

/** Makes `obj` somewhere to sit (see SEATING): walk up to it, or look at it, and press E. */
export function seatable(obj: THREE.Object3D, seatId: string, radius: number, interactables: Interactable[]) {
  const seat = SEATING_BY_ID.get(seatId)!;
  const it: Interactable = { kind: 'seat', seatId, x: seat.x, y: seat.y, z: seat.z, radius };
  interactables.push(it);
  obj.userData.interact = it;
}

/** A unit's stool at its console: a round seat on a post, on a disc. `color` is its seat's. */
export function chair(color: string = DECK.consoleTop): THREE.Group {
  const g = new THREE.Group();
  const steel = matte(DECK.steel, { metalness: 0.3, roughness: 0.6 });
  g.add(mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.07, 18), flat(color), 0, 0.47, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8), steel, 0, 0.24, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 18), steel, 0, 0.015, 0, false));
  return g;
}

/**
 * The `index`th console (of DESKS) at `def`: a low pedestal under a flat top, and on the table's side
 * a hood that stands no higher than the sightline with a lit hairline along its edge; a stool on the
 * outer side; and the anchors its unit and its screen (the laptop) go in. `trimMat` paints the hood.
 */
export function buildDesk(def: DeskDef, index: number, trimMat: THREE.Material): DeskView {
  const group = new THREE.Group();
  group.position.set(def.x, 0, def.z);
  group.rotation.y = def.rotY;
  const { width, depth, height } = DESK_SIZE;
  const body = flat(DECK.console);
  const top = flat(DECK.consoleTop);
  // The pedestal, set back toward the table, and a plinth it stands on.
  group.add(mesh(box(width - 0.36, height - 0.08, depth - 0.34), body, 0, (height - 0.08) / 2, -0.1));
  group.add(mesh(box(width - 0.2, 0.05, depth - 0.2), matte(DECK.wallReveal), 0, 0.025, -0.06, false));
  // The top, and its front edge rounded off where the unit's hands rest.
  group.add(mesh(box(width, 0.06, depth), top, 0, height - 0.03, 0));
  group.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, width, 8).rotateZ(Math.PI / 2), top, 0, height - 0.03, depth / 2, false));
  // The hood on the table's side, leaning back, its top under the sightline.
  const hood = mesh(box(width - 0.08, 0.3, 0.05), trimMat, 0, height + 0.13, -depth / 2 + 0.04);
  hood.rotation.x = -0.22;
  group.add(hood);
  // A hairline of light along the hood's top edge, facing the table: the console is live.
  const edge = mesh(box(width - 0.16, 0.012, 0.012), practical(DECK.gridMajor), 0, height + 0.28, -depth / 2 + 0.005, false);
  group.add(edge);
  // Its number, stencilled small on the hood's face toward the table.
  const tag = textPlane(def.label.replace(/^Console /, ''), { face: 'mono', size: 40, color: DECK.muted });
  tag.scale.multiplyScalar(0.55);
  tag.position.set(0, height + 0.13, -depth / 2 + 0.005);
  tag.rotation.set(0.22, Math.PI, 0);
  group.add(tag);
  group.add(contactShadow(width + 0.5, depth + 1.4, 0, 0.35));

  const laptopAnchor = new THREE.Object3D();
  laptopAnchor.position.set(0, height, -0.06);
  laptopAnchor.scale.setScalar(1.3);
  group.add(laptopAnchor);

  // On the stool, facing the console and the table past it.
  const seatAnchor = new THREE.Object3D();
  seatAnchor.position.set(0, 0.4, 0.93);
  seatAnchor.rotation.y = Math.PI;
  seatAnchor.scale.setScalar(0.82);
  group.add(seatAnchor);

  const ch = chair();
  ch.position.set(0, 0, 0.9);
  group.add(ch);

  const vacancyY = height + 0.5;
  const vacancy = vacancyMarker(vacancyY);
  group.add(vacancy);
  void index;

  return { def, group, laptopAnchor, seatAnchor, chair: ch, vacancy, vacancyY };
}

/** The open-seat mark over a free console: a slim steel plus, lit, turning slowly. */
export function vacancyMarker(y: number): THREE.Group {
  const vacancy = new THREE.Group();
  const lit = practical(DECK.steelLight);
  vacancy.add(mesh(box(0.2, 0.03, 0.03), lit, 0, 0, 0, false));
  vacancy.add(mesh(box(0.03, 0.2, 0.03), lit, 0, 0, 0, false));
  vacancy.position.set(0, y, 0);
  return vacancy;
}

/** A Standby bench seat's footprint, with the stand in front of it (-z). */
export const BEANBAG_BOX = { minX: -0.62, maxX: 0.62, minZ: -1.1, maxZ: 0.64, top: 0.62 } as const;

/** A seat on the Standby bench: a low pad with a back, and a low stand in front of it for the screen. */
export function buildBeanbag(def: DeskDef, index: number): DeskView {
  const group = new THREE.Group();
  group.position.set(def.x, 0, def.z);
  group.rotation.y = def.rotY;
  const bag = new THREE.Group();
  bag.add(mesh(box(1.1, 0.34, 0.7), flat(DECK.console), 0, 0.17, 0.1));
  bag.add(mesh(box(1.04, 0.06, 0.64), flat(DECK.consoleTop), 0, 0.37, 0.1));
  bag.add(mesh(box(1.1, 0.34, 0.12), flat(DECK.console), 0, 0.55, 0.42));
  group.add(bag);
  group.add(contactShadow(1.6, 2.2, 0, -0.25));

  const tray = new THREE.Group();
  tray.add(mesh(box(0.8, 0.04, 0.42), flat(DECK.consoleTop), 0, 0.42, 0));
  tray.add(mesh(box(0.1, 0.4, 0.24), flat(DECK.console), 0, 0.2, 0));
  tray.position.z = -0.8;
  group.add(tray);

  const laptopAnchor = new THREE.Object3D();
  laptopAnchor.position.set(0, 0.445, -0.8);
  laptopAnchor.scale.setScalar(1.05);
  group.add(laptopAnchor);

  // On the pad, facing the stand.
  const seatAnchor = new THREE.Object3D();
  seatAnchor.position.set(0, 0.34, 0.04);
  seatAnchor.rotation.y = Math.PI;
  seatAnchor.scale.setScalar(0.82);
  group.add(seatAnchor);

  const vacancyY = 1.25;
  const vacancy = vacancyMarker(vacancyY);
  group.add(vacancy);
  void index;

  return { def, group, laptopAnchor, seatAnchor, chair: bag, vacancy, vacancyY };
}

const KIOSK_SIGN: Record<StationKind, string> = { issues: 'ASK  ISSUES', pulls: 'ASK  PRS', queue: 'ASK  QUEUE' };

/**
 * A board agent's lectern: a slim column on a plate with a slanted top, its sign on the front, and
 * the agent standing behind it. Its `vacancy` is where the agent waits before anyone has asked it
 * anything (main.ts puts one there), in the same spot and pose as the one who gets hired.
 */
export function buildKiosk(def: DeskDef): DeskView {
  const kind = def.station!;
  const group = new THREE.Group();
  group.position.set(def.x, 0, def.z);
  group.rotation.y = def.rotY;
  const { width, depth, height } = KIOSK;
  group.add(mesh(box(width - 0.1, 0.04, depth), matte(DECK.wallReveal), 0, 0.02, 0, false));
  group.add(mesh(box(0.18, height - 0.08, 0.18), flat(DECK.console), 0, (height - 0.08) / 2 + 0.04, 0));
  const topPlate = mesh(box(width, 0.04, depth), flat(DECK.consoleTop), 0, height - 0.02, 0);
  topPlate.rotation.x = 0.12;
  group.add(topPlate);
  // Its agent's stripe along the front edge, desaturated like the units' provider stripes.
  group.add(mesh(box(width, 0.015, 0.015), practical(STATION_AGENT[kind].color), 0, height - 0.04, -depth / 2 - 0.01, false));
  const sign = textPlane(KIOSK_SIGN[kind], { face: 'mono', size: 44, color: DECK.text, bg: DECK.console, border: DECK.line });
  sign.scale.multiplyScalar(0.5);
  sign.position.set(0, height * 0.55, -0.1);
  sign.rotation.y = Math.PI;
  group.add(sign);
  group.add(contactShadow(width + 0.4, depth + 1.2, 0, 0.3));

  // No screen: it would hide the agent's face from whoever walks up, and face the wall. The agent's
  // terminal is a key press away (O).
  const laptopAnchor = new THREE.Object3D();
  laptopAnchor.visible = false;
  group.add(laptopAnchor);

  // On its feet behind the lectern, facing it and the deck beyond.
  const stand = new THREE.Object3D();
  stand.position.set(0, -0.07 * 1.1, KIOSK.stand);
  stand.rotation.y = Math.PI;
  stand.scale.setScalar(1.1);
  const seatAnchor = stand.clone();
  group.add(seatAnchor);
  const vacancy = new THREE.Group();
  vacancy.add(stand);
  group.add(vacancy);

  return { def, group, laptopAnchor, seatAnchor, chair: new THREE.Group(), vacancy, vacancyY: 0 };
}

declare module '../types' {
  interface OfficeHandles {
    /**
     * Brings out the bean bags in `out` and puts the rest away. Returns the colliders of the ones that
     * just came out, in case someone is standing there.
     */
    setBeanbags(out: Set<string>): Collider[];
  }
}

/**
 * What you bump into at a console turned any way: three small boxes along its width rather than one
 * box round the whole of it turned, which would take in its stool.
 */
export function consoleColliders(def: DeskDef): Collider[] {
  const hw = DESK_SIZE.width / 2 - 0.05;
  const r = DESK_SIZE.depth / 2 - 0.08;
  return [-hw + r, 0, hw - r].map((t) => {
    const [x, z] = deskPoint(def, t, 0);
    return { minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, top: DESK_SIZE.height };
  });
}

/** The consoles, each with its stool, in their pods round the table. */
export const desks: Fixture = (site) => {
  DESKS.forEach((def, i) => {
    const view = buildDesk(def, i, site.looks.trim);
    site.group.add(view.group);
    site.desks.set(def.id, view);
    site.colliders.push(...consoleColliders(def));
    const seat = deskSeat(def, 1.25);
    const it: Interactable = { kind: 'desk', deskId: def.id, x: seat.x, z: seat.z, radius: 1.3 };
    site.interactables.push(it);
    view.group.userData.interact = it;
  });
  return {};
};

/** The Standby bench's seats, put away until every console is taken. */
export const beanbags: Fixture<'setBeanbags'> = (site) => {
  const bags = new Map<string, { view: DeskView; it: Interactable; collider: Collider }>();
  BEANBAGS.forEach((def, i) => {
    const view = buildBeanbag(def, i);
    view.group.visible = false;
    site.group.add(view.group);
    site.desks.set(def.id, view);
    const it: Interactable = { kind: 'desk', deskId: def.id, x: def.x, z: def.z, radius: 1.8, off: true };
    site.interactables.push(it);
    view.group.userData.interact = it;
    // Its footprint turned the way it faces (a quarter turn at a time).
    const c = Math.round(Math.cos(def.rotY));
    const s = Math.round(Math.sin(def.rotY));
    const xs = [BEANBAG_BOX.minX, BEANBAG_BOX.maxX].flatMap((lx) => [BEANBAG_BOX.minZ, BEANBAG_BOX.maxZ].map((lz) => def.x + lx * c + lz * s));
    const zs = [BEANBAG_BOX.minX, BEANBAG_BOX.maxX].flatMap((lx) => [BEANBAG_BOX.minZ, BEANBAG_BOX.maxZ].map((lz) => def.z - lx * s + lz * c));
    const collider = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs), top: BEANBAG_BOX.top };
    bags.set(def.id, { view, it, collider });
  });
  const setBeanbags = (out: Set<string>) => {
    const appeared: Collider[] = [];
    for (const [id, b] of bags) {
      const show = out.has(id);
      if (show === b.view.group.visible) continue;
      b.view.group.visible = show;
      b.it.off = !show;
      if (show) {
        site.colliders.push(b.collider);
        appeared.push(b.collider);
      } else site.colliders.splice(site.colliders.indexOf(b.collider), 1);
    }
    return appeared;
  };
  return { handle: { setBeanbags } };
};

/** The board agents' lecterns, each at the west end of its panel of the Main board. */
export const kiosks: Fixture = (site) => {
  for (const def of STATIONS) {
    const view = buildKiosk(def);
    site.group.add(view.group);
    site.desks.set(def.id, view);
    // The lectern and the agent behind it, back to the wall (they all stand by the north wall) so
    // nobody squeezes in behind, and up over the agent's head so nobody hops on it.
    const corners = [-1, 1].flatMap((t) => [-KIOSK.depth / 2, KIOSK.stand + 0.35].map((sz) => deskPoint(def, (t * KIOSK.width) / 2, sz)));
    const xs = corners.map(([x]) => x);
    const zs = corners.map(([, z]) => z);
    site.colliders.push({ minX: Math.min(...xs), maxX: Math.max(...xs), minZ: FLOOR.minZ, maxZ: Math.max(...zs), top: 1.5, fence: true });
    // Walk up to its front.
    const [fx, fz] = deskPoint(def, 0, -1);
    const it: Interactable = { kind: 'station', deskId: def.id, x: fx, z: fz, radius: 1.3 };
    site.interactables.push(it);
    view.group.userData.interact = it;
  }
  return {};
};
