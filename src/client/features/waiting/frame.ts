/**
 * Where N (and "go to unit", and Mission control's Locate) puts you in Walk: 2.2 m from the unit where
 * it is now, not where its console is, on the side away from the mission table, facing it and looking
 * about 10 degrees down at its chest, so the whole unit, its station and its callout over it are in
 * view with the crosshair on it. A unit that needs you has glided to its pod's ready line by then, so
 * its desk is the wrong place to look. One still at its console is seen from 60 degrees or more round
 * to the side, never square from behind (straight out from it you'd look at its back, its head filling
 * the view and its console hidden behind it), from FRAME_NEAR where its neighbours block FRAME_DISTANCE.
 */
import { DESKS, MISSION_TABLE, PODS, POD_LETTERS, READY_LINE, podOf, type DeskDef } from '../../../shared/layout';
import { heightAt } from '../../../shared/amphitheater';
import { deskPoint, type Pt } from '../../../shared/nav';
import { EYE_HEIGHT } from '../../player/camera';

/** How far from the unit you stand (m), and how far down you look (rad) when you both stand on the same floor. */
export const FRAME_DISTANCE = 2.2;
/**
 * The closer spot tried when nothing round the unit at FRAME_DISTANCE will do (m): a unit at its console
 * has its neighbours' stools along the row and the tier's consoles behind it, which block every line of
 * sight from 2.2 m, so without it you'd land at its desk, square on its back.
 */
export const FRAME_NEAR = 1.6;
export const FRAME_PITCH = -0.17;
/** The steepest you're left looking down (rad): from a tier above, any steeper and the unit's callout leaves the top of the view. */
export const FRAME_PITCH_MIN = -0.36;
/**
 * How high over the unit's foot the crosshair lands (m): where FRAME_PITCH's line crosses it on the
 * same floor, its upper chest, so the whole unit shows with its callout over it. From a tier above the
 * pit (or the pit below a tier) the pitch is what still lands it there.
 */
export const FRAME_AIM = EYE_HEIGHT + FRAME_DISTANCE * Math.tan(FRAME_PITCH);

/** The turns tried when the spot straight out is blocked: 30 degrees at a time either side, up to 180. */
const STEP = Math.PI / 6;
const TURNS = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6].map((k) => k * STEP);
/** For a unit at its console: 60 degrees round or more, either side (tried at FRAME_DISTANCE, then FRAME_NEAR). */
export const SIDE_TURNS = [2, -2, 3, -3, 4, -4].map((k) => k * STEP);
/** Then, only where no side spot will do at either distance: 30 degrees round, and its back. */
const BACK_TURNS = [1, -1, 0, 5, -5, 6].map((k) => k * STEP);

export interface FramePose {
  x: number;
  z: number;
  /** Your character's turn (as actions.standAt sets it): the camera's yaw is this less a half turn. */
  facing: number;
  /** The view's pitch (player.lookPitch). */
  pitch: number;
}

/**
 * What would stand between you and the unit: each console's middle and ends, and the stool behind it
 * where its own unit sits. Points, with SIGHT_CLEAR round each kept clear of the line of sight.
 */
const IN_THE_WAY: readonly Pt[] = DESKS.flatMap((d) => [deskPoint(d, -0.5, 0), deskPoint(d, 0, 0), deskPoint(d, 0.5, 0), deskPoint(d, 0, 1.0)]);
/** Each desk's stool point in IN_THE_WAY: its own unit sits there, so it never stands in the way of seeing that unit. */
export const STOOL_OF = new Map<string, Pt>(DESKS.map((d, i) => [d.id, IN_THE_WAY[i * 4 + 3]]));
/** How far a console's points keep the line of sight off. */
const SIGHT_CLEAR = 0.45;
/**
 * How much of the line short of the unit isn't checked: the unit itself and its stool. Its own console
 * is checked like any other, so you never end up looking at it across its console (standing on the
 * table's side of a seated unit, its console filling the view).
 */
const SIGHT_SHORT = 0.35;

/**
 * Whether nothing on the deck (a console, another unit at its stool) stands between `from` and the unit
 * at `to`; `own` is a point left out (the unit's own stool, STOOL_OF).
 */
export function sightClear(from: { x: number; z: number }, to: { x: number; z: number }, inTheWay: readonly Pt[] = IN_THE_WAY, own?: Pt): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len <= SIGHT_SHORT) return true;
  const ux = dx / len;
  const uz = dz / len;
  const reach = len - SIGHT_SHORT;
  for (const p of inTheWay) {
    if (p === own) continue;
    const [px, pz] = p;
    const t = Math.max(0, Math.min(reach, (px - from.x) * ux + (pz - from.z) * uz));
    if (Math.hypot(from.x + ux * t - px, from.z + uz * t - pz) < SIGHT_CLEAR) return false;
  }
  return true;
}

/** Whether a unit at (x, z) of desk `desk`'s pod stands on the ready line round the pit. */
export function onReadyLine(unit: { x: number; z: number }, desk: DeskDef): boolean {
  if (!podOf(desk.id)) return false;
  const r = Math.hypot(unit.x - MISSION_TABLE.x, unit.z - MISSION_TABLE.z);
  // Its first row is READY_LINE.r out, a second one `row` further in.
  return r > READY_LINE.r + READY_LINE.row - 0.4 && r < READY_LINE.r + 0.5;
}

/** The way out from the unit, away from the table: a unit length (dx, dz). */
function awayFrom(unit: { x: number; z: number }, desk: DeskDef): [number, number] {
  const pod = podOf(desk.id);
  if (pod && onReadyLine(unit, desk)) {
    const a = PODS[POD_LETTERS.indexOf(pod)].ready;
    return [Math.cos(a), Math.sin(a)];
  }
  // At its seat it sits on the far side of its console from the table, so desk to unit points out.
  let dx = unit.x - desk.x;
  let dz = unit.z - desk.z;
  if (Math.hypot(dx, dz) < 0.2) {
    dx = unit.x - MISSION_TABLE.x;
    dz = unit.z - MISSION_TABLE.z;
  }
  const n = Math.hypot(dx, dz);
  return n < 1e-6 ? [0, 1] : [dx / n, dz / n];
}

/**
 * Where to stand to frame the unit at `unit` (its live place) whose console is `desk`: FRAME_DISTANCE
 * out from it away from the table, turned 30 degrees at a time either side when that spot isn't
 * `walkable` or a console is in the way (`sight`), facing it; at FRAME_NEAR when nothing at
 * FRAME_DISTANCE will do. Of the spots that will do, one on the unit's own tier comes first, and the
 * view never looks down steeper than FRAME_PITCH_MIN. Null when nowhere round it will do (the caller
 * falls back to standing at the desk).
 */
export interface FrameOpts {
  /** Whether you can stand at (x, z): the nav grid's cells (shared/nav.ts). */
  walkable?: (x: number, z: number) => boolean;
  /** Whether nothing stands between you and the unit (sightClear). */
  sight?: (from: { x: number; z: number }, to: { x: number; z: number }) => boolean;
  /** The floor's height at (x, z) (shared/amphitheater.ts). */
  floorAt?: (x: number, z: number) => number;
  /** How high over the unit's foot to look (FRAME_AIM, times its scale). */
  aim?: number;
  /** How far out to stand (m): FRAME_DISTANCE, or less where a desk's reach is shorter. */
  distance?: number;
}

export function framePose(unit: { x: number; z: number; y?: number }, desk: DeskDef, opts: FrameOpts = {}): FramePose | null {
  const { distance = FRAME_DISTANCE } = opts;
  const at = (turns: readonly number[]) => frameAt(unit, desk, opts, distance, turns) ?? (distance > FRAME_NEAR ? frameAt(unit, desk, opts, FRAME_NEAR, turns) : null);
  // On the ready line straight out first (behind it, the table beyond); at its console from the side.
  const seated = !podOf(desk.id) || !onReadyLine(unit, desk);
  return seated ? (at(SIDE_TURNS) ?? at(BACK_TURNS)) : at(TURNS);
}

/** framePose at `distance` out from the unit, trying `turns` in order, or null when none of them will do. */
function frameAt(unit: { x: number; z: number; y?: number }, desk: DeskDef, opts: FrameOpts, distance: number, turns: readonly number[]): FramePose | null {
  const own = STOOL_OF.get(desk.id);
  const { walkable = () => true, sight = (f, t) => sightClear(f, t, IN_THE_WAY, own), floorAt = heightAt, aim = FRAME_AIM } = opts;
  const foot = unit.y ?? floorAt(unit.x, unit.z);
  const target = foot + aim;
  const [ox, oz] = awayFrom(unit, desk);
  // Every spot round it that will do, in the order tried.
  const spots: { x: number; z: number; step: number; order: number }[] = [];
  turns.forEach((turn, order) => {
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const x = unit.x + (ox * c - oz * s) * distance;
    const z = unit.z + (ox * s + oz * c) * distance;
    if (!walkable(x, z) || !sight({ x, z }, unit)) return;
    spots.push({ x, z, step: Math.abs(floorAt(x, z) - foot), order });
  });
  if (!spots.length) return null;
  // On the unit's own tier first, so you face it level rather than looking down on it from the one above.
  spots.sort((a, b) => (Math.abs(a.step - b.step) > 0.05 ? a.step - b.step : a.order - b.order));
  const { x, z } = spots[0];
  const pitch = Math.max(FRAME_PITCH_MIN, Math.atan2(target - (floorAt(x, z) + EYE_HEIGHT), distance));
  return { x, z, facing: Math.atan2(unit.x - x, unit.z - z), pitch };
}
