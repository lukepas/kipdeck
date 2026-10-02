/**
 * Milestones on your floor: a pull request merged, or the task queue finished. Each is a toast, a
 * ding, and a desktop notification while you're in another tab, so nobody misses the work landing.
 */
import type { Ctx } from '../../core/context';
import type { DesktopNotifier } from '../../notify';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import { milestoneText } from './text';

export interface MilestonesDeps {
  notifier: DesktopNotifier;
}

export function installMilestones(ctx: Ctx, deps: MilestonesDeps) {
  ctx.messages.on('milestone', (msg) => {
    const pull = msg.pr === undefined ? undefined : store.pulls.items.find((p) => p.number === msg.pr);
    const text = milestoneText(msg.kind, msg.pr, msg.by, pull?.title);
    // The queue's own toast already says so (the office sends it with this).
    if (msg.kind === 'merged') toast(`✅ ${text.title}${text.body ? `: ${text.body}` : ''}`);
    ctx.sound.ding('done');
    deps.notifier.milestone(`${store.currentFloor()?.name ?? 'Agent Office'}: ${text.title}`, text.body);
  });
}
