import type * as THREE from 'three';
import type { FloorPalette } from '../../shared/floors';
import type { DeskDef } from '../../shared/layout';
import type { BoardKey } from '../../shared/plan';
import { officeNav, wayIn, type NavGrid, type Pt } from '../../shared/nav';
import type { Collider, DeskView, Interactable, Office } from './types';

/*
 * The office as the workers know it: where the seats and the boards are, what's in the way, and how
 * workers walk in and out. The office has a great deal more of its own (the elevator, the lounge...).
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
  nav: NavGrid;
  ways: Ways;
  /** Brings out the overflow seats in `out` and puts the rest away: the colliders of the ones that just came out. */
  setBeanbags(out: Set<string>): Collider[];
  /** Paints it in a floor's colors, so each project looks like itself. */
  setLook(p: FloorPalette): void;
  /** Names the deck on the lift and in the title block (see Office.setProjectName). */
  setProjectName(name: string, deck?: { n?: number; operator?: string }): void;
  /** Animates it; doors open for anyone in `people` who comes up to them. */
  update(t: number, dt: number, people: Iterable<{ x: number; y: number; z: number }>): void;
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
    get nav() {
      return officeNav(wing());
    },
    ways: {
      in: (seat) => wayIn(seat, wing()),
    },
    setBeanbags: (out) => office.setBeanbags(out),
    setLook: (p) => office.setLook(p),
    setProjectName: (name, deck) => office.setProjectName(name, deck),
    update: (t, dt, people) => office.update(t, dt, people),
  };
}
