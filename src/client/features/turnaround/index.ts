/**
 * The captain's pit wall: how fast the captain turns the crew around, shown as plainly as a race
 * team's timing screen. A clock face on the Review bay's roof reads "REPLY 3m (7-DAY 9m)" and "REVIEW
 * 18m (7-DAY 25m)" in large mono, with a thin bar for each review today against the seven-day median.
 * Reply is a unit asking until someone answers it; review is a unit's work at rest until its pull
 * request is merged or closed (shared/turnaround.ts, worked out on the server by server/pace.ts).
 *
 * A wait cleared faster than the seven-day median runs the bay's hairline once, in ship-cyan, down
 * the west aisle to the drive core, whose next breath it swells (features/drive). The top bar's
 * corner says what the crew got through once there is something ("2 units back on task, 6 PRs through
 * review today"), never a row of zeros, the recoveries counted by
 * the Tier 1 recovery's own rule. Three or more units waiting for review bring the bay's light up a
 * step, so the queue is easy to see. A slow number is a number: no red, no nag, no shame; a good day
 * gets one line from VESPER, once.
 *
 * The hairline gives way: it never runs while anyone else needs the captain or is stuck, in a hidden
 * tab, or under reduced motion, Ship motion Off or Silent running. Settings > Deck > Turnaround
 * clock turns all of it off.
 */
import './ui.css';
import { BAY_QUEUE, captainsBar, fastClear, goodDay } from '../../../shared/turnaround';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { h } from '../../ui/dom';
import { debugHandle } from '../giveway';
import { bayWash, Hairline, HAIRLINE_MS, PitWall } from './world';
import { FarWatch } from '../boards/far';

/** A wait cleared longer ago than this is old news on arrival: no run for it (ms). */
const FRESH_MS = 2 * 60_000;

export function installTurnaround(ctx: Ctx, parts: Pick<Parts, 'giveWay' | 'drive' | 'vesper'>) {
  const wall = new PitWall();
  const line = new Hairline();
  const wash = bayWash();
  ctx.scene.add(wall.mesh, line.mesh, wash);
  const bar = h('span.captains-bar', { title: "Today on this deck: units back from stuck that landed their work, and pull requests merged or closed", hidden: true });
  document.getElementById('dock')?.before(bar);

  let clock = 0;
  let runFrom: number | null = null;
  let seen = '';
  let primed = false;
  let saidOn = '';

  const queue = () => store.ranked(store.floor).filter((r) => r.att.level === 'review' && !r.att.snoozed).length;

  function paint() {
    const on = ctx.settings.turnaround;
    const p = store.pace?.state ?? null;
    wall.mesh.visible = on;
    const q = queue();
    wash.visible = on && q >= BAY_QUEUE;
    wall.raise(on && q >= BAY_QUEUE);
    const crewLine = p ? captainsBar(p.cleared) : null;
    bar.hidden = !on || !crewLine;
    if (!on) return;
    wall.paint(p, q);
    if (crewLine) bar.textContent = crewLine;
    // A wait cleared fast: the hairline runs once, unless someone else waits or nothing may move.
    const l = p?.latest;
    const key = l ? `${l.kind}:${l.at}` : '';
    if (key && key !== seen) {
      const fresh = primed && Date.now() - l!.at < FRESH_MS;
      const median = l!.kind === 'reply' ? p!.reply.median7 : p!.review.median7;
      if (fresh && fastClear(l!.ms, median) && parts.giveWay.visible() && !parts.giveWay.attention() && parts.giveWay.motion() > 0) runFrom = clock;
    }
    seen = key;
    primed = !!p;
    // A good day on the pit wall: VESPER says so, once a day at most.
    const today = new Date().toDateString();
    if (p && saidOn !== today && goodDay(p)) {
      saidOn = today;
      parts.vesper.say('good-day', {}, `${store.floor}:${today}`);
    }
  }
  store.on('pace', paint);
  store.on('roster', paint);
  store.on('floor', () => {
    primed = false;
    seen = '';
    runFrom = null;
  });

  let shown = '';
  // From across the deck its headline numbers, walking up to it its table (boards/far.ts).
  const far = new FarWatch(wall.mesh);
  ctx.ticks.add('world', ({ dt }) => {
    clock += dt * 1000;
    const f = far.check(ctx.camera, dt);
    if (f !== null) {
      wall.far = f;
      paint();
    }
    const key = `${ctx.settings.turnaround}`;
    if (key !== shown) {
      shown = key;
      paint();
    }
    // A call mid-run puts the line away at once.
    if (runFrom !== null && parts.giveWay.attention()) runFrom = null;
    if (runFrom === null) return line.at(null);
    const k = (clock - runFrom) / HAIRLINE_MS;
    if (k >= 1.2) {
      runFrom = null;
      line.at(null);
      parts.drive.kick();
      return;
    }
    line.at(k);
  });

  const turnaround = { state: () => ({ running: runFrom !== null, queue: queue(), bar: bar.hidden ? null : bar.textContent, lines: wall.mesh.userData.lines as string[] | undefined }), run: () => void (runFrom = clock) };
  debugHandle('turnaround', turnaround);
  return turnaround;
}
