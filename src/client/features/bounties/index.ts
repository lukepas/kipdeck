/**
 * Proof of Merge bounties in the office: the browser wallet signs a funding the office built, and an
 * approval answers whoever gave it. The chips and the Fund window are in ui/bounty.ts; the review inbox
 * rows in ui/mission/review.ts.
 *
 * In the room, every token is a real bounty on this deck's issues (logic.ts works it out from the
 * floor's bounties, never a made-up amount), in proof's violet and always labelled as testnet tokens:
 *
 * - The vault's hologram (vault.ts): a stack of coins over the escrow vault for each bounty still held,
 *   as tall as its amount, its state as a shape (a clamp ring once claimed, the review ring while it
 *   waits on an admin, a hollow triangle when blocked, lifted while paying out), and a label over them
 *   with each one's issue, amount and state, the network and what's held and paid in all. A funding
 *   drops its coins onto the stack.
 * - The Issues board: a funded issue's row says its amount, and a coin hovers over it (flight.ts).
 * - A payout: the merge beat's pulse climbs the rail and the lid lifts (features/beats, proofcorner);
 *   then the coins fly out of the vault over the deck to the console of the unit that earned them, and
 *   a receipt floats up there with the amount, the unit and the devnet transaction. The violet toast
 *   says it too. You hear it fly (sound.ts): a tink as each coin leaves, their rush over the deck, a
 *   tink as each lands and a soft chord when they're in.
 *
 * With less motion (reduced motion, Ship motion Off) nothing flies or drops: the stacks are as they
 * are and the receipt is simply there over the console for its six seconds. Nothing idles: the coins
 * only move when a bounty changes, and nothing runs in a hidden tab.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import type { ServerMsg } from '../../../shared/protocol';
import { OFFICE_PLAN } from '../../../shared/plan';
import { address } from '../../../shared/callsign';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import { prepared, approved } from '../../ui/bounty';
import { hashOf } from '../beats/logic';
import { debugHandle } from '../giveway';
import { BoardCoins, PayoutFlight, type Receipt } from './flight';
import { flightCoins, shortSig, vaultView, wholeTokens, type P3, type VaultView } from './logic';
import { payout } from './sound';
import { VaultHolo } from './vault';

type Paid = Extract<ServerMsg, { t: 'bounty.paid' }>;

/** The longest a released bounty's stack waits on the vault for its coins to fly (s). */
const HOLD_S = 8;
/** How high over the deck a payout lands: the console's screen, where the unit works. */
const CONSOLE_Y = 1.05;

export function installBounties(ctx: Ctx, parts: Pick<Parts, 'views' | 'boards' | 'proofCorner'>) {
  ctx.messages.on('bounty.prepared', (m) => void prepared(m));
  ctx.messages.on('bounty.approved', (m) => {
    if (m.error) toast(`#${m.issue}: ${m.error}`, 'warn');
    else if (m.tx) void approved(m, ctx.net);
  });

  const still = () => ctx.reduceMotion.matches;
  const vault = new VaultHolo();
  const board = new BoardCoins();
  const flight = new PayoutFlight();
  ctx.scene.add(vault.root, board.mesh, flight.root);

  const here = () => (store.floor ? store.bounties?.[store.floor] : undefined);
  /**
   * The vault as it was drawn last, and a newer one held back while a released bounty's stack waits for
   * its coins to fly (the release's pulse is still on its way up the rail): the stack stays, paying,
   * until pay() sends its coins, or HOLD_S passes. With less motion it never waits.
   */
  let shown: { floor: string | null; issues: Set<number> } = { floor: null, issues: new Set() };
  let held: { v: VaultView; left: number } | null = null;
  function apply(v: VaultView) {
    held = null;
    shown = { floor: store.floor, issues: new Set(v.stacks.map((x) => x.issue)) };
    vault.set(v, still());
  }
  const render = () => {
    const v = vaultView(here());
    const released = here()?.items.some((i) => i.phase === 'released' && shown.issues.has(i.issue));
    if (released && !still() && shown.floor === store.floor) held = { v, left: held?.left ?? HOLD_S };
    else apply(v);
  };
  for (const topic of ['bounties', 'floor', 'floors'] as const) store.on(topic, render);
  render();

  /** Where a unit's console is: where it stands now, or its seat when it isn't drawn. */
  const at = new THREE.Vector3();
  function consoleOf(name: string | undefined): { p: P3; unit?: { name: string; deskId: string } } | undefined {
    const unit = name ? [...store.workers.values()].find((w) => w.name === name) : undefined;
    if (!unit) return undefined;
    const v = parts.views.workerViews.get(unit.id);
    if (v) {
      v.model.where(at);
      return { p: { x: at.x, y: CONSOLE_Y, z: at.z }, unit };
    }
    const d = OFFICE_PLAN.byId.get(unit.deskId);
    return d && { p: { x: d.x, y: CONSOLE_Y, z: d.z }, unit };
  }

  /** The payout's coins out of the vault to the unit's console, and its receipt there. */
  function pay(m: Paid) {
    if (m.floor !== store.floor) return;
    const b = here()?.items.find((i) => i.issue === m.issue);
    const decimals = b?.decimals ?? 6;
    const net = here()?.network;
    const amount = `+${wholeTokens(m.amount, decimals).toFixed(2)} ${m.symbol}`;
    const to = consoleOf(m.workerName);
    const sig = hashOf(m.url) ?? b?.txs.filter((t) => t.kind === 'paid').pop()?.sig;
    const receipt: Receipt = {
      amount,
      to: [to?.unit ? `to ${to.unit.name} (${address(to.unit.deskId)})` : m.workerName ? `to ${m.workerName}` : 'released', `PR #${m.pr}`].join('  '),
      tx: net === 'mock' ? `mock chain  ${shortSig(sig)}` : `devnet tx  ${shortSig(sig) || 'pending'}`,
    };
    const from = vault.mouth(new THREE.Vector3());
    // Nobody on the deck to fly to: the receipt stands over the vault itself.
    const dest = to?.p ?? { x: from.x + 0.6, y: CONSOLE_Y, z: from.z };
    const coins = to ? flightCoins(wholeTokens(m.amount, decimals)) : 1;
    flight.start({ x: from.x, y: from.y, z: from.z }, dest, coins, receipt, still() || !to);
    // Heard as it flies (sound.ts): the coins leaving, their rush over the deck, landing, the chord.
    ctx.sound.play('payout', 'ship', payout({ x: from.x, y: from.y, z: from.z }, dest, coins, still() || !to));
    // Its stack was held for this: the coins are on their way, the vault catches up.
    if (held) apply(held.v);
  }
  // The Proof corner is installed after this (it's read only once the deck runs): the payout follows its lid.
  let hooked = false;

  ctx.ticks.add('world', ({ dt }) => {
    if (held && (held.left -= dt) <= 0) apply(held.v);
    if (!hooked && parts.proofCorner) {
      parts.proofCorner.onArrive((m) => m && pay(m));
      hooked = true;
    }
    vault.step(dt, still());
    const issues = parts.boards.issuesTex;
    board.place(ctx.office.boardMeshes.issues, issues.sockets, issues.panel.s.W);
    flight.step(dt, ctx.camera);
  });

  const part = {
    vault,
    board,
    flight,
    /** Plays a server message as if it had come in (the shots: a payout on a throwaway office). */
    replay: (m: ServerMsg) => ctx.messages.dispatch(m),
  };
  debugHandle('bounties', part);
  return part;
}
