// Static office layout shared by the server (validation) and client (rendering).
// Units are meters; +y is up. The office floor spans FLOOR.minX..maxX / minZ..maxZ at y = 0.

export const FLOOR = { minX: -18, maxX: 18, minZ: -13, maxZ: 13 } as const;
/** How high the ceiling is, all the way across the room. */
export const WALL_HEIGHT = 6.8;

export interface DeskDef {
  id: string;
  x: number;
  z: number;
  /** Rotation around Y. At 0 the worker sits on the desk's +z side, facing -z. */
  rotY: number;
  label: string;
  /** A bean bag on the floor instead of a desk; the worker sits on it at (x, z), facing -z at rotY 0. */
  beanbag?: boolean;
  /** A board agent's kiosk instead of a desk (see STATIONS): the worker stands behind it. */
  station?: StationKind;
  /** A chair at the meeting room's table (see MEETING_SEATS): only a meeting seats a worker here. */
  room?: boolean;
  /** A desk in the back office (see WING): there once the floor is built out this many rows. */
  wing?: number;
}

/**
 * A console: low and angled, with the worker on its outer side facing the mission table. Its width
 * runs along the pod's arc.
 */
const DESK_WIDTH = 1.5;
const DESK_DEPTH = 0.8;
export const DESK_SIZE = { width: DESK_WIDTH, depth: DESK_DEPTH, height: 0.76 } as const;

/**
 * The mission table in the middle of the deck. Every console faces it; its top shows the floor's
 * goals as wedges and their milestones as tick rings. `r` is its radius, `h` its height.
 */
export const MISSION_TABLE = { x: 0, z: 0, r: 3.2, h: 0.95 } as const;

/** The pods' letters, round the table from the north-west, clockwise as seen from above (north is -z). */
export const POD_LETTERS = ['A', 'B', 'C', 'D'] as const;
export type PodLetter = (typeof POD_LETTERS)[number];

/**
 * The four pods: arcs of four consoles each, `radius` out from the table's middle, centred on
 * `angle` (radians round the table from +x toward +z). A north-west, B north-east, C south-east,
 * D south-west.
 */
export const PODS: readonly { letter: PodLetter; angle: number }[] = [
  { letter: 'A', angle: (-3 * Math.PI) / 4 },
  { letter: 'B', angle: -Math.PI / 4 },
  { letter: 'C', angle: Math.PI / 4 },
  { letter: 'D', angle: (3 * Math.PI) / 4 },
];
/** How far the consoles are from the table's middle, and the angle between neighbours in a pod. */
export const POD_RADIUS = 7.5;
export const CONSOLES_PER_POD = 4;
const CONSOLE_STEP = (13 * Math.PI) / 180;

/** The turn that has someone at (x, z) facing the mission table: at 0 they face -z. */
export function facingTable(x: number, z: number): number {
  return Math.atan2(x - MISSION_TABLE.x, z - MISSION_TABLE.z);
}

/** The 16 consoles, four to a pod, each turned so its worker faces the table across it. */
function buildDesks(): DeskDef[] {
  const desks: DeskDef[] = [];
  let n = 1;
  for (const pod of PODS) {
    for (let k = 0; k < CONSOLES_PER_POD; k++) {
      const a = pod.angle + (k - (CONSOLES_PER_POD - 1) / 2) * CONSOLE_STEP;
      const x = round(MISSION_TABLE.x + Math.cos(a) * POD_RADIUS);
      const z = round(MISSION_TABLE.z + Math.sin(a) * POD_RADIUS);
      desks.push({ id: `desk-${n}`, x, z, rotY: facingTable(x, z), label: `Console ${pod.letter}-${String(k + 1).padStart(2, '0')}` });
      n++;
    }
  }
  return desks;
}

/** To the millimetre, so the plan reads the same everywhere. */
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export const DESKS: DeskDef[] = buildDesks();

/** The pod a desk of the room belongs to (desk-1..4 are A, and so on), or undefined for any other seat. */
export function podOf(deskId: string): PodLetter | undefined {
  const i = DESKS.findIndex((d) => d.id === deskId);
  return i < 0 ? undefined : POD_LETTERS[Math.floor(i / CONSOLES_PER_POD)];
}

/** A pod's consoles, in order along its arc. */
export function podDesks(letter: PodLetter): DeskDef[] {
  const i = POD_LETTERS.indexOf(letter);
  return DESKS.slice(i * CONSOLES_PER_POD, (i + 1) * CONSOLES_PER_POD);
}

/**
 * The ready line: a painted double stripe on each pod's inner edge, 1.4 m out from the table, with a
 * numbered tick for each unit that needs someone. Tick 1 is whoever has waited longest. A fifth one
 * on a pod starts a second row of ticks, `row` further out.
 */
export const READY_LINE = { r: MISSION_TABLE.r + 1.4, row: 0.6, ticks: 4, spacing: 1.0 } as const;

/** Where a unit stands on its pod's ready line at tick `tick` (1 is the first), facing the table. */
export function readySpot(letter: PodLetter, tick: number): { x: number; z: number; rotY: number } {
  const pod = PODS[POD_LETTERS.indexOf(letter)];
  const i = Math.max(0, Math.floor(tick) - 1);
  const row = Math.floor(i / READY_LINE.ticks);
  const k = i % READY_LINE.ticks;
  const r = READY_LINE.r + row * READY_LINE.row;
  const a = pod.angle + (k - (READY_LINE.ticks - 1) / 2) * (READY_LINE.spacing / r);
  const x = round(MISSION_TABLE.x + Math.cos(a) * r);
  const z = round(MISSION_TABLE.z + Math.sin(a) * r);
  return { x, z, rotY: facingTable(x, z) };
}

/**
 * The structural grid stencilled on the slab's edge: a column line every `step` meters from the
 * north-west corner, lettered A to H across (west to east) and numbered 1 to 6 down (north to south),
 * so every spot on the deck has a cell address, like "C4".
 */
export const GRID = { step: 4.5, cols: 'ABCDEFGH', rows: 6 } as const;

/** The cell (x, z) is in: its column's letter and its row's number. Off the deck it's the nearest cell. */
export function cellOf(x: number, z: number): string {
  const col = Math.max(0, Math.min(GRID.cols.length - 1, Math.floor((x - FLOOR.minX) / GRID.step)));
  const row = Math.max(0, Math.min(GRID.rows - 1, Math.floor((z - FLOOR.minZ) / GRID.step)));
  return `${GRID.cols[col]}${row + 1}`;
}

/**
 * The back office: a bay knocked through the north wall between the elevator and the east wall, for a
 * floor that needs more desks than the room has. Each time someone expands the floor (see
 * shared/floorplan.ts), its back wall goes another `row` meters north, with two more desks back to
 * back in the middle, up to `rows` times. It runs from `minX` (a bit of wall stays by the elevator) to the east wall,
 * and from the old north wall back to wingMinZ.
 */
export const WING = { minX: 13.4, maxX: FLOOR.maxX, row: 4.6, rows: 2 } as const;

/** A floor built out `level` rows, as a whole number from 0 (just the room) to WING.rows. */
export function wingLevel(level: unknown): number {
  return typeof level === 'number' && Number.isFinite(level) ? Math.max(0, Math.min(WING.rows, Math.floor(level))) : 0;
}

/** How far north the back office's back wall is, built out `level` rows: the north wall with none. */
export function wingMinZ(level: number): number {
  return FLOOR.minZ - wingLevel(level) * WING.row;
}

/** Whether (x, z) is in the back office, built out `level` rows. */
export function inWing(x: number, z: number, level: number): boolean {
  return level > 0 && x > WING.minX && x < WING.maxX && z <= FLOOR.minZ && z > wingMinZ(level);
}

/** The middle of the back office's row `row` (1 is the first, through the old north wall). */
export function wingRowZ(row: number): number {
  return FLOOR.minZ - (row - 0.5) * WING.row;
}

/**
 * The back office's desks: a back-to-back pair down the middle of each row, like half a pod, with
 * room to walk round either side. The far one's worker faces the room; the near one's faces the back.
 */
export const WING_DESKS: DeskDef[] = Array.from({ length: WING.rows }, (_, i) => {
  const z = wingRowZ(i + 1);
  const x = (WING.minX + WING.maxX) / 2;
  const n = DESKS.length + 2 * i + 1;
  return [
    { id: `desk-${n}`, x, z: z - DESK_DEPTH / 2, rotY: Math.PI, label: `Overflow ${2 * i + 1}`, wing: i + 1 },
    { id: `desk-${n + 1}`, x, z: z + DESK_DEPTH / 2, rotY: 0, label: `Overflow ${2 * i + 2}`, wing: i + 1 },
  ];
}).flat();

/** Whether `desk` is there on a floor built out `level` rows: every desk in the room is. */
export function deskBuilt(desk: DeskDef, level: number): boolean {
  return !desk.wing || desk.wing <= level;
}

/** Every desk on a floor built out `level` rows: the room's, then the back office's. */
export function builtDesks(level: number): DeskDef[] {
  return [...DESKS, ...WING_DESKS.filter((d) => deskBuilt(d, level))];
}

/**
 * Overflow seats: the Standby bench along the south curb. Once every console is taken its seats come
 * out one at a time in this order, west to east, each facing into the deck (-z) with a low stand in
 * front of it and a walkway behind it along the curb. A parked unit waits here, dimmed.
 */
export const BEANBAGS: DeskDef[] = Array.from({ length: 12 }, (_, i) => ({
  id: `beanbag-${i + 1}`,
  x: round(-16.4 + i * 1.4),
  z: FLOOR.maxZ - 2.5,
  rotY: 0,
  label: `Standby ${i + 1}`,
  beanbag: true,
}));

/** Everywhere a worker can sit: the desks, the back office's once it's built out (see deskBuilt), then the bean bags. */
export const SEATS: DeskDef[] = [...DESKS, ...WING_DESKS, ...BEANBAGS];

/** The boards with an agent standing by: the Issues board, the PR board and the task queue. */
export type StationKind = 'issues' | 'pulls' | 'queue';

/**
 * The board agents: a worker standing behind a slim lectern at the west end of each panel of the Main
 * board (see BOARDS), there for anyone to prompt about it. (x, z) is the lectern. They face into the
 * deck, so at rotY PI the worker stands on the wall side of it. Nobody hires them from the consoles or
 * the queue.
 */
export const STATIONS: DeskDef[] = [
  { id: 'station-issues', station: 'issues', x: -11.8, z: FLOOR.minZ + 1.3, rotY: Math.PI, label: 'Issues board' },
  { id: 'station-pulls', station: 'pulls', x: 1.0, z: FLOOR.minZ + 1.3, rotY: Math.PI, label: 'PR board' },
  { id: 'station-queue', station: 'queue', x: -5.4, z: FLOOR.minZ + 1.3, rotY: Math.PI, label: 'Task queue' },
];
/** A board agent's kiosk: its top, and how far behind its middle (toward the wall) the agent stands. */
export const KIOSK = { width: 0.8, depth: 0.5, height: 0.55, stand: 0.55 } as const;
/** Each board agent's name and its color, the same whenever it's hired. */
export const STATION_AGENT: Record<StationKind, { name: string; color: string }> = {
  issues: { name: 'Issues agent', color: '#8FA3B9' },
  pulls: { name: 'PR agent', color: '#A98FB9' },
  queue: { name: 'Queue agent', color: '#9FB98F' },
};

/**
 * The Review bay (the meeting room): smoked glass in the south-east corner, out to the outside walls,
 * with a small table in the middle. Units called to a review sit round it (see MEETING_SEATS and
 * server/meetings.ts). The door is in the north glass, facing the deck.
 */
export const MEETING_ROOM = { minX: 9.15, maxX: FLOOR.maxX, minZ: 8.15, maxZ: FLOOR.maxZ, height: 2.75, door: { x0: 10, x1: 11.4 } } as const;
export const MEETING_TABLE = { x: 13.7, z: 10.55, width: 3.6, depth: 1.2, height: 0.76 } as const;
/**
 * The chairs round the meeting table, in the order a meeting fills them: the head of the table at its
 * west end (whoever leads or writes the meeting up), then two down each side. (x, z) is where the
 * laptop sits on the table; the chair is out from it the way a desk's is (deskSeat).
 */
export const MEETING_SEATS: DeskDef[] = (
  [
    [MEETING_TABLE.x - MEETING_TABLE.width / 2 + 0.35, MEETING_TABLE.z, -Math.PI / 2],
    [MEETING_TABLE.x - 0.6, MEETING_TABLE.z - MEETING_TABLE.depth / 2 + 0.35, Math.PI],
    [MEETING_TABLE.x - 0.6, MEETING_TABLE.z + MEETING_TABLE.depth / 2 - 0.35, 0],
    [MEETING_TABLE.x + 1.1, MEETING_TABLE.z - MEETING_TABLE.depth / 2 + 0.35, Math.PI],
    [MEETING_TABLE.x + 1.1, MEETING_TABLE.z + MEETING_TABLE.depth / 2 - 0.35, 0],
  ] as const
).map(([x, z, rotY], i) => ({ id: `meeting-${i + 1}`, x, z, rotY, label: i === 0 ? 'Head of the table' : `Meeting chair ${i + 1}`, room: true }));
/**
 * The board in the Review bay that shows the review's output file as it's written: on the east wall
 * (the south side is only a curb), facing the head of the table. `rotY` is the way it faces.
 */
export const MEETING_BOARD = { x: FLOOR.maxX - 0.08, y: 1.75, z: MEETING_TABLE.z, rotY: -Math.PI / 2, width: 3.6, height: 1.6 } as const;

/** Any place a worker can be by id: the seats (the back office's included), the board agents' kiosks and the meeting room's chairs. */
export const DESK_BY_ID = new Map([...SEATS, ...STATIONS, ...MEETING_SEATS].map((d) => [d.id, d]));

/**
 * The seat a new worker takes when nobody picks one: the first free desk (in the back office too, as
 * far as the floor is built out: `wing` rows), else the first free bean bag.
 */
export function nextFreeSeat(taken: (id: string) => boolean, wing = 0): DeskDef | undefined {
  return SEATS.find((d) => !taken(d.id) && deskBuilt(d, wing));
}

/**
 * The bean bags that are out: every one in use, and while every desk is taken (the back office's
 * too, built out `wing` rows), the next free one too, so there's always somewhere to hire the next worker.
 */
export function beanbagsOut(taken: (id: string) => boolean, wing = 0): Set<string> {
  const out = new Set(BEANBAGS.filter((b) => taken(b.id)).map((b) => b.id));
  if (builtDesks(wing).every((d) => taken(d.id))) {
    const spare = BEANBAGS.find((b) => !taken(b.id));
    if (spare) out.add(spare.id);
  }
  return out;
}

/**
 * The places nobody is at: every seat and board agent's kiosk with no worker there and nobody sent
 * home still packing up there (`packing`). Each shows that it's free, with a '+' over a seat and the
 * board agent waiting at a kiosk. It's worked out afresh from who's there rather than seat by seat as
 * workers come and go, so swapping one floor's workers for another's never leaves a place showing
 * free under someone (two floors can each have a Queue agent at the same kiosk).
 */
export function vacantSeats(workers: Iterable<{ deskId: string }>, packing: (id: string) => boolean = () => false): Set<string> {
  const taken = new Set<string>();
  for (const w of workers) taken.add(w.deskId);
  return new Set([...DESK_BY_ID.keys()].filter((id) => !taken.has(id) && !packing(id)));
}

/** Where the worker (and the interacting player) stands relative to the desk. */
export function deskSeat(desk: DeskDef, offset = 0.85): { x: number; z: number } {
  return {
    x: desk.x + Math.sin(desk.rotY) * offset,
    z: desk.z + Math.cos(desk.rotY) * offset,
  };
}

/** Wall boards. `rotY` is the way the board faces (0 = +z, like the north-wall boards). */
export const BOARDS = {
  // The Main board: three panels edge to edge along the north wall, the way work goes: an issue goes
  // on the task queue, and its unit's pull request comes out the other side. Each has its board
  // agent's lectern at its west end (see STATIONS).
  issues: { x: -9.4, y: 2.45, z: FLOOR.minZ + 0.08, rotY: 0, width: 6.2, height: 2.9, label: 'Issues' },
  queue: { x: -3.2, y: 2.45, z: FLOOR.minZ + 0.08, rotY: 0, width: 6.2, height: 2.9, label: 'Queue' },
  pulls: { x: 3.0, y: 2.45, z: FLOOR.minZ + 0.08, rotY: 0, width: 6.2, height: 2.9, label: 'Pull requests' },
  // East wall, north of the Attention board.
  services: { x: FLOOR.maxX - 0.08, y: 2.45, z: -8.6, rotY: -Math.PI / 2, width: 6, height: 2.9, label: 'Services' },
} as const;

/**
 * The Attention board on the east wall (the TV's slot): the live ranked list, in the order of the top
 * bar's strip, and whatever someone shares while they share it.
 */
export const TV = { x: FLOOR.maxX - 0.1, y: 2.45, z: 0, width: 6.4, height: 3.6 } as const;
/**
 * The capacity panel at the head of the Proof corner on the west wall, facing the deck: how busy the
 * office's machine is, and how many units it runs of the most it takes.
 */
export const MACHINE_MONITOR = { x: FLOOR.minX, y: 2.3, z: -9.2, width: 2.6, height: 1.5 } as const;

/**
 * The Proof corner along the west wall, south of the capacity panel: the violet attestation rail on
 * the wall (one lit segment per merge, a growing tally), the escrow vault console with its hinged lid,
 * and the stepped ERC-8004 reputation plinth. All of it is lower than 1.1 m but the rail.
 */
export const PROOF_CORNER = {
  rail: { z: -6.3, y0: 0.45, y1: 4.65, width: 0.32, segments: 16 },
  vault: { x: FLOOR.minX + 1.25, z: -4.1, width: 1.4, depth: 0.9, height: 0.82 },
  plinth: { x: FLOOR.minX + 1.25, z: -1.7, width: 1.3, depth: 1.3, steps: 4, rise: 0.18 },
} as const;

/**
 * The docs rack (every Markdown file in the project, see shared/docs.ts): against the north wall
 * west of the Main board, facing into the deck. `width` runs along the wall, `rotY` is the way it faces.
 */
export const BOOKSHELF = { x: -15.6, z: FLOOR.minZ + 0.21, rotY: 0, width: 1.7, depth: 0.42, height: 2.3 } as const;

export const SPAWN = { x: 8, z: 7 } as const;

/**
 * The title block stencilled on the floor in the south-east, west of the Review bay: a ruled
 * rectangle with the deck's name, its revision, its operator and the credit to agent-office.
 */
export const TITLE_BLOCK = { minX: 1.4, maxX: 8.4, minZ: 10.3, maxZ: 12.6 } as const;

/** How high the south wall stands: only a curb, so the Overview sees every unit over it. */
export const SOUTH_CURB = 0.4;

/** The tallest anything may stand between the mission table and any console (see tests/layout.test.ts). */
export const SIGHTLINE = 1.1;

/** Potted plants round the room: none on the deck. */
export const PLANTS: readonly (readonly [x: number, z: number, scale: number])[] = [];

/** A plant by the north wall east of the elevator, in the way into the back office: put away once it's built. */
export function plantByWing([x, z]: readonly [number, number, number]): boolean {
  return x > WING.minX && z < FLOOR.minZ + 1.5;
}

/** The plants standing on a floor built out `level` rows (see WING). */
export function plantsAt(level: number): readonly (readonly [x: number, z: number, scale: number])[] {
  return level > 0 ? PLANTS.filter((p) => !plantByWing(p)) : PLANTS;
}

/**
 * The whiteboard on wheels everyone draws on together, out on the open floor in the east aisle,
 * facing north toward the operator bench (`rotY` PI faces -z). `width` and `height` are its writing
 * surface, whose bottom edge is `bottom` above the floor.
 */
export const WHITEBOARD = { x: 14.2, z: 6.3, rotY: Math.PI, width: 4, height: 2.2, bottom: 0.5 } as const;

/** The office's floor slab: it runs from -SLAB up to 0. */
export const SLAB = 0.3;
/** How thick the outside walls are. They stand just outside FLOOR. */
export const WALL_T = 0.3;

export type Side = 'north' | 'south' | 'east' | 'west';

/**
 * A hole in an outside wall: `u` is its center along the wall (x on the north and south walls, z on
 * the east and west ones), `y0`..`y1` its sill and head above the office floor.
 */
export interface Opening {
  wall: Side;
  u: number;
  width: number;
  y0: number;
  y1: number;
}

/** Windows you can see out of: none, the deck floats in the void. */
export const WINDOWS: Opening[] = [];

/**
 * Something to sit on, standing at x, z on the floor at `y`. You
 * sit facing `rotY` (0 = +z). A couch has a few places side by side; a chair or a beanbag has one.
 */
export interface SeatDef {
  id: string;
  /** What the hint calls it. */
  label: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  /** Where each place is along it, sideways from its middle. */
  places: readonly number[];
  /** How high above its floor your hips go: on the cushion, sunk in a little. */
  hips: number;
  /** How far in front of its middle you sit (negative: further back, against the backrest). */
  depth: number;
  /** Getting up, you step off this far in front of where you sat (negative: behind, away from a desk or a table). */
  out: number;
  /** It faces the lounge TV: sitting down there puts whatever's being shared up on your screen. */
  tv?: boolean;
}

/**
 * Where people can sit: the operator bench and its stools (buildOffice puts them there). Units have their own seats, the consoles and the Standby bench in SEATS.
 */
export const SEATING: SeatDef[] = [
  // The operator bench in the east aisle, facing the Attention board.
  { id: 'couch', label: 'Operator bench', x: 11.6, y: 0, z: 0, rotY: Math.PI / 2, places: [-1.2, 0, 1.2], hips: 0.5, depth: -0.05, out: 0.9, tv: true },
  // A stool either side of it, turned to the board.
  { id: 'lounge-beanbag-1', label: 'Stool', x: 13.4, y: 0, z: 3.2, rotY: Math.atan2(TV.x - 13.4, TV.z - 3.2), places: [0], hips: 0.42, depth: -0.1, out: 1.2 },
  { id: 'lounge-beanbag-2', label: 'Stool', x: 13.4, y: 0, z: -3.2, rotY: Math.atan2(TV.x - 13.4, TV.z + 3.2), places: [0], hips: 0.42, depth: -0.1, out: 1.2 },
];
export const SEATING_BY_ID = new Map(SEATING.map((s) => [s.id, s]));

/** One place on a seat: where your feet go on its floor, the way you face, and the rest of what sitting there takes. */
export interface SeatPlace {
  /** What a peer's `seat` says while they sit here: the seat's id and which place, like "couch:1". */
  key: string;
  seatId: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  hips: number;
  out: number;
}

export function seatPlace(seat: SeatDef, i: number): SeatPlace {
  const fx = Math.sin(seat.rotY);
  const fz = Math.cos(seat.rotY);
  const along = seat.places[i] ?? 0;
  return {
    key: `${seat.id}:${i}`,
    seatId: seat.id,
    x: seat.x + fx * seat.depth + fz * along,
    y: seat.y,
    z: seat.z + fz * seat.depth - fx * along,
    rotY: seat.rotY,
    hips: seat.hips,
    out: seat.out,
  };
}

/** The place a peer's `seat` names, or undefined if there's no such place. */
export function seatAt(key: string): SeatPlace | undefined {
  const m = /^([\w-]+):(\d+)$/.exec(key);
  const seat = m ? SEATING_BY_ID.get(m[1]) : undefined;
  const i = Number(m?.[2]);
  return seat && i < seat.places.length ? seatPlace(seat, i) : undefined;
}

/**
 * The Deck lift (the elevator): a flush portal in the north wall, east of the Main board, opening into
 * the deck. Every deck has it in the same spot, so you step out where you got in.
 */
export const ELEVATOR = { x: 8.5, width: 2.6, depth: 2.4, wall: 0.14, doorWidth: 1.4, doorHeight: 2.4 } as const;
/** Where the doors are: the front of the shaft. */
export const ELEVATOR_FRONT = FLOOR.minZ + ELEVATOR.depth;
/** The inside of the car, where you stand to ride. */
export const ELEVATOR_CAR = {
  minX: ELEVATOR.x - ELEVATOR.width / 2 + ELEVATOR.wall,
  maxX: ELEVATOR.x + ELEVATOR.width / 2 - ELEVATOR.wall,
  minZ: FLOOR.minZ,
  maxZ: ELEVATOR_FRONT - ELEVATOR.wall,
} as const;

/** Somewhere inside the car, facing the doors (+z), a little apart from anyone else arriving. */
export function elevatorSpot(): { x: number; z: number } {
  return {
    x: ELEVATOR.x + (Math.random() - 0.5) * 0.7,
    z: (ELEVATOR_CAR.minZ + ELEVATOR_CAR.maxZ) / 2 + (Math.random() - 0.5) * 0.6,
  };
}

export function inElevator(x: number, z: number): boolean {
  return x > ELEVATOR_CAR.minX && x < ELEVATOR_CAR.maxX && z > ELEVATOR_CAR.minZ && z < ELEVATOR_CAR.maxZ;
}

