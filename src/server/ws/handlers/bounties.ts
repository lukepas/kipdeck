// Proof of Merge bounties (see server/bounties.ts): funding from a browser wallet, approving payouts
// (admins only: the approver key signs, or the admin's approver wallet is handed the release, only
// after that check), cranking refunds (admins only: the attester pays their fees), payout wallets and
// the bounty settings (admins only).
import type { BountiesClientMsg } from '../../../shared/protocol.js';
import type { Ctx } from '../../office/context.js';
import type { Client } from '../../office/client.js';
import { here } from './common.js';
import type { HandlerMap, ViewPieces } from './types.js';

/** The floor's bounties, for whoever arrives on it. */
export const bountiesView: ViewPieces['bounties'] = (ctx, floor) => ctx.bounties.state(floor);

const admin = (ctx: Ctx, c: Client, what: string): boolean => {
  if (ctx.meOf(c.accountId).admin) return true;
  ctx.warn(c, `Only admins can ${what}`);
  return false;
};

/** The floor a message names (the review inbox spans floors), else the one `c` is on. */
const onFloor = (ctx: Ctx, c: Client, id: unknown) => (typeof id === 'string' && ctx.floors.get(id)) || here(ctx, c);

const settingsFor = (ctx: Ctx, c: Client) => ({ t: 'bounty.settings' as const, state: ctx.bounties.settings.state(c.accountId, ctx.bounties.keys()) });

export const bountiesHandlers = {
  'bounty.list'(ctx, c) {
    const floor = here(ctx, c);
    if (floor) ctx.sendTo(c, { t: 'bounties', floor: floor.id, state: ctx.bounties.state(floor) });
  },
  'bounty.fund.prepare'(ctx, c, msg) {
    const floor = here(ctx, c);
    if (!floor) return;
    const issue = msg.issue;
    void ctx.bounties.prepareFund(floor, issue, msg.amount, msg.wallet).then((r) => ctx.sendTo(c, { t: 'bounty.prepared', issue: Number(issue) || 0, ...r }));
  },
  'bounty.approve'(ctx, c, msg) {
    const floor = onFloor(ctx, c, msg.floor);
    if (!floor) return;
    // Checked before anything else: the approver key is read only after this.
    if (!admin(ctx, c, 'approve bounty payouts')) return ctx.sendTo(c, { t: 'bounty.approved', issue: Number(msg.issue) || 0, error: 'Only admins can approve bounty payouts' });
    const who = c.peer.name;
    void ctx.bounties.approve(floor, msg.issue, who).then((r) => {
      ctx.sendTo(c, { t: 'bounty.approved', issue: Number(msg.issue) || 0, floor: floor.id, ...r });
      if (r.sig) console.log(`  ${who} approved the payout of #${msg.issue}'s bounty on ${floor.def.name}`);
    });
  },
  'bounty.release.sent'(ctx, c, msg) {
    const floor = onFloor(ctx, c, msg.floor);
    if (!floor || !admin(ctx, c, 'approve bounty payouts')) return;
    // Nothing is taken on trust from the message: the chain says whether it was paid.
    void ctx.bounties.sync(floor);
  },
  'bounty.refund'(ctx, c, msg) {
    const floor = onFloor(ctx, c, msg.floor);
    // The attester's key signs and pays for each refund: an admin's call.
    if (!floor || !admin(ctx, c, 'crank bounty refunds')) return;
    void ctx.bounties.refund(floor, msg.issue).then((err) => (err ? ctx.warn(c, err) : ctx.sendTo(c, { t: 'toast', text: `↩️ #${msg.issue}'s bounty went back to its funders`, level: 'info' })));
  },
  'bounty.wallet'(ctx, c, msg) {
    const err = ctx.bounties.settings.setWallet(c.accountId, msg.address === null ? null : String(msg.address ?? '').trim(), (a) => ctx.bounties.isAddress(a));
    if (err) return ctx.warn(c, err);
    ctx.sendTo(c, settingsFor(ctx, c));
    // A bounty may have waited for this wallet to be claimed.
    for (const f of ctx.floors.values()) ctx.bounties.pulls(f);
  },
  'bounty.settings'(ctx, c, msg) {
    if (!admin(ctx, c, 'change the bounty settings')) return;
    const who = c.peer.name;
    const was = ctx.bounties.enabled;
    ctx.bounties.settings.set(msg.patch, who);
    if (was !== ctx.bounties.enabled) ctx.toastAll(ctx.bounties.enabled ? `💰 ${who} turned on Proof of Merge bounties (${ctx.bounties.network}, testnet only)` : `${who} turned off bounties`);
    void ctx.bounties.ready().then(() => {
      for (const o of ctx.clients.values()) if (ctx.meOf(o.accountId).admin || o === c) ctx.sendTo(o, settingsFor(ctx, o));
    });
  },
  'bounty.settings.get'(ctx, c) {
    ctx.sendTo(c, settingsFor(ctx, c));
  },
} satisfies HandlerMap<BountiesClientMsg>;
