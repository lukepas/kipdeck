/**
 * The bridge's life: what makes a healthy, busy deck look alive without competing with what needs
 * you. Each station's screen on its pedestal shows its unit's state, and a working one runs bars with
 * its terminal's output, a scan line and three blinkers; its hood's trace brightens with it; its unit's
 * hands work the console and its band leans toward ship-cyan; and now and then it sends a data pulse
 * to the holo table, where dashes run along the course to the ship and a band of lettering says how
 * far the ship has come ("CAPTAIN, WE ARE 40% OF THE WAY TO..."). Over the overhead strip, the ship's
 * clock ticks and the deck's log runs past.
 *
 * It all gives way to attention (DESIGN.md, rule 1): for a few seconds after a unit starts needing
 * you or gets stuck everything ambient dims, a pod with such a unit stays hushed round it while it
 * does, and the whole bridge keeps a little quieter while anyone is waiting on you. Ship motion at
 * Calm halves it; Off, or reduced motion, stills it (the screens still read, they just don't run).
 */
import { DESKS, podOf } from '../../../shared/layout';
import { milestoneOf, milestoneProgress } from '../../../shared/mission';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { GIVE_WAY, bump, decay, headingPhrases, lifeScale, panelMode, percentTo, pulseGap, shipTime, shownActivity, stationGain, tickerItems, underWayText, type Heading } from './logic';

/** How bright a station's hood trace is in each state (0 dark, 1 full ship-cyan); a working one goes by how busy it is. */
const TRACE = { empty: 0.08, parked: 0.15, review: 0.3, 'needs-you': 0.1, stuck: 0, merged: 0.3 } as const;

export function installLife(ctx: Ctx, parts: Pick<Parts, 'views'>) {
  const { panels, pulses, heading, ticker, holo, stations } = ctx.office;

  /** Each unit's activity (0-1) and the screen version it last saw, by worker id. */
  const activity = new Map<string, { a: number; printed: number; nextPulse: number }>();
  const traced = new Map<string, number>();
  const shown = new Set<string>();
  let clock = 0;
  let screenT = 0;
  let duckUntil = -Infinity;
  let duck = 1;
  let last = { needs: 0, stuck: 0 };
  let anyWaiting = false;
  let readAt = -Infinity;
  for (const d of DESKS) stations.trace(d.id, TRACE.empty);

  function readHeading() {
    const m = store.mission;
    const open = m.milestones.findIndex((x) => x.id === m.active && !x.done);
    const active = open >= 0 ? milestoneOf(m, m.active) : m.milestones.find((x) => !x.done);
    const roster = store.roster.filter((e) => e.floor === store.floor);
    const p = active ? milestoneProgress(active, store.issues.items, roster, store.pulls.items) : undefined;
    const h: Heading = {
      statement: m.statement,
      milestones: m.milestones.length,
      wp: active ? { n: m.milestones.indexOf(active) + 1, title: active.title } : undefined,
      closed: p?.closed ?? 0,
      issues: p?.issues ?? 0,
      units: p?.workers ?? 0,
    };
    const pct = percentTo(h);
    heading.set(headingPhrases(h), pct === undefined ? undefined : pct / 100);
  }
  for (const t of ['mission', 'roster', 'issues', 'pulls', 'floor'] as const) store.on(t, readHeading);
  readHeading();

  let askedLog = false;
  function readLog() {
    // The building's timeline isn't loaded until someone looks: the ticker asks once.
    if (!store.timeline.loaded && !askedLog && store.floor) {
      askedLog = true;
      ctx.net.send({ t: 'timeline.get' });
    }
    ticker.setLog(tickerItems(store.timeline.events, store.floor));
  }
  store.on('timeline', readLog);
  store.on('floor', () => {
    readLog();
    pulses.clear();
    activity.clear();
  });
  readLog();

  /** Once a second: the counts (to give way), the clock, how long the deck has been under way. */
  function readDeck() {
    const c = store.counts();
    if (c['needs-you'] > last.needs || c.stuck > last.stuck) duckUntil = clock + GIVE_WAY.duckMs;
    last = { needs: c['needs-you'], stuck: c.stuck };
    anyWaiting = c['needs-you'] > 0;
    const since = store.roster.filter((e) => e.floor === store.floor && e.status === 'working' && e.workingSince !== undefined).map((e) => e.workingSince!);
    const now = Date.now();
    ticker.setClock(shipTime(now), underWayText(since, now));
  }

  ctx.ticks.add('world', ({ dt }) => {
    const ms = dt * 1000;
    clock += ms;
    if (clock - readAt >= 1000) {
      readAt = clock;
      readDeck();
    }
    const scale = lifeScale(ctx.reduceMotion.ship);
    const ducking = clock < duckUntil;
    duck += ((ducking ? GIVE_WAY.duck : 1) - duck) * Math.min(1, dt * 3);
    const deckGain = duck * (anyWaiting ? GIVE_WAY.waiting : 1);
    screenT += dt * scale;
    panels.time(screenT);

    const views = parts.views.workerViews;
    // The pods with a unit that needs you or is stuck: hushed round it.
    const hushed = new Set<string>();
    for (const v of views.values()) {
      const k = v.model.showing;
      if (k === 'needs-you' || k === 'stuck') hushed.add(podOf(v.deskId) ?? v.deskId);
    }
    const seen = new Set<string>();
    for (const [id, v] of views) {
      seen.add(v.deskId);
      const version = store.screens.get(id)?.version ?? -1;
      let s = activity.get(id);
      if (!s) activity.set(id, (s = { a: 0, printed: version, nextPulse: clock + 1500 + Math.random() * 3000 }));
      s.a = decay(s.a, dt);
      if (version !== s.printed) {
        s.printed = version;
        s.a = bump(s.a);
      }
      const kind = v.model.showing;
      const level = kind === 'merged' ? 'working' : kind;
      const busy = shownActivity(level, s.a);
      const gain = stationGain({ ducking: false, podHushed: hushed.has(podOf(v.deskId) ?? v.deskId), anyWaiting }) * duck;
      v.model.setBusy(busy * (0.4 + 0.6 * gain));
      panels.set(v.deskId, panelMode(kind), busy, gain);
      const trace = kind === 'working' ? (0.3 + 0.7 * busy) * (0.35 + 0.65 * gain) : TRACE[kind];
      if (Math.abs((traced.get(v.deskId) ?? -1) - trace) > 0.02) {
        traced.set(v.deskId, trace);
        stations.trace(v.deskId, trace);
      }
      // A busy station files its work into the course plot now and then.
      if (kind === 'working' && clock >= s.nextPulse) {
        const gap = pulseGap(busy, gain, scale, Math.random());
        if (Number.isFinite(gap)) pulses.emit(v.deskId);
        s.nextPulse = clock + (Number.isFinite(gap) ? gap * 1000 : 2000);
      }
    }
    // The consoles nobody is at: an empty screen, a faint trace.
    for (const deskId of shown) {
      if (seen.has(deskId)) continue;
      panels.set(deskId, panelMode('empty'), 0, 1);
      traced.set(deskId, TRACE.empty);
      stations.trace(deskId, TRACE.empty);
    }
    shown.clear();
    for (const d of seen) shown.add(d);
    for (const id of activity.keys()) if (!views.has(id)) activity.delete(id);

    if (scale > 0) pulses.step(dt * scale);
    else pulses.clear();
    holo.flow(dt, scale * deckGain);
    heading.turn(dt, scale * deckGain);
    ticker.run(dt, scale * deckGain);
  });
}
