import * as THREE from 'three';
import type { FloorPalette } from '../../../shared/floors';
import { elevator } from '../elevator';
import { bookshelf } from '../../features/bookshelf/world';
import { whiteboard } from '../../features/whiteboard/world';
import { stack } from '../stack';
import { signs } from '../desksigns';
import type { Collider, DeskView, Interactable, Office, OfficeHandles } from '../types';
import { DECK, floorTexture, matteUnique, type Looks } from './materials';
import { boards, lounge, machineMonitor, tv } from './room';
import { amphitheater } from '../../features/amphitheater/tiers';
import { situationArc } from '../../features/amphitheater/arc';
import { lamps } from '../../features/lights/rig';
import { floorPaint } from './floorpaint';
import { FLOOR_ROUGH, workedFloor } from './floor';
import { missionTable } from './table';
import { proofCorner } from '../../features/proofcorner/world';
import { podPlates } from '../../features/pods/world';
import { walls, type Door } from './shell';
import { wing } from './wing';
import { greebles } from './greebles';
import { beanbags, desks, kiosks } from './seats';
import { meetingRoom } from './meeting-room';
import type { Fixture, Gives, Site } from './fixture';
import { hull } from '../../features/bridge/hull';
import { skin } from '../../features/bridge/skin';
import { inlay } from '../../features/bridge/inlay';
import { conn } from '../../features/bridge/conn';
import { holo } from '../../features/bridge/holo';
import { arcChrome } from '../../features/arcchrome/world';
import { stations } from '../../features/bridge/stations';
import { panels } from '../../features/life/panels';
import { pulses } from '../../features/life/pulses';
import { motes } from '../../features/life/motes';
import { heading } from '../../features/life/heading';
import { ticker } from '../../features/life/ticker';
import { watchPlinth } from '../../features/crew/world';
import { droid } from '../../features/droid/world';
import { forwardLounge } from '../../features/lounge/world';

// The deck, put together from its fixtures (see fixture.ts): the slab and its walls, the paint on its
// floor, the bridge's hull round it, the mission table and the pods of consoles facing it, the
// situation wall and its boards, the conn, the Proof corner, the Review bay, the Deck lift and the
// overflow bay.

/**
 * The office floor's fixtures, in the order they're built: which is the order everything in the floor
 * is made and added in, so keep it (a new one goes where it belongs among them).
 */
function floorPlan() {
  return [
    stack,
    floorPaint,
    walls,
    // The hull's working detail along the walls: trays, conduits, clamps and ribs.
    greebles,
    // The bridge round the deck: the hull's frames, the canopy and the ship outside (features/bridge).
    hull,
    skin,
    inlay,
    // The amphitheatre round the pit: its tiers, the aisle up to the conn and the galleries (features/amphitheater).
    amphitheater,
    missionTable,
    holo,
    heading,
    desks,
    stations,
    // The stations' screens, the data pulses from them to the holo table and the motes off them (features/life).
    panels,
    pulses,
    motes,
    podPlates,
    beanbags,
    kiosks,
    // The situation arc hung north of the table (features/amphitheater), its work boards and its
    // Attention board, and the operator bench facing that.
    situationArc,
    boards,
    tv,
    // The lit bezels and corner brackets round the arc's boards (features/arcchrome).
    arcChrome,
    ticker,
    machineMonitor,
    proofCorner,
    // The unit of the watch on the Proof corner's plinth (features/crew).
    watchPlinth,
    lounge,
    // The viewing balcony at the bow behind the arc, its ladder and its seats (features/lounge).
    forwardLounge,
    conn,
    bookshelf,
    lamps,
    wing,
    signs,
    meetingRoom,
    elevator,
    whiteboard,
    // Bolt, the bridge droid, and its charger on the west wall (features/droid).
    droid,
  ] as const;
}

/** Every field of Office some fixture on the plan gives: this fails to typecheck, naming the field, if one goes without. */
type NoneMissing<Missing extends never> = Missing;
export type EveryHandleGiven = NoneMissing<Exclude<keyof OfficeHandles, Gives<ReturnType<typeof floorPlan>[number]>>>;

export function buildOffice(): Office {
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  // The walls, their trim and the floor's grid: one slate palette on every deck (see setLook).
  const looks: Looks = { wall: matteUnique(DECK.wall), trim: matteUnique(DECK.wallReveal), planks: [] };
  // The floor's grid, which the stack lays the floor with (and the overflow bay its own).
  const floorTex = floorTexture();
  looks.planks.push(floorTex);
  const planks = workedFloor(new THREE.MeshStandardMaterial({ map: floorTex, roughness: FLOOR_ROUGH.base, metalness: 0 }));
  const desks = new Map<string, DeskView>();
  const doors: Door[] = [];
  /** What the fixtures built so far give the office. */
  const given: Partial<OfficeHandles> = {};
  const site: Site = {
    group,
    colliders,
    interactables,
    looks,
    planks,
    desks,
    doors,
    inTheWay: [],
    get: (key) => {
      if (!(key in given)) throw new Error(`The office's ${key} isn't built yet: its fixture comes later in the plan`);
      return given[key]!;
    },
  };

  // Each fixture in turn, with what it hands back.
  const updates: ((t: number, dt: number) => void)[] = [];
  const plan: readonly Fixture[] = floorPlan();
  for (const fixture of plan) {
    const built = fixture(site);
    if (built.group) group.add(built.group);
    if (built.colliders) colliders.push(...built.colliders);
    if (built.interactables) interactables.push(...built.interactables);
    for (const [key, value] of Object.entries(built.handle ?? {})) {
      if (key in given) throw new Error(`Two of the office's fixtures give it ${key}`);
      Object.assign(given, { [key]: value });
    }
    if (built.update) updates.push(built.update);
  }

  // Every deck is the same slate: a floor's palette no longer paints it (its number on the lift and in
  // the title block tells decks apart).
  const setLook = (p: FloorPalette) => void p;

  const setProjectName = (name: string, deck?: { n?: number; operator?: string }) => {
    given.setLiftSign?.(name, deck?.n);
    given.titleBlock?.set({ deck: name, n: deck?.n, operator: deck?.operator });
  };

  const update = (t: number, dt: number, people: Iterable<{ x: number; y: number; z: number }>) => {
    const near = new Set<Door>();
    const who = [...people];
    for (const p of who) for (const d of doors) if (Math.abs(p.y - d.y) < 1.6 && Math.hypot(p.x - d.x, p.z - d.z) < 2.4) near.add(d);
    for (const d of doors) {
      const want = near.has(d) ? 1 : 0;
      if (d.open === want) continue;
      d.open = want > d.open ? Math.min(1, d.open + dt * 2.5) : Math.max(0, d.open - dt * 1.6);
      d.show(d.open);
    }
    for (const d of desks.values()) {
      // A board agent waiting to be asked stands still (its own idle bob is in Worker.update).
      if (!d.vacancy.visible || !d.group.visible || d.def.station) continue;
      d.vacancy.position.y = d.vacancyY + Math.sin(t * 2 + d.def.x) * 0.06;
      d.vacancy.rotation.y = t * 1.2;
      // The free seat's plus shows to someone walking up to it, small, and is gone from across the deck
      // (from the chair a dozen of them read as stray gizmos over the crew).
      let dist = Infinity;
      for (const p of who) dist = Math.min(dist, Math.hypot(p.x - d.def.x, p.z - d.def.z));
      const k = vacancyScale(dist);
      d.vacancy.scale.setScalar(Math.max(k, 1e-3));
      const plus = d.vacancy.children[0];
      if (plus) plus.visible = k > 0.01;
    }
    for (const u of updates) u(t, dt);
  };

  return { ...(given as OfficeHandles), group, colliders, interactables, desks, setLook, setProjectName, update };
}

/** How big a free seat's plus shows at `dist` m from the nearest person: 0.6 within 3 m, gone past 6. */
export function vacancyScale(dist: number): number {
  const k = Math.min(1, Math.max(0, (6 - dist) / 3));
  return 0.6 * k * k * (3 - 2 * k);
}
