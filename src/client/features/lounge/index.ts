/**
 * The forward lounge: a viewing balcony at the bow, behind the situation arc under the Attention and
 * Pull requests boards (shared/lounge.ts, built by ./world.ts), for looking out at space. You climb its
 * ladder (E at its foot): you square up to it, go up hand over hand, each hand planted on its rung while
 * you move past it and going over the other to the next (grips.ts), and step over its head onto the balcony, its gate swinging open for you. E at the gate takes
 * you back down the same way. W and S turn a climb round on the rungs. Up there, three lounge seats face
 * the glass (E to sit): sat in one in first person the view widens by a few degrees and lifts to the
 * stars, and you can look anywhere; Esc, E or a step gets you up. A readout on the glass in front of the
 * seats says when a unit needs you (N takes you straight to it) and counts the jump in (readout.ts).
 *
 * The climb has hold of you while it's on (PlayerController.rig) and is an activity (ctx.activities):
 * it draws the hint bar, takes the keys that would do something else, and lets go (you on whichever end
 * is nearer) when the office moves you somewhere. With less motion it climbs at an even pace, with no
 * hop, and the head turns at once. The climb's feel follows upstream agent-office's ladder (origin/main
 * features/climbing, MIT).
 */
import { LADDER, LOUNGE, overLounge } from '../../../shared/lounge';
import { SEATING_BY_ID } from '../../../shared/layout';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { zoomOf } from '../../core/zoom';
import { DESK_KEYS } from '../../interaction';
import { isTyping } from '../../player';
import { modalOpen } from '../../ui/dom';
import { debugHandle } from '../giveway';
import { Climb, type ClimbEvent } from './climb';
import type { P3 } from './grips';
import { LoungeReadout, callPulse, readoutLine } from './readout';
import { store } from '../../state';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    ladder: true;
  }
}

/** How much wider the view is sat in a lounge seat (degrees), and how fast it widens and narrows (a share a second). */
export const LOUNGE_FOV = 9;
const FOV_RATE = 3;
/** Where you look once sat down up there: over the horizon, so the stars fill the frame and the deck plate sinks out of it. */
const SEATED_PITCH = 0.2;
/** How often the readout on the ledge looks at the deck's calls and the countdown (s). */
const READOUT_EVERY = 0.25;
/** How fast the gate swings (a share a second). */
const GATE_RATE = 6;
/** Keys a climb takes, so they don't use whatever's in front of you on the way: E, Space and the desk keys. */
const TAKEN = new Set(['KeyE', 'Space', 'KeyF', ...Object.keys(DESK_KEYS)]);

export type LoungeParts = Pick<Parts, 'player' | 'stage' | 'seating' | 'focus' | 'space'>;

/** Whether a seat is one of the lounge's (a view seat). */
export function viewSeat(seatId: string | undefined): boolean {
  return !!seatId && !!SEATING_BY_ID.get(seatId)?.view;
}

export function installLounge(ctx: Ctx, parts: LoungeParts) {
  let climb: Climb | null = null;
  /** Listeners for what a climb hears (a sound recipe, a test). */
  const heard = new Set<(e: ClimbEvent) => void>();
  let gateK = 0;
  let fovK = 0;
  let wasSeated = false;

  /** Starts a climb up from the foot or down from the head, whichever end you're at. */
  function start() {
    const p = parts.player;
    if (climb || p.seat) return;
    ctx.activities.stopAll('start', ['lounge-climb']);
    const way = p.pos.y > LOUNGE.top / 2 ? 'down' : 'up';
    climb = new Climb(p, way);
    p.stopWalking();
    p.rig = (dt) => step(dt);
    ctx.hint.invalidate();
  }

  /** A frame of the climb: up or down by the keys, until you're off it. */
  function step(dt: number): boolean {
    const c = climb;
    const p = parts.player;
    if (!c) return false;
    const ask = p.holding('KeyW', 'ArrowUp') ? 1 : p.holding('KeyS', 'ArrowDown') ? -1 : 0;
    const moved = c.step(dt, ask, ctx.reduceMotion.matches, (e) => {
      for (const fn of heard) fn(e);
    });
    if (c.done) release();
    return moved;
  }

  /** Off the ladder, on your feet. */
  function release() {
    climb = null;
    const p = parts.player;
    p.rig = null;
    p.vy = 0;
    p.grounded = true;
    p.clearKeys();
    ctx.hint.invalidate();
  }

  /** Stopped part way (the office moved you, or you went somewhere): off at whichever end is nearer. */
  function letGo() {
    const p = parts.player;
    if (!climb) return;
    if (p.pos.y > LOUNGE.top / 2) p.pos.set(LADDER.x, LOUNGE.top, LADDER.top);
    else p.pos.set(LADDER.x, 0, LADDER.foot);
    release();
  }

  ctx.interactions.define('ladder', {
    reach: 2.6,
    hint: () => {
      if (parts.player.pos.y > LOUNGE.top / 2) return { k: 'ladder|down', parts: [hintTitle('Forward lounge'), aside('ladder'), key('E', 'Climb down')] };
      return { k: 'ladder|up', parts: [hintTitle('Forward lounge'), aside('ladder'), key('E', 'Climb up')] };
    },
    use: onE(() => start()),
  });

  ctx.activities.add({
    id: 'lounge-climb',
    active: () => !!climb,
    stop: (why) => {
      // Starting something else at a thing you used can't happen on the rungs; anything that moves you does.
      if (why !== 'start') letGo();
    },
    key: (e) => TAKEN.has(e.code),
    hint: (el) => {
      const c = climb;
      const up = c?.phase === 'up' || c?.phase === 'mount' || c?.phase === 'over';
      ctx.hint.draw(el, `climb|${up}`, () => [hintTitle('Ladder'), aside(up ? 'climbing up' : 'climbing down'), key(up ? 'S' : 'W', up ? 'Back down' : 'Back up')]);
    },
  });

  // Esc in a lounge seat gets you up (as E or a step does). The browser may keep the Esc that lets go of
  // the mouse to itself, so it's taken when it comes up, unless it went down with a window open (closing it).
  let escInWindow = false;
  window.addEventListener('keydown', (e) => e.key === 'Escape' && (escInWindow = modalOpen() || isTyping(e)), true);
  window.addEventListener('keyup', (e) => {
    if (e.key !== 'Escape') return;
    const inWindow = escInWindow;
    escInWindow = false;
    const p = parts.player;
    if (inWindow || modalOpen() || isTyping(e) || !viewSeat(p.seat?.seatId)) return;
    parts.seating.standUp();
    parts.focus.backToGame();
  });

  // The readout on the glass in front of the seats: a call, or the jump's countdown, while you're up there.
  const readout = new LoungeReadout();
  ctx.scene.add(readout.mesh);
  let readoutT = READOUT_EVERY;
  let line: ReturnType<typeof readoutLine> = null;
  let clock = 0;
  function readOut(dt: number, still: boolean) {
    clock += dt;
    readoutT += dt;
    const p = parts.player;
    const here = overLounge(p.pos.x, p.pos.z) && p.pos.y > LOUNGE.top - 0.3 && !parts.stage.view;
    if (readoutT >= READOUT_EVERY) {
      readoutT = 0;
      const calls: { name: string; stuck: boolean }[] = [];
      if (here)
        for (const r of store.ranked(store.floor)) {
          if (r.att.snoozed) continue;
          if (r.att.level !== 'needs-you' && r.att.level !== 'stuck') break;
          calls.push({ name: r.entry.name, stuck: r.att.level === 'stuck' });
        }
      const cd = here ? (parts.space?.countdown() ?? null) : null;
      line = here ? readoutLine(calls, cd && { left: cd.left, to: cd.to.title }) : null;
    }
    readout.show(line, line?.kind === 'call' ? callPulse(clock, still) : 1);
  }

  ctx.ticks.add('world', ({ dt }) => {
    const p = parts.player;
    const still = ctx.reduceMotion.matches;
    readOut(dt, still);
    // The gate at the ladder's head: open while someone's coming over it, shut behind them.
    const c = climb;
    const want = c && ((c.phase === 'over' || c.phase === 'onto') || ((c.phase === 'up' || c.phase === 'down') && p.pos.y > LOUNGE.top - 0.9)) ? 1 : 0;
    gateK = still ? want : gateK + (want - gateK) * Math.min(1, dt * GATE_RATE);
    if (Math.abs(gateK - want) < 0.002) gateK = want;
    ctx.office.forwardLounge.gate(gateK);
    // Sat in a lounge seat in first person: the view a few degrees wider, and on sitting, lifted to the stars.
    const seated = viewSeat(p.seat?.seatId) && p.view === 'first' && !parts.stage.view;
    if (seated && !wasSeated) {
      p.lookPitch = SEATED_PITCH;
      p.updateCamera(true);
    }
    wasSeated = seated;
    const target = seated ? 1 : 0;
    fovK = still ? target : fovK + (target - fovK) * Math.min(1, dt * FOV_RATE);
    if (Math.abs(fovK - target) < 0.004) fovK = target;
    zoomOf(ctx.camera).set('lounge', Math.round(fovK * LOUNGE_FOV * 20) / 20);
  });

  const api = {
    /** Whether a climb is on. */
    climbing: () => !!climb,
    /** The climb's phase, or null (the shots, the tests). */
    phase: () => climb?.phase ?? null,
    /** Whether your hands are on the rungs (features/hands grips them). */
    gripping: () => !!climb?.onRungs(),
    /** Where hand `side` (1 right, -1 left) holds the ladder, in the deck's metres, into `out`; null off it. */
    hand: (side: 1 | -1, out: P3): P3 | null => climb?.hand(side, out) ?? null,
    /** Whether you're up on the balcony (on your feet or sat). */
    up: () => overLounge(parts.player.pos.x, parts.player.pos.z) && parts.player.pos.y > LOUNGE.top - 0.3,
    /** Climbs from whichever end you're at (the shots). */
    climb: start,
    /** Hears what a climb hears: a hand on the ladder, each rung, your feet on the balcony or the deck. */
    heard,
    /** What the readout on the glass says now (the shots, the tests). */
    readout: () => line,
  };
  debugHandle('lounge', api);
  return api;
}
