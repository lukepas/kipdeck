/**
 * The Proof corner keeping up with the chain: the rail's tally of merges paid out on devnet (the top
 * bar's violet counter, see ui/counters.ts), the vault armed while a bounty is held in escrow and its
 * lid lifting when one is released, and a lit step on the plinth for each unit with a reputation
 * record. The corner itself is world.ts.
 */
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import { proofTally } from '../../ui/counters';

/** How long the vault's lid stays up after a release, and how long it takes to lift or settle (seconds). */
const LID = { hold: 2.4, ease: 0.25 } as const;

export function installProofCorner(ctx: Ctx) {
  const { proof } = ctx.office;
  function render() {
    proof.setTally(proofTally().released);
    const held = Object.values(store.bounties ?? {}).some((b) => b?.enabled && b.items.some((i) => i.phase !== 'open' && i.phase !== 'released'));
    proof.setArmed(held);
    const rep = store.reputation;
    proof.setReputation(rep?.enabled ? rep.agents.length : 0);
  }
  for (const topic of ['bounties', 'reputation', 'floors'] as const) store.on(topic, render);
  render();

  // A release lifts the lid for a moment (the merge beat's vault step), or swaps straight to lit
  // under reduced motion.
  let since = Infinity;
  ctx.messages.on('bounty.paid', () => {
    since = 0;
    render();
  });
  ctx.ticks.add('world', ({ dt }) => {
    if (since === Infinity) return;
    since += dt;
    const instant = ctx.reduceMotion.matches;
    const up = instant ? 1 : Math.min(1, since / LID.ease);
    const down = instant ? (since > LID.hold ? 1 : 0) : Math.max(0, (since - LID.hold) / LID.ease);
    proof.setLid(Math.max(0, up - down));
    if (since > LID.hold + LID.ease) {
      since = Infinity;
      proof.setLid(0);
    }
  });
}
