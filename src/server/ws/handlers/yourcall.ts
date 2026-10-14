// Your call (server/rundown/yourcall.ts): a page asks to hear every project's open decisions and next
// step, and an admin answers one. Gated by the Rundown lab (ws/labgate.ts); the read-only demo takes
// neither (demo/readonly.ts), as with the rundown itself: a project's decisions are not for visitors.
import type { YourCallClientMsg } from '../../../shared/protocol.js';
import { oneLine } from '../../../shared/rundown/answer.js';
import { str } from '../../office/input.js';
import { answerCall, watchCall } from '../../rundown/yourcall.js';
import type { HandlerMap } from './types.js';

export const yourCallHandlers = {
  'yourcall.watch'(ctx, c) {
    void watchCall(ctx, c).catch(() => {});
  },
  'yourcall.answer'(ctx, c, msg) {
    const mtime = typeof msg.mtime === 'number' && Number.isFinite(msg.mtime) ? msg.mtime : null;
    void answerCall(ctx, c, str(msg.floor, 80), str(msg.id, 8), oneLine(msg.answer, 400), mtime).catch((err) => console.warn(`agent-office: your call: ${err instanceof Error ? err.message : String(err)}`));
  },
} satisfies HandlerMap<YourCallClientMsg>;
