// What a row's buttons do, the same in the 3D office and the 2D view: each view says how it opens a
// terminal, the Changes window and a pull request, and how it gets you to another floor; the rest
// (riding there first, snoozing, linking, sending home) is here.

import type { NextAction } from '../../../shared/attention';
import type { RosterEntry } from '../../../shared/protocol';
import type { Net } from '../../net';
import { store } from '../../state';
import { closeAllModals, toast } from '../dom';
import { openPrompt } from '../prompt';
import { confirmSendHome } from '../sendhome';

/** What Mission control needs from the view it's in. */
export interface MissionDeps {
  net: Net;
  /** Opens a worker on your floor's terminal, waking it when it's asleep. */
  openTerminal(id: string): void;
  /** Its Changes window. */
  openChanges(id: string): void;
  /** Its pull request's window, or GitHub's page for it. */
  openPr(id: string): void;
  /** Its worktree was deleted outside the office: put it back, or send it home. */
  fixLost(id: string): void;
  /** Takes you to another floor, to the worker's desk when the view has desks to stand at. */
  goTo(floor: string, deskId: string): void;
}

/** Things to do once you're on a floor, by floor: the ride there is running them when it lands. */
const onArrival = new Map<string, () => void>();
store.on('floor', () => {
  const run = store.floor ? onArrival.get(store.floor) : undefined;
  onArrival.clear();
  // A tick later, once everything on the floor has taken it in (its workers, their terminals).
  if (run) setTimeout(run, 0);
});

/** Runs `then` on the worker's floor: right away on yours, else once you've got there. */
export function onFloorOf(deps: MissionDeps, e: RosterEntry, then: () => void) {
  if (e.floor === store.floor) return then();
  closeAllModals();
  toast(`Over to ${e.floorName}, for ${e.name}`);
  onArrival.clear();
  onArrival.set(e.floor, then);
  deps.goTo(e.floor, e.deskId);
}

/** Does a row's action, on the worker's own floor. */
export function runAction(deps: MissionDeps, e: RosterEntry, action: NextAction | 'terminal') {
  onFloorOf(deps, e, () => {
    const w = store.workers.get(e.id);
    if (!w) return toast(`${e.name} has gone home`, 'warn');
    closeAllModals();
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
        return deps.openPr(w.id);
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

/** What it's linked to: its milestone, else its issue, else nothing (unlinked). */
export function linkLabel(e: RosterEntry): string {
  if (e.goalTitle) return e.issue ? `${e.goalTitle} · #${e.issue}` : e.goalTitle;
  return e.issue ? `#${e.issue}` : 'unlinked';
}

/** What it's on: its task's name and line, else its latest activity. */
export function doingLabel(e: RosterEntry): string {
  if (e.task?.name) return e.task.summary ? `${e.task.name}: ${e.task.summary}` : e.task.name;
  return e.activity ?? '';
}
