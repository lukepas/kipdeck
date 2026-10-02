// What a row's buttons do, the same in the 3D office and the 2D view: each view says how it opens a
// terminal, the Changes window, a pull request and the queue, and how it gets you to another floor;
// the rest (riding there first, snoozing, linking, sending home, marking finished work seen) is here.

import { attention, type NextAction } from '../../../shared/attention';
import type { Reminder, ReviewPull, RosterEntry, TimelineEvent } from '../../../shared/protocol';
import type { ReviewPayout } from '../../../shared/review';
import type { Net } from '../../net';
import { store, type MissionTab } from '../../state';
import { closeAllModals, toast } from '../dom';

/** Whether Mission control's own window is the one open (set by index.ts, which owns it). */
let missionOpenNow: () => boolean = () => false;
export function setMissionOpen(fn: () => boolean) {
  missionOpenNow = fn;
}
import { openPrompt } from '../prompt';
import type { PullThen } from '../pull';
import { confirmSendHome } from '../sendhome';

/** What Mission control needs from the view it's in. */
export interface MissionDeps {
  net: Net;
  /** Opens a worker on your floor's terminal, waking it when it's asleep. */
  openTerminal(id: string): void;
  /** Its Changes window. */
  openChanges(id: string): void;
  /** Its pull request's window, or GitHub's page for it, or a new one opened from its branch. */
  openPr(id: string): void;
  /** Pull request `number` on your floor: its window, then the Merge dialog or handing it back (`then`). */
  openPull(number: number, then?: PullThen): void;
  /** The floor's task queue. */
  openQueue(): void;
  /** Its worktree was deleted outside the office: put it back, or send it home. */
  fixLost(id: string): void;
  /** Takes you to another floor, to the worker's desk when the view has desks to stand at. */
  goTo(floor: string, deskId?: string): void;
  /** Opens Mission control on a tab (the Goals of the floor you're on, say). */
  showTab(tab: MissionTab): void;
}

/** Things to do once you're on a floor, by floor: the ride there is running them when it lands. */
const onArrival = new Map<string, () => void>();
store.on('floor', () => {
  const run = store.floor ? onArrival.get(store.floor) : undefined;
  onArrival.clear();
  // A tick later, once everything on the floor has taken it in (its workers, their terminals).
  if (run) setTimeout(run, 0);
});

/** Runs `then` on floor `where`: right away on yours, else once you've got there (to `deskId`, when there's one). */
export function onFloor(deps: MissionDeps, where: { floor: string; floorName: string; deskId?: string; what: string }, then: () => void) {
  if (where.floor === store.floor) return then();
  closeAllModals();
  toast(`Over to ${where.floorName}, for ${where.what}`);
  onArrival.clear();
  onArrival.set(where.floor, then);
  deps.goTo(where.floor, where.deskId);
}

/** Runs `then` on the worker's floor: right away on yours, else once you've got there. */
export function onFloorOf(deps: MissionDeps, e: RosterEntry, then: () => void) {
  onFloor(deps, { floor: e.floor, floorName: e.floorName, deskId: e.deskId, what: e.name }, then);
}

/** Looking at a finished worker's work from the Review tab is seeing it, as opening its terminal is. */
const SEES: ReadonlySet<NextAction | 'terminal'> = new Set(['review', 'open-pr', 'fix-checks', 'merge', 'hand-back', 'send-home']);

/** Does a row's action, on the worker's own floor. */
export function runAction(deps: MissionDeps, e: RosterEntry, action: NextAction | 'terminal') {
  onFloorOf(deps, e, () => {
    const w = store.workers.get(e.id);
    if (!w) return toast(`${e.name} has gone home`, 'warn');
    closeAllModals();
    if (SEES.has(action) && w.status === 'done' && !w.acked) deps.net.send({ t: 'worker.ack', workerId: w.id });
    const pr = e.pr?.number;
    switch (action) {
      case 'answer':
      case 'look':
      case 'terminal':
        return deps.openTerminal(w.id);
      case 'review':
        return deps.openChanges(w.id);
      case 'open-pr':
      // Its PR's window has "Fix comments & merge", which checks who the PR is from first.
      case 'fix-checks':
        return pr ? deps.openPull(pr) : deps.openPr(w.id);
      case 'merge':
        return pr ? deps.openPull(pr, 'merge') : deps.openPr(w.id);
      case 'hand-back':
        return pr ? deps.openPull(pr, 'hand-back') : deps.openPr(w.id);
      case 'resume':
        return deps.net.send({ t: 'worker.resume', workerId: w.id });
      case 'rebuild':
        return deps.fixLost(w.id);
      case 'send-home':
        return confirmSendHome(deps.net, w);
      case 'give-task':
        return openPrompt({
          title: `Give ${w.name} a task`,
          subtitle: store.mission.statement ? 'It already knows the floor\'s mission; say what to do.' : undefined,
          onSubmit: (text) => deps.net.send({ t: 'worker.prompt', workerId: w.id, prompt: text }),
        });
    }
  });
}

/** Does a pull request row's action (one no worker stands for), on its own floor. */
export function runPull(deps: MissionDeps, p: ReviewPull, action: NextAction) {
  onFloor(deps, { floor: p.floor, floorName: p.floorName, what: `PR #${p.number}` }, () => {
    closeAllModals();
    deps.openPull(p.number, action === 'merge' ? 'merge' : action === 'hand-back' ? 'hand-back' : undefined);
  });
}

/**
 * A bounty row's action: approving the payout (an admin's; the office checks again, and reads the
 * approver key only then), or setting your payout wallet.
 */
export function runPayout(deps: MissionDeps, p: ReviewPayout, action: NextAction) {
  if (action === 'approve-payout') {
    deps.net.send({ t: 'bounty.approve', issue: p.issue, floor: p.floor });
    return toast(`💰 Approving the payout of ${p.amount} for PR #${p.pr}...`);
  }
  openPrompt({
    title: 'Your payout wallet',
    placeholder: 'Your Solana devnet address',
    subtitle: 'A Solana devnet address (not a key). Bounties your workers\' pull requests claim are paid there once a person merges them and an admin approves.',
    onSubmit: (text) => deps.net.send({ t: 'bounty.wallet', address: text.trim() }),
  });
}

/** What a reminder's button does: to the worker, the pull request, the floor's goals or its queue. */
export function runReminder(deps: MissionDeps, r: Reminder) {
  const e = r.worker ? store.rosterEntry(r.worker) : undefined;
  if (e) return runAction(deps, e, r.kind === 'unpushed-asleep' ? 'review' : attention(e, Date.now()).action);
  if (r.worker) return toast('That worker has gone home', 'warn');
  onFloor(deps, { floor: r.floor, floorName: r.floorName, what: 'a reminder' }, () => {
    if (r.pr) {
      closeAllModals();
      return deps.openPull(r.pr, r.kind === 'approved-unmerged' ? 'merge' : undefined);
    }
    if (r.kind === 'queue-paused') {
      closeAllModals();
      return deps.openQueue();
    }
    deps.showTab('goals');
  });
}

/** What a reminder's button says. */
export function reminderAction(r: Reminder): string {
  switch (r.kind) {
    case 'approved-unmerged':
      return 'Merge';
    case 'queue-paused':
      return 'Open the queue';
    case 'milestone-overdue':
      return 'See the goals';
    case 'unpushed-asleep':
      return 'Review changes';
    default:
      return 'Look into it';
  }
}

/** Puts a reminder aside until `until`, dismisses it ('change'), or brings it back (null). */
export function snoozeReminder(net: Net, r: Reminder, until: number | 'change' | null) {
  net.send({ t: 'reminder.snooze', key: r.key, until });
}

/** Clicking an event on the timeline: the worker (when it's still here), its pull request, its milestone, else its floor. */
export function openEvent(deps: MissionDeps, ev: TimelineEvent) {
  const floorName = store.floors.find((f) => f.id === ev.floor)?.name ?? 'its floor';
  const e = ev.worker ? store.rosterEntry(ev.worker) : undefined;
  if (e) return runAction(deps, e, 'terminal');
  onFloor(deps, { floor: ev.floor, floorName, what: ev.name ?? 'what happened' }, () => {
    if (ev.pr) {
      closeAllModals();
      return deps.openPull(ev.pr);
    }
    if (ev.goal || ev.kind === 'mission' || ev.kind === 'milestone' || ev.kind === 'progress') {
      // Out of the digest, if that's where it was clicked.
      if (!missionOpenNow()) closeAllModals();
      return deps.showTab('goals');
    }
    if (ev.kind.startsWith('task-')) {
      closeAllModals();
      return deps.openQueue();
    }
    if (ev.worker) toast(`${ev.name ?? 'That worker'} has gone home`, 'warn');
  });
}

/** Puts a worker aside for `ms`, until it changes ('change'), or no longer (null). */
export function snooze(net: Net, e: RosterEntry, until: number | 'change' | null) {
  net.send({ t: 'worker.snooze', workerId: e.id, until });
}

/** "snoozed by Ana until 14:30", "snoozed by Ana until it changes". */
export function snoozeLabel(e: RosterEntry): string | undefined {
  const s = e.snooze;
  if (!s) return undefined;
  const when = s.until === 'change' ? 'it changes' : new Date(s.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `snoozed by ${s.by} until ${when}`;
}

/** Dollars, the way the rest of the office shows them. */
export function money(usd: number | undefined): string {
  if (!usd) return '';
  return usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;
}

/** What it's on: its task's name and line, else its latest activity. */
export function doingLabel(e: RosterEntry): string {
  if (e.task?.name) return e.task.summary ? `${e.task.name}: ${e.task.summary}` : e.task.name;
  return e.activity ?? '';
}
