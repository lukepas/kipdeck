import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EscrowError, MAX_DURATION_SECS, allowedMints, hexOf, machine, toAddress, type BountyAccount, type ContributionAccount } from '../src/index.js';

const doc = JSON.parse(readFileSync(new URL('../../fixtures/transitions.json', import.meta.url), 'utf8'));
const keys: Record<string, string> = Object.fromEntries(
  Object.entries(doc.keys as Record<string, number | string>).map(([k, v]) => [k, toAddress(typeof v === 'number' ? new Uint8Array(32).fill(v) : Uint8Array.from(Buffer.from(v, 'hex')))]),
);
const named = (step: any, field: string, fallback: string) => keys[step[field] ?? fallback];

test('the shared table runs the same on the TypeScript machine as on the Rust one', () => {
  assert.equal(doc.maxDurationSecs, MAX_DURATION_SECS);
  assert.ok(doc.cases.length >= 15);
  for (const c of doc.cases) {
    let b: BountyAccount | undefined;
    const contributions = new Map<string, ContributionAccount>();
    c.steps.forEach((step: any, i: number) => {
      const at = `${c.name}, step ${i} (${step.op})`;
      let paid: bigint | undefined;
      let cancelled: string | undefined;
      const run = () => {
        switch (step.op) {
          case 'init':
            b = machine.init(
              {
                repoHash: hexOf(new Uint8Array(32).fill(10)),
                issue: 12,
                nonce: 0,
                mint: named(step, 'mint', 'usdc'),
                vault: toAddress(new Uint8Array(32).fill(11)),
                expiryTs: step.expiry,
                attester: named(step, 'attester', 'attester'),
                approver: named(step, 'approver', 'approver'),
                creator: keys.creator,
                allowedMints: allowedMints(false),
              },
              step.now,
            );
            return;
          case 'fund': {
            const f = named(step, 'funder', 'funder');
            contributions.set(f, machine.fund(b!, contributions.get(f), f, BigInt(step.amount), keys.bounty, step.now));
            return;
          }
          case 'claim':
            machine.claim(b!, named(step, 'signer', 'attester'), step.pr, named(step, 'wallet', 'agent'), step.now);
            return;
          case 'release':
            paid = machine.release(
              b!,
              { attester: named(step, 'attester', 'attester'), approver: named(step, 'approver', 'approver'), prNumber: step.pr, vault: step.vault === undefined ? undefined : BigInt(step.vault), mergeSha: 'ab'.repeat(20), mergedByHash: 'cd'.repeat(32) },
              step.now,
            );
            return;
          case 'refund': {
            const f = named(step, 'funder', 'funder');
            const mine = { ...contributions.get(f)! };
            paid = machine.refund(b!, mine, keys.bounty, step.now);
            contributions.set(f, mine);
            return;
          }
          case 'cancel':
            cancelled = machine.cancel(b!, step.creator_signed === true, named(step, 'approver', 'nobody'), 0n, step.now);
            return;
          default:
            throw new Error(`unknown op ${step.op}`);
        }
      };
      // A step that fails changes nothing, as a transaction wouldn't.
      const before = b && structuredClone(b);
      try {
        run();
        assert.equal(step.expect, 'ok', `${at}: expected ${step.expect}, got ok`);
        if (step.paid !== undefined) assert.equal(paid, BigInt(step.paid), `${at}: paid`);
        if (step.result !== undefined) assert.equal(cancelled, step.result, `${at}: cancel`);
      } catch (err) {
        if (err instanceof assert.AssertionError) throw err;
        assert.ok(err instanceof EscrowError, `${at}: ${err}`);
        assert.equal(err.reason, step.expect, at);
        if (before) b = before;
      }
      if (step.state !== undefined) assert.equal(b!.state, step.state, `${at}: state`);
      if (step.total_after !== undefined) assert.equal(b!.total, BigInt(step.total_after), `${at}: total`);
      if (step.funders_after !== undefined) assert.equal(b!.funderCount, step.funders_after, `${at}: funders`);
      if (step.contribution_after !== undefined) assert.equal(contributions.get(named(step, 'funder', 'funder'))!.amount, BigInt(step.contribution_after), `${at}: contribution`);
      if (step.pr_after !== undefined) assert.equal(b!.prNumber, step.pr_after, `${at}: pr`);
      if (step.wallet_after !== undefined) assert.equal(b!.claimantWallet, keys[step.wallet_after], `${at}: wallet`);
    });
  }
});
