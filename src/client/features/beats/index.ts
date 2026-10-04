/**
 * The deck's traveling beats, the motion that says something just changed hands (paths and timings
 * in logic.ts, the light itself in world.ts):
 *
 * - Dispatch: a unit deployed to a console gets a 400 ms trace from the mission table out to it.
 * - The merge beat, the one celebration: a merged pull request sends a violet pulse from its unit's
 *   console to the table, whose rim lights, and the bridge marks it for 1.2 s (celebrate.ts): a ring of
 *   light sweeps out across the floor, the Pull requests board flashes green, a ring rises off the
 *   unit's console and every lit line on the bridge swells; a bounty released on devnet carries it on to the Proof
 *   corner and up the rail, where it parks as the rail's new lit segment and the vault's lid lifts
 *   (features/proofcorner); then a violet toast with the transaction in mono. An attestation landing
 *   plays the merged cue and its own toast.
 *
 * Under reduced motion there is no traveling light: the rail and the lid change at once, the board
 * and the lines only hold a colour for a moment, and the toasts say the rest. The camera never moves for a beat.
 */
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import * as THREE from 'three';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import { proofTally } from '../../ui/counters';
import { OFFICE_PLAN } from '../../../shared/plan';
import { address } from '../../../shared/callsign';
import { tokenAmount } from '../../../shared/review';
import { DECK } from '../../world/office/materials';
import { beatAt, dispatchPhases, hashOf, toRailPhases, toTablePhases, type Phase } from './logic';
import { Trace } from './world';
import { Celebration } from './celebrate';

/** A beat waiting its turn: one trace runs them one after another. */
interface Beat {
  phases: Phase[];
  color: string;
  /** When it set off (ms, performance.now), once it has. */
  at?: number;
  /** When it has arrived. */
  done?: () => void;
}

/** How long the table's rim stays lit after a pulse reaches it (seconds). */
const RIM_S = 0.8;

export function installBeats(ctx: Ctx, parts: Pick<Parts, 'views' | 'proofCorner'>) {
  const trace = new Trace();
  ctx.scene.add(trace.root);
  const party = new Celebration();
  ctx.scene.add(party.root);
  const queue: Beat[] = [];
  let rimT = Infinity;
  const still = () => ctx.reduceMotion.matches;

  function run(b: Beat) {
    if (still()) return b.done?.();
    queue.push(b);
  }

  /** Where a unit is now (out on the ready line, or at its console), or its seat's spot when it isn't drawn. */
  const where = new THREE.Vector3();
  function unitAt(id: string): { x: number; z: number } | undefined {
    const v = parts.views.workerViews.get(id);
    if (v) {
      v.model.where(where);
      return { x: where.x, z: where.z };
    }
    const d = OFFICE_PLAN.byId.get(store.workers.get(id)?.deskId ?? '');
    return d && { x: d.x, z: d.z };
  }

  // ---- Dispatch ------------------------------------------------------------------------------------
  /** The units on your deck already, so only one deployed from now on gets a trace (not a reload, nor a deck you just arrived on). */
  let known = new Set<string>();
  let seeded: string | null = null;
  store.on('workers', () => {
    const ids = [...store.workers.keys()];
    if (seeded !== store.floor) {
      seeded = store.floor;
      known = new Set(ids);
      return;
    }
    for (const id of ids) {
      if (known.has(id)) continue;
      known.add(id);
      const desk = OFFICE_PLAN.byId.get(store.workers.get(id)!.deskId);
      // Consoles and the overflow, not the board agents' lecterns or the Review bay's chairs.
      if (desk && !desk.station && !desk.room) run({ phases: dispatchPhases(desk.x, desk.z), color: DECK.working });
    }
    for (const id of known) if (!store.workers.has(id)) known.delete(id);
  });

  // ---- The merge beat --------------------------------------------------------------------------------
  ctx.messages.on('landed', (m) => {
    if (m.kind !== 'merged' || m.pr === undefined) return;
    const owner = [...store.workers.values()].find((w) => w.pr?.number === m.pr || (w.pastPrs ?? []).includes(m.pr!) || store.queue.tasks.some((t) => t.workerId === w.id && t.pr?.number === m.pr));
    const from = owner && unitAt(owner.id);
    const celebrate = () => party.start(from ? new THREE.Vector3(from.x, 0, from.z) : null, still());
    if (!from) return celebrate();
    run({
      phases: toTablePhases(from.x, from.z),
      color: DECK.proof,
      done: () => {
        rimT = 0;
        celebrate();
      },
    });
  });

  ctx.messages.on('bounty.paid', (m) => {
    const decimals = store.bounties[m.floor]?.items.find((b) => b.issue === m.issue)?.decimals ?? 6;
    const net = store.bounties[m.floor]?.network;
    const unit = m.floor === store.floor && m.workerName ? [...store.workers.values()].find((w) => w.name === m.workerName) : undefined;
    const who = unit ? `${unit.name} (${address(unit.deskId)})` : (m.workerName ?? 'the deck');
    const floor = m.floor === store.floor ? '' : ` on ${store.floors.find((f) => f.id === m.floor)?.name ?? 'another deck'}`;
    const say = () => toast(`PR #${m.pr} merged: ${tokenAmount(m.amount, decimals)} ${m.symbol} released to ${who}${floor}`, 'proof', { hash: hashOf(m.url), settled: net === 'mock' ? 'the mock chain' : 'devnet', href: m.url });
    if (m.floor !== store.floor || still()) {
      parts.proofCorner.arrive();
      return say();
    }
    // The new segment is the one past those lit now, which the pulse lights as it parks.
    parts.proofCorner.expect();
    const segment = Math.max(0, proofTally().released - 1);
    run({
      phases: toRailPhases(segment),
      color: DECK.proof,
      done: () => {
        parts.proofCorner.arrive();
        say();
      },
    });
  });

  ctx.messages.on('timeline.event', ({ event: e }) => {
    if (e.kind !== 'merge-attested') return;
    ctx.sound.cue('merged');
    const unit = e.worker ? store.workers.get(e.worker) : undefined;
    const who = unit ? `${unit.name} (${address(unit.deskId)})` : e.name;
    toast(`Proof of merge for PR #${e.pr}${who ? ` by ${who}` : ''} attested`, 'proof', { hash: hashOf(e.link), settled: 'Base Sepolia', href: e.link });
  });

  // ---- Each frame ------------------------------------------------------------------------------------
  ctx.ticks.add('world', ({ dt, now, t }) => {
    party.step(dt);
    if (rimT !== Infinity) {
      rimT += dt;
      ctx.office.missionTable.pulse(Math.max(0, 1 - rimT / RIM_S));
      if (rimT >= RIM_S) rimT = Infinity;
    }
    const b = queue[0];
    if (!b) return;
    b.at ??= now;
    trace.setColor(b.color);
    const { at, done } = beatAt(b.phases, now - b.at);
    trace.move(at, t);
    if (!done) return;
    queue.shift();
    trace.hide();
    b.done?.();
  });

  return { trace, party };
}
