// Climbing the forward lounge's ladder, as plain numbers for the tests (tests/lounge.test.ts): from the
// deck onto the ladder, hand over hand up it, over its head onto the balcony, and the same way down.
// While a climb is on it has hold of you (PlayerController.rig): it moves your feet and turns your head,
// and walking, falling and bumping into things wait until you're off. No three.js here. The feel is
// upstream agent-office's ladder (origin/main src/client/features/climbing/controller.ts, MIT): the
// eased walk onto it, a hand planted on a rung while you move past it (grips.ts), the smoothstep step off
// with its little hop and the turn of the head the short way round, retuned for a short ladder up to a
// balcony.

import { LADDER, LOUNGE } from '../../../shared/lounge';
import { EYE_HEIGHT } from '../../player/camera';
import { FACE_Z, Grips, type P3 } from './grips';

/** How fast you go up and down the ladder (m/s), on average: each pull is quicker than the pause between. */
export const CLIMB = 1.7;
/** How long getting onto the ladder at its foot takes (s), stepping over its head onto the balcony, onto it from up there, and off it at the foot. */
export const MOUNT = 0.4;
export const OVER = 0.55;
export const ONTO = 0.6;
export const OFF = 0.45;
/** How high the hop over the ladder's head goes (m), and where you look as you take hold of the ladder (radians, up). */
const HOP = 0.12;
const LOOK_UP = 0.1;
/** On the rungs your eyes follow your hands: this share of the way toward them, never further than LOOK_RANGE. */
const LOOK_HANDS = 0.75;
const LOOK_RANGE = { down: -0.5, up: 0.35 } as const;
/** Where you look once you're off: a touch under the horizon, as standing does. */
const LOOK_LEVEL = -0.08;

/** Where a climb is: onto the ladder at its foot, up it, over its head, onto it from the balcony, down it, off it at the foot. */
export type ClimbPhase = 'mount' | 'up' | 'over' | 'onto' | 'down' | 'off';

/** What a climb moves: your feet, your facing (0 is +z) and, in first person, your head. */
export interface ClimbBody {
  pos: { x: number; y: number; z: number };
  facing: number;
  camYaw: number;
  lookPitch: number;
  walkPhase: number;
  view: 'first' | 'third';
}

/** What a frame of climbing heard: hands on the ladder, a hand closing on its next rung, your feet onto the balcony or the deck. */
export type ClimbEvent = 'grab' | 'rung' | 'top' | 'bottom';

/** Which way the keys ask to go: up (W), down (S), or nothing. */
export type ClimbAsk = 1 | -1 | 0;

const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** The angle from `a` to `b` the short way round. */
export const turn = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Facing the rungs: north, the bow (0 is +z). In first person, the camera's yaw for it. */
const FACE_LADDER = Math.PI;
const CAM_LADDER = 0;
/** Facing the room, off the ladder at its foot: south, toward the table. */
const FACE_ROOM = 0;
const CAM_ROOM = Math.PI;

/**
 * One climb, up from the deck or down from the balcony, from `start` to off the other end. `step`
 * moves the body a frame's worth and says what it heard; `done` once you're off it, on your feet.
 */
export class Climb {
  phase: ClimbPhase;
  /** Seconds into the phase (for the timed ones). */
  private t = 0;
  /** Where the timed phase started from. */
  private from: { x: number; y: number; z: number; facing: number; camYaw: number; pitch: number };
  /** Your hands on the rungs, planted while you move past them (grips.ts); null until you take hold. */
  grips: Grips | null = null;
  done = false;

  constructor(
    private readonly body: ClimbBody,
    /** Up from the foot, or down from the balcony. */
    readonly way: 'up' | 'down',
    /** How high your eyes are over your feet. */
    private readonly eye = EYE_HEIGHT,
  ) {
    this.phase = way === 'up' ? 'mount' : 'onto';
    this.from = this.snap();
  }

  /** Where hand `side` (1 right, -1 left) holds the ladder now, in the deck's metres; null while it doesn't. */
  hand(side: 1 | -1, out: P3): P3 | null {
    return this.grips && this.onRungs() ? this.grips.point(side, out) : null;
  }

  private snap() {
    const b = this.body;
    return { x: b.pos.x, y: b.pos.y, z: b.pos.z, facing: b.facing, camYaw: b.camYaw, pitch: b.lookPitch };
  }

  private next(phase: ClimbPhase) {
    this.phase = phase;
    this.t = 0;
    this.from = this.snap();
  }

  /** Whether you're on the rungs (hands on the ladder): everything but stepping off at the ends. */
  onRungs(): boolean {
    return !this.done && this.phase !== 'off' && this.phase !== 'over';
  }

  /** How far up the ladder you are, 0 at the deck to 1 at the balcony. */
  height(): number {
    return Math.min(1, Math.max(0, this.body.pos.y / LOUNGE.top));
  }

  /**
   * A frame: `dt` seconds, `ask` the way the keys want to go (W up, S down: either turns the climb
   * round on the rungs), `still` for less motion (no hop, an even climb, and the head turned at once).
   * Says what it heard. Returns whether you moved.
   */
  step(dt: number, ask: ClimbAsk, still: boolean, heard: (e: ClimbEvent) => void): boolean {
    if (this.done) return false;
    const b = this.body;
    const first = b.view === 'first';
    this.t += dt;
    switch (this.phase) {
      case 'mount': {
        // Onto the ladder at its foot: square up to it, hands on it, eyes up the rungs.
        const k = smooth(still ? 1 : this.t / MOUNT);
        b.pos.x = lerp(this.from.x, LADDER.x, k);
        b.pos.z = lerp(this.from.z, LADDER.on, k);
        b.pos.y = lerp(this.from.y, 0, k);
        b.facing = this.from.facing + turn(this.from.facing, FACE_LADDER) * k;
        if (first) {
          b.camYaw = this.from.camYaw + turn(this.from.camYaw, CAM_LADDER) * k;
          b.lookPitch = lerp(this.from.pitch, LOOK_UP, k);
        }
        if (this.t === dt) {
          heard('grab');
          // Hands on the rungs in front of you as you square up, where your eyes will be on it.
          this.grips = new Grips(this.eye);
        }
        if (still || this.t >= MOUNT) this.next('up');
        return true;
      }
      case 'up':
      case 'down': {
        // Hand over hand: S on the way up (or W on the way down) turns you round on the rungs.
        if (ask !== 0 && (ask > 0) !== (this.phase === 'up')) this.phase = ask > 0 ? 'up' : 'down';
        const dir = this.phase === 'up' ? 1 : -1;
        b.pos.x = LADDER.x;
        b.pos.z = LADDER.on;
        b.facing = FACE_LADDER;
        // Each pull quicker than the shift of grip between (an even climb with less motion), CLIMB on average.
        const pull = still ? 1 : 0.35 + 1.3 * Math.sin(b.walkPhase / 2) ** 2;
        b.pos.y = Math.min(LOUNGE.top, Math.max(0, b.pos.y + dir * CLIMB * pull * dt));
        b.walkPhase += dt * 7.5;
        // A hand goes over to the next rung once your body has moved past it; the clank as it lands.
        const grips = (this.grips ??= new Grips(b.pos.y + this.eye));
        grips.step(dt, b.pos.y + this.eye, dir, still, () => heard('rung'));
        // Your eyes on your hands, so they stay in the frame as you go.
        if (first) {
          const want = Math.max(LOOK_RANGE.down, Math.min(LOOK_RANGE.up, Math.atan2(grips.middle() - (b.pos.y + this.eye), LADDER.on - FACE_Z) * LOOK_HANDS));
          b.lookPitch = still ? want : b.lookPitch + (want - b.lookPitch) * Math.min(1, dt * 5);
        }
        if (dir > 0 && b.pos.y >= LOUNGE.top) this.next('over');
        else if (dir < 0 && b.pos.y <= 0) this.next('off');
        return true;
      }
      case 'over': {
        // Over the ladder's head between its posts, a little hop up onto the balcony, the head coming level.
        const k = smooth(still ? 1 : this.t / OVER);
        b.pos.x = LADDER.x;
        b.pos.z = lerp(this.from.z, LADDER.top, k);
        b.pos.y = LOUNGE.top + (still ? 0 : Math.sin(Math.PI * k) * HOP);
        if (first) b.lookPitch = lerp(this.from.pitch, LOOK_LEVEL, k);
        if (still || this.t >= OVER) return this.finish('top', heard);
        return true;
      }
      case 'onto': {
        // From the balcony onto the ladder's head: turn round to face it, step back over and down onto the rungs.
        const k = smooth(still ? 1 : this.t / ONTO);
        b.pos.x = lerp(this.from.x, LADDER.x, k);
        b.pos.z = lerp(this.from.z, LADDER.on, k);
        b.pos.y = lerp(this.from.y, LOUNGE.top - 0.3, k) + (still ? 0 : Math.sin(Math.PI * k) * HOP * 0.6);
        b.facing = this.from.facing + turn(this.from.facing, FACE_LADDER) * k;
        if (first) {
          b.camYaw = this.from.camYaw + turn(this.from.camYaw, CAM_LADDER) * k;
          b.lookPitch = lerp(this.from.pitch, -0.2, k);
        }
        if (this.t === dt) {
          heard('grab');
          this.grips = new Grips(LOUNGE.top - 0.3 + this.eye);
        }
        if (still || this.t >= ONTO) this.next('down');
        return true;
      }
      case 'off': {
        // Off the foot of the ladder, back a step and round to face the room.
        const k = smooth(still ? 1 : this.t / OFF);
        b.pos.x = LADDER.x;
        b.pos.z = lerp(this.from.z, LADDER.foot, k);
        b.pos.y = 0;
        b.facing = this.from.facing + turn(this.from.facing, FACE_ROOM) * k;
        if (first) {
          b.camYaw = this.from.camYaw + turn(this.from.camYaw, CAM_ROOM) * k;
          b.lookPitch = lerp(this.from.pitch, LOOK_LEVEL, k);
        }
        if (still || this.t >= OFF) return this.finish('bottom', heard);
        return true;
      }
    }
  }

  private finish(e: ClimbEvent, heard: (e: ClimbEvent) => void): boolean {
    this.done = true;
    heard(e);
    return false;
  }
}
