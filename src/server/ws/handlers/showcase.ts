// ⚙️ Settings for the public showcase (/pom/): whether it is on and how each repository shows there.
// Admins only, both ways: the list names every floor's repository, private ones too.
import type { ShowcaseClientMsg } from '../../../shared/protocol.js';
import type { Ctx } from '../../office/context.js';
import type { Client } from '../../office/client.js';
import type { HandlerMap } from './types.js';

const sendState = (ctx: Ctx, c: Client) => void ctx.showcase.state().then((state) => ctx.sendTo(c, { t: 'showcase.settings', state }));

export const showcaseHandlers = {
  'showcase.settings.get'(ctx, c) {
    if (!ctx.meOf(c.accountId).admin) return ctx.warn(c, 'Only admins can see the showcase settings');
    sendState(ctx, c);
  },
  'showcase.settings'(ctx, c, msg) {
    if (!ctx.meOf(c.accountId).admin) return ctx.warn(c, 'Only admins can change the public showcase');
    const who = c.peer.name;
    const was = ctx.showcase.enabled;
    ctx.showcase.settings.set(msg.patch, who);
    ctx.showcase.invalidate();
    if (was !== ctx.showcase.enabled) ctx.toastAll(ctx.showcase.enabled ? `🌐 ${who} turned on the public showcase at /pom/ (read only, testnet data)` : `${who} turned off the public showcase`);
    for (const o of ctx.clients.values()) if (ctx.meOf(o.accountId).admin) sendState(ctx, o);
  },
} satisfies HandlerMap<ShowcaseClientMsg>;
