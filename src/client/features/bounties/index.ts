/**
 * Proof of Merge bounties in the office: the browser wallet signs a funding the office built, and an
 * approval answers whoever gave it. A payout is the merge beat's (features/beats): the pulse up the
 * rail and a violet toast with its devnet transaction. The chips and the Fund window are in
 * ui/bounty.ts; the review inbox rows in ui/mission/review.ts.
 */
import type { Ctx } from '../../core/context';
import { toast } from '../../ui/dom';
import { prepared, approved } from '../../ui/bounty';

export function installBounties(ctx: Ctx) {
  ctx.messages.on('bounty.prepared', (m) => void prepared(m));
  ctx.messages.on('bounty.approved', (m) => {
    if (m.error) toast(`#${m.issue}: ${m.error}`, 'warn');
    else if (m.tx) void approved(m, ctx.net);
  });
}
