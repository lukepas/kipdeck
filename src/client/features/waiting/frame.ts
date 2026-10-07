/**
 * Where N (and "go to unit") puts you in Walk: 2.2 m from the unit where it is now, not where its
 * console is, on the side away from the mission table, facing it and looking a touch down, so the
 * unit and its callout sit in the middle of the view with the crosshair on it. A unit that needs you
 * has glided to its pod's ready line by then, so its desk is the wrong place to look.
 */
import { DESKS, MISSION_TABLE, PODS, POD_LETTERS, READY_LINE, podOf, type DeskDef } from '../../../shared/layout';
import { heightAt } from '../../../shared/amphitheater';
import { deskPoint, type Pt } from '../../../shared/nav';
import { EYE_HEIGHT } from '../../player/camera';

/** How far from the unit you stand (m), and how far down you look (rad) when you both stand on the same floor. */
export const FRAME_DISTANCE = 2.2;
export const FRAME_PITCH = -0.12;
/**
 * How high over the unit's foot the crosshair lands (m): where FRAME_PITCH's line crosses it on the
 * same floor, its head plate, so its head and callout sit just over the middle of the view. From a
 * tier above the pit (or the pit below a tier) the pitch is what still lands it there.
 */
export const FRAME_AIM = EYE_HEIGHT + FRAME_DISTANCE * Math.tan(FRAME_PITCH);

/** The turns tried when the spot straight out is blocked: 30 degrees at a time either side, up to 180. */
const STEP = Math.PI / 6;
const TURNS = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6].map((k) => k * STEP);

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
const SIGHT_CLEAR = 0.45;
/** How much of the line short of the unit isn't checked (the unit's own stool and console are there). */
const SIGHT_SHORT = 0.7;

/** Whether nothing on the deck (a console, another unit at its stool) stands between `from` and the unit at `to`. */
export function sightClear(from: { x: number; z: number }, to: { x: number; z: number }, inTheWay: readonly Pt[] = IN_THE_WAY): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len <= SIGHT_SHORT) return true;
  const ux = dx / len;
  const uz = dz / len;
  const reach = len - SIGHT_SHORT;
  for (const [px, pz] of inTheWay) {
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
 * `walkable` or a console is in the way (`sight`), facing it. Null when nowhere round it will do (the
 * caller falls back to standing at the desk).
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
}

export function framePose(unit: { x: number; z: number; y?: number }, desk: DeskDef, opts: FrameOpts = {}): FramePose | null {
  const { walkable = () => true, sight = sightClear, floorAt = heightAt, aim = FRAME_AIM } = opts;
  const target = (unit.y ?? floorAt(unit.x, unit.z)) + aim;
  const [ox, oz] = awayFrom(unit, desk);
  for (const turn of TURNS) {
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const x = unit.x + (ox * c - oz * s) * FRAME_DISTANCE;
    const z = unit.z + (ox * s + oz * c) * FRAME_DISTANCE;
    if (!walkable(x, z) || !sight({ x, z }, unit)) continue;
    const pitch = Math.atan2(target - (floorAt(x, z) + EYE_HEIGHT), FRAME_DISTANCE);
    return { x, z, facing: Math.atan2(unit.x - x, unit.z - z), pitch };
  }
  return null;
}
