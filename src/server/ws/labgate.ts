// The messages that belong to a lab (see shared/labs.ts), so a lab that is off is off over the socket
// too, not only hidden in the page and its HTTP routes (http/router.ts's `lab`): Proof of Merge's
// bounties, payouts, reputation and showcase settings, the meeting room, and voice and screen sharing.
// A message for a lab that's off goes nowhere, with one line saying why. Each lab's handlers are named
// by their map, so a message added to one of those maps is gated with it.
import { LAB_META, type LabId } from '../../shared/labs.js';
import type { Ctx } from '../office/context.js';
import type { Client } from '../office/client.js';
import { bountiesHandlers } from './handlers/bounties.js';
import { meetingHandlers } from './handlers/meetings.js';
import { reputationHandlers } from './handlers/reputation.js';
import { rundownHandlers } from './handlers/rundown.js';
import { showcaseHandlers } from './handlers/showcase.js';

const LAB_MAPS: [LabId, object][] = [
  ['proof', bountiesHandlers],
  ['proof', reputationHandlers],
  ['proof', showcaseHandlers],
  ['meetings', meetingHandlers],
  ['rundown', rundownHandlers],
];

/** Which lab each gated message type belongs to. */
export const MESSAGE_LAB: ReadonlyMap<string, LabId> = new Map<string, LabId>([
  ...LAB_MAPS.flatMap(([lab, map]) => Object.keys(map).map((t) => [t, lab] as [string, LabId])),
  ['voice', 'voice'],
  ['rtc', 'voice'],
]);

/** Drops a message whose lab is off (true), telling its sender which lab it needs. */
export function labRefuses(ctx: Pick<Ctx, 'labs' | 'warn'>, c: Client, type: string): boolean {
  const lab = MESSAGE_LAB.get(type);
  if (!lab || ctx.labs.on(lab)) return false;
  // Voice's own chatter (who's talking, the call's signalling) is dropped without a word.
  if (lab !== 'voice') ctx.warn(c, `${LAB_META[lab].name} is off. An admin turns it on in Labs.`);
  return true;
}
