/**
 * Work landing on your deck: a pull request merged, or the task queue finished. Each is a toast and
 * a desktop notification while you're in another tab, so nobody misses the work landing. A merge also
 * starts the merge beat (features/beats); the merged cue waits for the proof on chain.
 */
import type { Ctx } from '../../core/context';
import type { DesktopNotifier } from '../../notify';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import { landedText } from './text';

export interface LandedDeps {
  notifier: DesktopNotifier;
}

export function installLanded(ctx: Ctx, deps: LandedDeps) {
  ctx.messages.on('landed', (msg) => {
    const pull = msg.pr === undefined ? undefined : store.pulls.items.find((p) => p.number === msg.pr);
    const text = landedText(msg.kind, msg.pr, msg.by, pull?.title);
    // The queue's own toast already says so (the office sends it with this).
    if (msg.kind === 'merged') toast(`${text.title}${text.body ? `: ${text.body}` : ''}`);
    deps.notifier.landed(`${store.currentFloor()?.name ?? 'UGC Army'}: ${text.title}`, text.body);
  });
}
