import { BEANBAGS, BOARDS, DESKS, ELEVATOR, ELEVATOR_CAR, FLOOR, MEETING_SEATS, SEATING, STATIONS, WALL_HEIGHT, WING_DESKS, type DeskDef, type SeatDef } from './layout.js';
import type { Bounds } from './nav.js';

/*
 * Where everything is on a floor of the office, by id: its seats, its places to sit and its boards.
 * Every floor is the same room (shared/layout.ts), so there's one plan.
 */

/** The boards on the walls. */
export type BoardKey = 'issues' | 'queue' | 'pulls' | 'services';
export const BOARD_KEYS: readonly BoardKey[] = ['issues', 'queue', 'pulls', 'services'];

/** A board on a wall: its middle, the way it faces (0 is +z), its size, and what the sign over it says. */
export interface BoardDef {
  x: number;
  y: number;
  z: number;
  rotY: number;
  width: number;
  height: number;
  label: string;
}

/** A spot to sit or stand in, facing `rotY`, and how high its floor is. */
export interface Spot {
  x: number;
  y: number;
  z: number;
  rotY: number;
}

export interface OfficePlan {
  bounds: Bounds;
  /** How high the walls are. */
  height: number;
  /** Where you stand when you arrive: in the elevator. */
  spawn: Spot;
  /** The desks (the back office's included, see WING), then the bean bags that only come out once they're all taken. */
  desks: DeskDef[];
  overflow: DeskDef[];
  stations: DeskDef[];
  meeting: DeskDef[];
  /** Everywhere a worker can be, by id. */
  byId: Map<string, DeskDef>;
  /** Where people can sit (the couch and the beanbags in the lounge). */
  seating: SeatDef[];
  seatingById: Map<string, SeatDef>;
  boards: Record<BoardKey, BoardDef>;
}

/**
 * Every desk, by id: the room's, then its back office's (see WING), which is only there to sit at on
 * a floor built out that far (deskBuilt).
 */
const PLAN_DESKS: DeskDef[] = [...DESKS, ...WING_DESKS];

function officePlan(): OfficePlan {
  const boards = {} as Record<BoardKey, BoardDef>;
  for (const k of BOARD_KEYS) boards[k] = { ...BOARDS[k] };
  return {
    bounds: { ...FLOOR },
    height: WALL_HEIGHT,
    spawn: { x: ELEVATOR.x, y: 0, z: (ELEVATOR_CAR.minZ + ELEVATOR_CAR.maxZ) / 2, rotY: 0 },
    desks: PLAN_DESKS,
    overflow: BEANBAGS,
    stations: STATIONS,
    meeting: MEETING_SEATS,
    byId: new Map([...PLAN_DESKS, ...BEANBAGS, ...STATIONS, ...MEETING_SEATS].map((d) => [d.id, d])),
    seating: SEATING,
    seatingById: new Map(SEATING.map((s) => [s.id, s])),
    boards,
  };
}

export const OFFICE_PLAN: OfficePlan = officePlan();
