/**
 * The drive core: momentum you can see. A reactor column rising out of the Deck lift's roof, aft,
 * whose stacked rings light ship-cyan one a merge, bottom up, through the current run of merges (no
 * revert and no pull request closed unmerged between them). Today's best run is a thin white line on
 * the column. The core breathes once every 8 s, glows brighter with every ring lit, and its light runs
 * up the column at the ship's cruise speed, so the speed space already moves at is readable on board.
 * A merge sends a bright band up the column to the ring it lights, and a plaque on the collar facing
 * the bow says the count ("RUN 4", "BEST 6"). A broken run lets its top ring go dim over 4 s and the
 * count starts again: no flash, no sound.
 *
 * The ticker over the overhead strip carries the fleet's week ("FLEET LOG: 12 MERGES, 14 ISSUES THIS
 * WEEK - RECORD 15"), and an eight-week tally hangs over the Services panel. Passing the record fires
 * one surge (the surge's own gap holds) and "NEW RECORD: THE FLEET'S BEST WEEK YET" on the band, after
 * anyone who needs the captain. Outcomes only, team-level only: nothing counts lines, tokens or terminal
 * time, and nothing ranks people.
 *
 * The rings are state, not a flourish: they keep up even while someone waits. Ship motion Off, reduced
 * motion and Silent running stop the breath and the flow; the rings still show the count. Settings >
 * Bridge > Momentum display turns all of it off. The numbers come from the server (server/pace.ts),
 * which this asks for as the deck's events land; the pit wall (features/turnaround) reads them too.
 */
import { fleetLogLine, RECORD_LINE } from '../../../shared/pace';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { debugHandle } from '../giveway';
import { coreGlow, corePulse, flowRate, litRings, mergePulse, ringLevels, runPlaque, RecordWatch } from './logic';
import { CoreWorld, TallyPlaque } from './world';

/** The kinds of event that move the pace: ask the server again when one lands on this deck. */
const MOVES = new Set(['pr-merged', 'pr-closed', 'progress', 'done', 'needs-input', 'stuck', 'resumed', 'pr-opened']);
/** At most one ask in this long (ms); the last one asked for always goes. */
const ASK_GAP_MS = 1200;

export interface Drive {
  /** A fast clear on the pit wall reached the core: its next breath swells a little. */
  kick(): void;
  /** Asks the server for the deck's pace again (the pit wall, after a unit is answered). */
  refresh(): void;
}

export function installDrive(ctx: Ctx, parts: Pick<Parts, 'giveWay' | 'alert' | 'space'>): Drive {
  const core = new CoreWorld();
  const tally = new TallyPlaque();
  ctx.scene.add(core.group, tally.mesh);
  const ticker = ctx.office.ticker;
  const record = new RecordWatch();
  let clock = 0;
  let flow = 0;
  let kick = 0;
  let lit = 0;
  let risenAt = -Infinity;
  /** A run that broke: how many rings it had, and when. */
  let broke: { was: number; at: number } | null = null;
  /** The record passed, waiting for the captain to be free: the surge and the band's line. */
  let pendingRecord = false;

  // Asking: once on a new deck, and again as its events land, at most once in ASK_GAP_MS.
  let askedAt = -Infinity;
  let askTimer = 0;
  function ask() {
    const floor = store.floor;
    if (!floor) return;
    const wait = askedAt + ASK_GAP_MS - performance.now();
    if (wait > 0) {
      if (!askTimer) askTimer = window.setTimeout(() => ((askTimer = 0), ask()), wait);
      return;
    }
    askedAt = performance.now();
    ctx.net.send({ t: 'pace.get', floor });
  }
  store.on('floor', () => {
    lit = 0;
    broke = null;
    pendingRecord = false;
    ask();
  });
  ctx.messages.on('timeline.event', ({ event }) => {
    if (event.floor === store.floor && MOVES.has(event.kind)) ask();
  });
  // A unit answered: its reply time is on the server now.
  let asking = new Set<string>();
  store.on('roster', () => {
    const now = new Set(store.roster.filter((e) => e.floor === store.floor && e.status === 'needs_input').map((e) => e.id));
    for (const id of asking) if (!now.has(id)) ask();
    asking = now;
  });

  function paint() {
    const p = store.pace?.state;
    const on = ctx.settings.momentum;
    core.group.visible = on;
    tally.mesh.visible = on;
    ticker.setSegment(on && p ? fleetLogLine(p.week, p.record) : null);
    if (!p) return;
    tally.paint(p.weeks, p.record);
    core.bestAt(p.best);
    core.count(runPlaque(p.run, p.best));
    const next = litRings(p.run);
    if (next < lit) broke = { was: lit, at: clock };
    if (next > lit) {
      risenAt = clock;
      broke = null;
    }
    lit = next;
    if (record.check(p.week.merges, p.record)) pendingRecord = true;
  }
  store.on('pace', paint);

  let painted = '';
  ctx.ticks.add('world', ({ dt }) => {
    clock += dt * 1000;
    const on = ctx.settings.momentum;
    const key = `${on}`;
    if (key !== painted) {
      painted = key;
      paint();
    }
    if (pendingRecord && on && parts.giveWay.visible() && !parts.giveWay.attention() && !parts.alert.settling()) {
      pendingRecord = false;
      if (!parts.giveWay.frozen()) parts.space.surge();
      parts.alert.say('notice', RECORD_LINE, null, 6000);
    }
    if (!on) return;
    const motion = parts.giveWay.motion();
    const brokeMs = broke ? clock - broke.at : undefined;
    if (broke && brokeMs !== undefined && brokeMs > 6000) broke = null;
    core.rings(ringLevels(lit, motion > 0 ? clock - risenAt : Infinity, broke?.was ?? 0, motion > 0 ? brokeMs : broke ? Infinity : undefined));
    flow += flowRate(parts.space.speed(), motion) * dt;
    kick = Math.max(0, kick - dt * 0.05);
    // The ambient part of the glow gives way with the rest of life; the rings' own light does not.
    const ambient = 0.6 + 0.4 * parts.giveWay.gain();
    core.light(coreGlow(lit) * ambient * corePulse(clock, motion, kick), lit, flow);
    // A merge: a bright band climbs the column to the ring it lit.
    const mp = mergePulse(clock - risenAt, motion);
    core.pulse(mp.y, mp.k);
  });

  const drive: Drive = {
    kick: () => void (kick = Math.min(0.35, kick + 0.2)),
    refresh: ask,
  };
  debugHandle('drive', { ...drive, state: () => ({ lit, run: store.pace?.state.run, best: store.pace?.state.best, week: store.pace?.state.week, record: store.pace?.state.record, broke: !!broke, pendingRecord }) });
  return drive;
}
