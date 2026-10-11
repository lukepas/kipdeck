// Signal: a floor's gist for the home page's status chip (server/signal/gist.ts). Named by its id
// only, never a path; anyone in the office may read it, as they may read the floor's timeline. Not a
// lab of its own: each part of the gist follows its own lab. Dropped without a word in the read-only
// demo (demo/readonly.ts), as the rundown is: a project's decisions are not for anonymous visitors.
import type { SignalClientMsg } from '../../../shared/protocol.js';
import { throttle } from '../../office/client.js';
import { str } from '../../office/input.js';
import { signalGist } from '../../signal/gist.js';
import type { HandlerMap } from './types.js';

/** The least time between two peeks at one floor from one page (ms). */
export const PEEK_GAP_MS = 1000;

export const signalHandlers = {
  'signal.peek'(ctx, c, msg) {
    const floor = ctx.floors.get(str(msg.floor, 80));
    if (!floor) return ctx.warn(c, 'No such project');
    if (!throttle(c, `signal:${floor.id}`, PEEK_GAP_MS)) return;
    void signalGist(floor, { ops: ctx.labs.on('ops'), rundown: ctx.labs.on('rundown') })
      .then((gist) => ctx.sendTo(c, { t: 'signal.gist', gist }))
      .catch((err) => console.warn(`agent-office: signal for ${floor.def.name} failed: ${err instanceof Error ? err.message : String(err)}`));
  },
} satisfies HandlerMap<SignalClientMsg>;
