/**
 * Proof of Merge bounties in the office: the browser wallet signs a funding the office built, a
 * payout is a toast with its devnet explorer link for everyone, and an approval answers whoever gave
 * it. The chips and the Fund window are in ui/bounty.ts; the review inbox rows in ui/mission/review.ts.
 */
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import { prepared, approved } from '../../ui/bounty';
import { tokenAmount } from '../../../shared/review';

export function installBounties(ctx: Ctx) {
  ctx.messages.on('bounty.prepared', (m) => void prepared(m));
  ctx.messages.on('bounty.approved', (m) => {
    if (m.error) toast(`💰 #${m.issue}: ${m.error}`, 'warn');
    else if (m.tx) void approved(m, ctx.net);
  });
  ctx.messages.on('bounty.paid', (m) => {
    const floor = store.floors.find((f) => f.id === m.floor)?.name;
    const decimals = store.bounties[m.floor]?.items.find((b) => b.issue === m.issue)?.decimals ?? 6;
    toast(`💸 Paid ${tokenAmount(m.amount, decimals)} ${m.symbol} to ${m.workerName ?? 'the office'} for PR #${m.pr}${floor ? ` on ${floor}` : ''}${m.url ? `: ${m.url}` : ''}`);
    ctx.sound.ding('done');
  });
}
