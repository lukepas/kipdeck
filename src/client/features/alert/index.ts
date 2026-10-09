/**
 * Alert conditions and the stand-down: the bridge's light says how the deck is doing. CONDITION GREEN
 * while nobody waits, the room as the mode has it. CONDITION AMBER once a unit has waited past five
 * minutes or a reminder fired on this deck (a unit waiting over an hour, an approved pull request not
 * merged, a waypoint past its date): the room's lights step down a fifth, the ship-cyan cove lines dim,
 * the pod spots over the units that wait stay up, and the band under the overhead strip says why with
 * the needs-you glyph. CONDITION RED once a unit has been stuck past ten minutes, or several are: one
 * step further, the stuck glyph. The room never turns orange or red; it goes darker round the
 * problem so the glyphs and beacons carry the hue at higher contrast (tests/lights.test.ts checks every
 * state still reads on its carrier on the dimmed rigs, Night and Day).
 *
 * When the last unit waiting or stuck clears, the bridge stands down: the lights come up aft to bow in
 * one soft 1.5 s sweep and the band says CONDITION GREEN for 4 s; celebrations held behind the call
 * (features/moments) go after it. Ship motion Off and reduced motion step at once, with no sweep.
 * Settings > Deck > Alert conditions turns it off or moves its thresholds (5 and 10 minutes).
 *
 * The band also carries a jump's countdown (features/space) and a recovery (features/moments).
 */
import { PODS } from '../../../shared/layout';
import { reminderSnoozed } from '../../../shared/reminders';
import { callSign } from '../../../shared/callsign';
import { conditionLine } from '../../../shared/shiplog';
import type { ReminderKind } from '../../../shared/protocol';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { DECK, practical } from '../../world/office/materials';
import * as THREE from 'three';
import { debugHandle } from '../giveway';
import { ConditionBand, type BandGlyph } from './band';
import { ConditionLatch, DIM, GREEN_SAY_MS, bandLine, STAND_DOWN_MS, lampLevel, podWake, rawCondition, standDownAt, whyOf, type Condition, type Waiter } from './logic';

export interface Alert {
  /** The bridge's condition now. */
  condition(): Condition;
  /** Whether the bridge is standing down: the lights coming up and CONDITION GREEN on the band (celebrations and a held jump wait for it). */
  settling(): boolean;
  /**
   * Puts a line on the band, or takes it off with null: a jump's countdown ('jump', over everything),
   * or a notice ('notice', last, for `ms`). A jump held for the captain is the Attention board's chip (features/tv).
   */
  say(slot: 'jump' | 'notice', text: string | null, glyph?: BandGlyph, ms?: number): void;
  /**
   * Brings the room's lights up from `from` aft to bow over `ms`, the pods' lamps coming on one pod at a
   * time (the start of watch, features/launch); null puts them straight up.
   */
  wake(from: number | null, ms?: number): void;
}

export function installAlert(ctx: Ctx, parts: Pick<Parts, 'lights' | 'giveWay'>): Alert {
  const band = new ConditionBand();
  ctx.scene.add(band.mesh);
  const latch = new ConditionLatch();
  const cove = practical(DECK.shipDim);
  const coveBase = new THREE.Color(DECK.shipDim);
  let clock = 0;
  let readAt = -Infinity;
  let line: { text: string; glyph: BandGlyph } | null = null;
  let jumpLine: { text: string; glyph: BandGlyph } | null = null;
  let greenLine: { text: string; glyph: BandGlyph } | null = null;
  let notice: { text: string; glyph: BandGlyph; until: number } | null = null;
  let greenUntil = -Infinity;
  /** The stand-down under way: when it started and the room's level it comes up from. */
  let standDown: { at: number; from: number; ms: number; pods: boolean } | null = null;
  /** The room's level and the cove's now, eased toward the condition's. */
  let room = 1;
  let coveK = 1;
  let applied = '';

  function read() {
    const s = ctx.settings.alerts;
    if (!s.on) {
      if (latch.value !== 'green') {
        latch.reset();
        line = null;
      }
      return;
    }
    const now = Date.now();
    const waiters: Waiter[] = [];
    let working = 0;
    for (const r of store.ranked(store.floor)) {
      if (r.att.level === 'working') working++;
      if (r.att.snoozed || (r.att.level !== 'needs-you' && r.att.level !== 'stuck')) continue;
      waiters.push({ level: r.att.level, ms: now - r.att.since, unit: callSign(r.entry.deskId) || r.entry.name });
    }
    const reminders: ReminderKind[] = store.reminders.filter((r) => r.floor === store.floor && !reminderSnoozed(r, now)).map((r) => r.kind);
    const was = latch.value;
    const raw = rawCondition(waiters, reminders, s);
    const step = latch.step(raw, clock);
    if (step.stoodDown) {
      greenUntil = clock + GREEN_SAY_MS;
      standDown = parts.giveWay.frozen() ? null : { at: clock, from: DIM[was].room, ms: STAND_DOWN_MS, pods: false };
    }
    const c = latch.value;
    greenLine = c === 'green' && clock < greenUntil ? { text: conditionLine('green', whyOf([], []), working), glyph: null } : null;
    // The words follow the book's condition now, the light the latch: no AMBER or RED with no cause named.
    const why = whyOf(waiters, reminders);
    const text = bandLine(c, raw, why);
    const glyph: BandGlyph = raw === 'green' ? null : raw === 'red' || why.top?.stuck ? 'stuck' : why.waiting ? 'needs-you' : null;
    line = text ? { text, glyph } : null;
  }
  // Read again the moment the roster or the reminders change, as giving way does: a held jump and the
  // celebrations see the bridge on its way down in the same frame they see the call clear.
  for (const topic of ['roster', 'reminders'] as const)
    store.on(topic, () => {
      read();
      readAt = clock;
    });
  store.on('floor', () => {
    latch.reset();
    standDown = null;
    greenUntil = -Infinity;
    line = null;
  });

  ctx.ticks.add('world', ({ dt }) => {
    clock += dt * 1000;
    if (clock - readAt >= 1000) {
      readAt = clock;
      read();
    }
    const frozen = parts.giveWay.frozen();
    const c = latch.value;
    const target = DIM[c];
    const ease = frozen ? 1 : Math.min(1, dt * 2);
    room += (target.room - room) * ease;
    coveK += (target.cove - coveK) * ease;
    if (Math.abs(room - target.room) < 0.002) room = target.room;
    if (Math.abs(coveK - target.cove) < 0.002) coveK = target.cove;
    // The lights: dimmed round the problem, the pods over a unit that waits kept up; the stand-down brings them up aft to bow.
    let key = `${c}|${room.toFixed(3)}`;
    if (standDown) {
      const ms = clock - standDown.at;
      if (ms >= standDown.ms) standDown = null;
      else key += `|sd${Math.round(ms / 16)}`;
    }
    for (const p of PODS) key += parts.giveWay.hushed(p.letter) ? p.letter : '';
    if (key !== applied) {
      applied = key;
      if (c === 'green' && !standDown && room === 1) parts.lights.dim(null);
      else {
        const sd = standDown;
        parts.lights.dim((name, z, pod) => {
          const over = pod >= 0 && parts.giveWay.hushed(PODS[pod].letter);
          if (sd && sd.pods && name === 'pods' && pod >= 0) return sd.from + (1 - sd.from) * podWake(clock - sd.at, sd.ms, pod);
          if (sd) return sd.from + (1 - sd.from) * standDownAt(((clock - sd.at) * STAND_DOWN_MS) / sd.ms, z);
          if (name === 'pods' && over) return lampLevel(c, name, true);
          return room;
        });
      }
    }
    // The cove: the bridge's ship-cyan lines, dimmed with the room (over whatever a merge's swell set).
    if (coveK < 1) cove.color.copy(coveBase).multiplyScalar(coveK);
    else if (coveK === 1 && cove.userData.alertDimmed) cove.color.copy(coveBase);
    cove.userData.alertDimmed = coveK < 1;

    // The band: a jump's line over the condition's, a notice under it.
    if (notice && clock >= notice.until) notice = null;
    const show = jumpLine ?? line ?? greenLine ?? notice;
    band.say(show?.text ?? null, show?.glyph ?? null);
    band.step(dt, frozen);
  });

  const alert: Alert = {
    condition: () => latch.value,
    settling: () => latch.stepping || standDown !== null || clock < greenUntil,
    say(slot, text, glyph = null, ms = 4000) {
      if (slot === 'jump') jumpLine = text ? { text, glyph } : null;
      else notice = text ? { text, glyph, until: clock + ms } : null;
    },
    wake(from, ms = STAND_DOWN_MS) {
      standDown = from === null || parts.giveWay.frozen() ? null : { at: clock, from, ms, pods: true };
      applied = '';
    },
  };
  debugHandle('alert', { ...alert, line: () => (jumpLine ?? line ?? greenLine ?? notice)?.text ?? null, room: () => room });
  return alert;
}
