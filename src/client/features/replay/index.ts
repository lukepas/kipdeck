/**
 * The Deck in the replay demo (docs/demo.md#the-replay-demo): a recorded round of the hosted demo on a
 * static page. The project's city over the mission table (features/rundown) is the first thing a
 * visitor should see there, so it comes up by itself when the welcome says this is the replay. It is
 * not saved: a visitor who puts the city away has it back on the next visit. Anywhere else this does
 * nothing.
 */
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { cityOnInReplay } from './logic';

export function installReplayDeck(ctx: Ctx, parts: Pick<Parts, 'settings'>) {
  const off = ctx.messages.on('welcome', (msg) => {
    off();
    parts.settings.rundownHolo = cityOnInReplay(msg.demo, parts.settings.rundownHolo);
  });
}
