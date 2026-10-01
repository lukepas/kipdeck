import type * as THREE from 'three';
import type { FloorPalette } from '../../shared/floors';
import { LOFT, WALL_HEIGHT, FLOOR, type DeskDef } from '../../shared/layout';
import type { BoardKey } from '../../shared/plan';
import { officeNav, wayIn, type NavGrid, type Pt } from '../../shared/nav';
import type { Area } from './confetti';
import type { Gong } from '../features/gong/world';
import type { Collider, DeskView, Interactable, Office } from './types';

/*
 * The office as the workers know it: where the seats and the boards are, what's in the way, and how
 * workers walk in and out. The office has a great deal more of its own (the elevator, the lounge…).
 */

/** The ways a worker walks. */
export interface Ways {
  /** In to beside `seat`'s chair, from the elevator. */
  in(seat: DeskDef): Pt[];
}

export interface World {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  /** What a click at the scene can land on. */
  pickables: THREE.Object3D[];
  /** Every seat by id: the desks, the overflow seats, the board agents' places and the meeting chairs. */
  desks: Map<string, DeskView>;
  boardMeshes: Record<BoardKey, THREE.Mesh>;
  /** The meeting's output as it's written, and how the meeting's going, where the map shows them. */
  meetingBoard?: THREE.Mesh;
  meetingSign?: THREE.Mesh;
  /** The gong a merged pull request rings. */
  gong: Gong;
  nav: NavGrid;
  ways: Ways;
  /** Where confetti rains when a pull request merges, and from how high over each spot. */
  rain: { area: Area; top: (x: number, z: number) => number }[];
  /** Brings out the overflow seats in `out` and puts the rest away: the colliders of the ones that just came out. */
  setBeanbags(out: Set<string>): Collider[];
  /** Paints it in a floor's colors, so each project looks like itself. */
  setLook(p: FloorPalette): void;
  setProjectName(name: string): void;
  /** Animates it; doors open for anyone in `people` who comes up to them. */
  update(t: number, dt: number, people: Iterable<{ x: number; y: number; z: number }>): void;
}

/** Where confetti rains from over (x, z) downstairs in the office: the ceiling, or under the loft, the underside of its floor. */
function ceilingOver(x: number, z: number): number {
  const loft = x > LOFT.minX && x < LOFT.maxX && z > LOFT.minZ && z < LOFT.maxZ;
  return loft ? LOFT.y - 0.35 : WALL_HEIGHT - 0.1;
}

/** The office as a world. `wing` is how many rows its back office is built out (see WING). */
export function officeWorld(office: Office, wing: () => number): World {
  return {
    group: office.group,
    colliders: office.colliders,
    interactables: office.interactables,
    pickables: [office.group],
    desks: office.desks,
    boardMeshes: office.boardMeshes,
    meetingBoard: office.meetingBoard,
    meetingSign: office.meetingSign,
    gong: office.gong,
    get nav() {
      return officeNav(wing());
    },
    ways: {
      in: (seat) => wayIn(seat, wing()),
    },
    rain: [
      { area: FLOOR, top: ceilingOver },
      { area: LOFT, top: () => LOFT.y + LOFT.height - 0.1 },
    ],
    setBeanbags: (out) => office.setBeanbags(out),
    setLook: (p) => office.setLook(p),
    setProjectName: (name) => office.setProjectName(name),
    update: (t, dt, people) => office.update(t, dt, people),
  };
}
