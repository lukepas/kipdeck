/**
 * Earned celebrations, in tiers (the rules in features/beats/tiers.ts): the bridge marks what the crew
 * really did, more the rarer it is, and never while the captain is needed.
 *
 * - Tier 0, a merge: the merge beat and the surge as ever (features/beats and space; nothing here).
 * - Tier 1, the day's first merge or a unit's first: the units of its pod turn to it with a quick nod
 *   (1.5 s), and VESPER has its line (features/vesper). A recovery, a unit that went stuck, was
 *   resumed and finished or merged: one white sweep across its pod's floor (2 s) and "WIDGET (B-02)
 *   RECOVERED, 40M STUCK" on the band under the overhead strip.
 * - Tier 2, a streak (three merges inside an hour, nothing stuck): hands up from the consoles across
 *   the ship (1.5 s) and a harder surge.
 * - Tier 3, a waypoint reached: the crew stand and face the bow through the jump (features/space),
 *   then the log card with the real numbers ("Waypoint 3: 14 merges, 2 days, 120.00 USDC paid").
 * - Tier 4, the mission complete: the same, the arrival in orbit (features/destination), the fleet's
 *   slow fly-by, and a card naming every unit that merged.
 *
 * Tier 1 and up wait while anyone needs the captain or is stuck, and while the lights come up from a
 * stand-down (features/alert); one at a time, a higher tier swallowing a lower one waiting, and one
 * held past ten minutes comes out as its card only. Settings > Bridge > Celebrations: Full, Cards only
 * or Off. Ship motion Off, reduced motion, Life at Calm or Silent running and a hidden tab turn the
 * gestures and sweeps into the card. No sound of its own, no hue beyond what the beats already use, and
 * the camera never moves.
 */
import * as THREE from 'three';
import { podOf } from '../../../shared/layout';
import { callSign } from '../../../shared/callsign';
import { sumUnits, tokenLabel } from '../../../shared/money';
import { firstMergeCard, missionCard, recoveredLine, recoveryCard, streakCard, waypointCard, type MomentCard } from '../../../shared/shiplog';
import type { TimelineEvent } from '../../../shared/protocol';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { COUNTDOWN_MS, JUMP_MS } from '../space/logic';
import { GESTURE_MS, MomentQueue, cardInFull, momentForm, stretchFrom, tallyOf, tierOf, type Moment, type Tier } from '../beats/tiers';
import { debugHandle } from '../giveway';
import { MomentCards } from './card';
import { Gestures } from './gesture';
import { PodSweep } from './sweep';

/** How long a card stays up (ms), by tier. */
const CARD_MS: Readonly<Record<Tier, number>> = { 0: 0, 1: 10_000, 2: 10_000, 3: 30_000, 4: 45_000 };
/** How long the crew stand for a waypoint when no jump plays (ms). */
const STAND_MS = 3000;

export interface Moments {
  /** What is waiting, playing, and the card up (the shots and the console). */
  state(): { waiting: Moment | null; playing: Moment | null; card: MomentCard | null; recoveries: number };
  /** Plays a moment of `kind` now about the unit `worker`, as if its event had just landed (the shots). */
  play(kind: Moment['kind'], worker?: string): void;
}

/** The log card's last line when work waits for review: the next unblock, and where it is. */
export function reviewHint(n: number): string {
  return `${n} to review - Mission control (I)`;
}

export function installMoments(ctx: Ctx, parts: Pick<Parts, 'views' | 'giveWay' | 'alert' | 'space' | 'fleet' | 'vesper' | 'focus'>): Moments {
  const gestures = new Gestures(ctx, parts);
  const sweep = new PodSweep();
  ctx.scene.add(sweep.mesh);
  const cards = new MomentCards(() => parts.focus.backToGame());
  const queue = new MomentQueue();
  let clock = 0;
  let recoveries = 0;
  /** A waypoint's or the mission's card, waiting for the jump to finish. */
  let after: { at: number; card: MomentCard; tier: Tier; voice: string | null; flyBy: boolean } | null = null;
  /** Moments that came in while the tab was hidden: only their cards, once you're back. */
  const cameHidden = new Set<string>();

  const entryOf = (worker?: string) => (worker ? store.roster.find((r) => r.id === worker) : undefined);
  /** A unit as the cards name it: its call sign, else its name. */
  const unitOf = (e: Pick<TimelineEvent, 'worker' | 'name'>) => {
    const r = entryOf(e.worker);
    return (r && callSign(r.deskId)) || r?.name || e.name || undefined;
  };

  ctx.messages.on('timeline.event', ({ event: e }) => {
    if (e.floor !== store.floor) return;
    const ms = store.mission.milestones;
    const m = tierOf(e, store.timeline.events, { stuckNow: store.counts().stuck, missionDone: ms.length > 0 && ms.every((x) => x.done || x.id === e.goal) });
    if (!m || !queue.offer(m, Date.now())) return;
    if (!parts.giveWay.visible()) cameHidden.add(m.key);
  });
  store.on('floor', () => {
    queue.clear();
    gestures.stop();
    after = null;
  });

  /** The card for `m`, with its real numbers. */
  function cardFor(m: Moment): MomentCard {
    const unit = unitOf(m) ?? 'A unit';
    if (m.kind === 'recovery') return recoveryCard({ unit, stuckMs: m.stuckMs ?? 0, merged: !!m.merged });
    if (m.kind === 'streak') return streakCard({ merges: m.merges ?? 3 });
    if (m.kind === 'first-merge' || m.kind === 'merge') return firstMergeCard({ unit, pr: m.pr, firstEver: !!m.firstEver });
    const events = store.timeline.events;
    const final = m.kind === 'mission';
    const from = stretchFrom(events, m.floor, m.at, final ? ['mission'] : undefined);
    const t = tallyOf(events, m.floor, from, m.at, unitOf);
    const tally = { ...t, ...paidBetween(from, m.at) };
    const ms = store.mission.milestones;
    if (final) return missionCard({ statement: store.mission.statement, waypoints: ms.length, tally });
    const i = ms.findIndex((x) => x.id === m.goal);
    return waypointCard({ n: i + 1 || ms.filter((x) => x.done).length, title: ms[i]?.title ?? 'the waypoint', tally });
  }

  /** Bounties paid on this deck between `from` and `to`, written as the proof counter writes them. */
  function paidBetween(from: number, to: number): { paid?: string } {
    const b = store.bounties[store.floor ?? ''];
    const paid = (b?.items ?? []).filter((x) => x.txs.some((tx) => tx.kind === 'paid' && tx.at > from && tx.at <= to + 60_000));
    if (!paid.length) return {};
    const sum = sumUnits(paid);
    return { paid: tokenLabel(sum.units, sum.decimals, paid[0].symbol) };
  }

  /** The units on this deck that may gesture: at their consoles, not waiting on the captain. */
  function crew(except?: string, pod?: string): string[] {
    const out: string[] = [];
    for (const [id, v] of parts.views.workerViews) {
      if (id === except) continue;
      if (v.model.showing === 'needs-you' || v.model.showing === 'stuck') continue;
      if (pod && podOf(v.deskId) !== pod) continue;
      out.push(id);
    }
    return out;
  }

  const where = new THREE.Vector3();
  function play(m: Moment, stale: boolean) {
    const form = momentForm(ctx.settings.celebrations, { ship: ctx.reduceMotion.ship, reduced: ctx.reduceMotion.matches, life: ctx.settings.life, visible: parts.giveWay.visible(), stale: stale || cameHidden.has(m.key) });
    cameHidden.delete(m.key);
    if (form === 'none') return queue.release();
    const voice = m.tier >= 3 ? parts.vesper.line('milestone-done', { title: store.mission.milestones.find((x) => x.id === m.goal)?.title ?? store.mission.statement }, m.key) : null;
    if (form === 'card') {
      cards.show(cardFor(m), CARD_MS[m.tier], voice);
      if (m.kind === 'recovery') recoveries++;
      return queue.release();
    }
    const unit = entryOf(m.worker);
    const view = m.worker ? parts.views.workerViews.get(m.worker) : undefined;
    if (m.kind === 'first-merge' && view && unit) {
      view.model.where(where);
      gestures.play(crew(m.worker, podOf(unit.deskId)), 'nod', GESTURE_MS, where.clone());
    } else if (m.kind === 'recovery') {
      recoveries++;
      const pod = unit && podOf(unit.deskId);
      if (pod) sweep.start(pod);
      parts.alert.say('notice', recoveredLine(unit?.name ?? m.name ?? 'A unit', unit && callSign(unit.deskId), m.stuckMs ?? 0), null, 5000);
    } else if (m.kind === 'streak') {
      gestures.play(crew(), 'cheer', GESTURE_MS);
      parts.space.surgeHard();
    } else if (m.kind === 'waypoint' || m.kind === 'mission') {
      // The crew stand and face the bow through the countdown and the jump, then the log card.
      const phase = parts.space.phase();
      const standMs = phase === 'jump' ? JUMP_MS : phase === 'idle' ? STAND_MS : COUNTDOWN_MS + JUMP_MS;
      gestures.play(crew(), 'stand', standMs);
      if (cardInFull(m.tier)) after = { at: clock + standMs, card: cardFor(m), tier: m.tier, voice, flyBy: m.kind === 'mission' };
    }
  }

  ctx.ticks.add('world', ({ dt }) => {
    clock += dt * 1000;
    const hold = parts.giveWay.attention() || parts.alert.settling();
    // A call mid-gesture: the crew are simply back at their consoles, and the card is put away.
    if (parts.giveWay.attention() && gestures.busy) gestures.stop();
    if (parts.giveWay.ducking() && cards.card) cards.close(false);
    const next = queue.next(clock, hold, Date.now());
    if (next) play(next.m, next.stale);
    if (after && clock >= after.at) {
      // The celebration ends by pointing at the next unblock: work waiting for review, if any.
      const review = store.ranked(store.floor).filter((r) => r.att.level === 'review' && !r.att.snoozed).length;
      const card = review ? { ...after.card, lines: [...after.card.lines, reviewHint(review)] } : after.card;
      cards.show(card, CARD_MS[after.tier], after.voice);
      if (after.flyBy && !parts.giveWay.frozen()) parts.fleet.flyBy();
      after = null;
    }
    gestures.lay(dt);
    sweep.step(dt);
  });

  const moments: Moments = {
    state: () => ({ waiting: queue.waiting(), playing: queue.current(clock), card: cards.card, recoveries }),
    play(kind, worker) {
      const tier: Tier = kind === 'merge' ? 0 : kind === 'first-merge' || kind === 'recovery' ? 1 : kind === 'streak' ? 2 : kind === 'waypoint' ? 3 : 4;
      const ms = store.mission.milestones;
      const goal = kind === 'mission' ? ms[ms.length - 1]?.id : ms.find((x) => x.done)?.id;
      queue.offer({ kind, tier, key: `shot-${kind}-${Date.now()}`, floor: store.floor ?? '', at: Date.now(), worker, name: entryOf(worker)?.name, goal, stuckMs: 40 * 60_000, merged: true, merges: 3, firstEver: false }, Date.now());
    },
  };
  debugHandle('moments', moments);
  return moments;
}
