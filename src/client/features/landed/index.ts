/**
 * Work landing on your deck: a pull request merged, or the task queue finished. Each is a toast and
 * a desktop notification while you're in another tab, so nobody misses the work landing. A merge also
 * starts the merge beat (features/beats); the merged cue waits for the proof on chain.
 *
 * Merges that land close together gather into one toast ("3 PRs merged by Tess") instead of a stack.
 * While the start of watch plays (features/launch) the merge toasts are held: the debrief already
 * says how many landed, so those held while it is up are dropped; any held otherwise come out as
 * one gathered toast once it is over.
 */
import type { Ctx } from '../../core/context';
import type { DesktopNotifier } from '../../notify';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import { GATHER_MS, gatheredText, landedText, type MergeNote } from './text';

export interface LandedDeps {
  notifier: DesktopNotifier;
  /** Whether a ritual is up that already tells the captain what landed: 'drop' (the debrief), 'hold' (the log), or null. */
  ritual(): 'drop' | 'hold' | null;
}

export function installLanded(ctx: Ctx, deps: LandedDeps) {
  /** The toast gathering merges now, and what it has. */
  let open: { el: HTMLElement; merges: MergeNote[]; until: number } | null = null;
  let held: MergeNote[] = [];

  function show(merges: MergeNote[], title?: string) {
    const text = gatheredText(merges, title);
    const line = `${text.title}${text.body ? `: ${text.body}` : ''}`;
    const now = Date.now();
    if (open && now < open.until && open.el.isConnected) {
      open.merges.push(...merges);
      const t = gatheredText(open.merges);
      const span = open.el.querySelector('.toast-text');
      if (span) span.textContent = `${t.title}${t.body ? `: ${t.body}` : ''}`;
      open.until = now + GATHER_MS;
      return;
    }
    open = { el: toast(line), merges: [...merges], until: now + GATHER_MS };
  }

  ctx.messages.on('landed', (msg) => {
    const pull = msg.pr === undefined ? undefined : store.pulls.items.find((p) => p.number === msg.pr);
    const text = landedText(msg.kind, msg.pr, msg.by, pull?.title);
    deps.notifier.landed(`${store.currentFloor()?.name ?? 'Mergeline'}: ${text.title}`, text.body);
    // The queue's own toast already says so (the office sends it with this).
    if (msg.kind !== 'merged') return;
    const note: MergeNote = { pr: msg.pr, by: msg.by };
    const ritual = deps.ritual();
    if (ritual === 'drop') return;
    if (ritual === 'hold') return void held.push(note);
    show([note], pull?.title);
  });

  // Once the ritual is over, whatever was held comes out as one toast (or goes, if the debrief came up and said it).
  ctx.ticks.add('hud', () => {
    if (!held.length) return;
    const ritual = deps.ritual();
    if (ritual === 'drop') held = [];
    else if (ritual === null) {
      const out = held;
      held = [];
      show(out);
    }
  });
}
