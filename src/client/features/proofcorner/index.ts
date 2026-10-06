/**
 * The Proof corner keeping up with the chain: the rail's tally of merges paid out on devnet (the top
 * bar's violet counter, see ui/counters.ts), the vault armed while a bounty is held in escrow and its
 * lid lifting when one is released, and a lit step on the plinth for each unit with a reputation
 * record, glowing for a moment as one is added. The corner itself is world.ts.
 *
 * A release the merge beat is carrying over (features/beats) is held back from the rail until its
 * pulse parks there: expect() when it sets off, arrive() when it lands, which also lifts the lid.
 */
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import { proofTally } from '../../ui/counters';
import { ledgerView } from './ledger';

/** How long the vault's lid stays up after a release, and how long it takes to lift or settle (seconds). */
const LID = { hold: 2.4, ease: 0.25 } as const;
/** How long a new step on the plinth glows (seconds). */
const STEP_GLOW = 1.2;

export function installProofCorner(ctx: Ctx) {
  const { proof } = ctx.office;
  /** Releases whose pulse is still on its way to the rail. */
  let pending = 0;
  let steps = -1;
  let glowT = Infinity;
  function render() {
    proof.setTally(Math.max(0, proofTally().released - pending));
    const held = Object.values(store.bounties ?? {}).some((b) => b?.enabled && b.items.some((i) => i.phase !== 'open' && i.phase !== 'released'));
    proof.setArmed(held);
    const rep = store.reputation;
    const n = rep?.enabled ? rep.agents.length : 0;
    // A step added since the corner was first drawn glows (never on the first paint, or a reload would).
    if (steps >= 0 && n > steps && !ctx.reduceMotion.matches) glowT = 0;
    steps = n;
    proof.setReputation(n);
    paintLedger();
  }
  /** The ledger's tables, repainted only when what they say changes (its times move by the minute). */
  let ledgerKey = '';
  function paintLedger() {
    const v = ledgerView(store.floor ? store.bounties?.[store.floor] : undefined, store.reputation);
    const key = JSON.stringify(v);
    if (key === ledgerKey) return;
    ledgerKey = key;
    proof.setLedger(v);
  }
  window.setInterval(() => !document.hidden && paintLedger(), 60_000);
  for (const topic of ['bounties', 'reputation', 'floors', 'floor'] as const) store.on(topic, render);
  render();

  let since = Infinity;
  ctx.ticks.add('world', ({ dt }) => {
    if (glowT !== Infinity) {
      glowT += dt;
      const k = glowT / STEP_GLOW;
      proof.setStepGlow(k < 0.2 ? k / 0.2 : Math.max(0, 1 - (k - 0.2) / 0.8));
      if (k >= 1) glowT = Infinity;
    }
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

  return {
    /** A release's pulse has set off for the rail: its segment waits for it. */
    expect() {
      pending++;
      render();
    },
    /** A release has landed on the rail (or there was no pulse to wait for): its segment lights and the lid lifts. */
    arrive() {
      pending = Math.max(0, pending - 1);
      since = 0;
      render();
    },
  };
}
