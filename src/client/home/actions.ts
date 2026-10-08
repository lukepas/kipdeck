// What the inbox's buttons do, the same from a row, the pane's header and the keyboard: answer, review,
// merge, send back, fix checks, resume, stop and archive. The windows behind them that the home page
// doesn't draw itself (a pull request, the boards, the queue, Mission control) load when first wanted.

import { nextUp, type RowAction } from '../../shared/inbox';
import { waitWords } from '../../shared/metrics';
import type { InboxServerMsg, Reminder, RosterEntry } from '../../shared/protocol';
import type { AgentProvider } from '../../shared/providers';
import type { Net } from '../net';
import { loadSettings, MISSION_TABS, saveSettings, store, type MissionTab } from '../state';
import { toast } from '../ui/dom';
import type { BoardActions } from '../ui/github/prompts';
import { reminderAction, runReminder, type MissionDeps } from '../ui/mission/act';
import { confirmDialog, lostWorktreeDialog, openPrompt } from '../ui/prompt';
import { onProject, openDeploy } from './deploy';
import * as lazy from './lazy';
import { currentView } from './list';
import { home } from './state';

/** The prompt Fix checks sends: the agent looks the failures up itself. */
export const fixChecksPrompt = (pr: number) => `The checks on pull request #${pr} are failing. Run \`gh pr checks ${pr}\`, find out why, fix it and push.`;

export interface Actions {
  act(e: RosterEntry, action: RowAction): void;
  remind(r: Reminder): void;
  reminderLabel(r: Reminder): string;
  merge(e: RosterEntry): void;
  /** Agents whose merge is under way. */
  merging: Set<string>;
  sendBack(e: RosterEntry): void;
  stop(e: RosterEntry, merged?: boolean): void;
  /** Opens the Deploy sheet: with `prompt` in its box, and `provider` picked (the setup card's first ready agent). */
  deploy(prompt?: string, provider?: AgentProvider): void;
  /** The office answered a merge. */
  merged(msg: Extract<InboxServerMsg, { t: 'inbox.merged' }>): void;
  openBoard(kind: 'issues' | 'pulls'): void;
  openQueue(): void;
  showMission(tab?: MissionTab): void;
  openLabs(): void;
  deps: MissionDeps;
}

export function createActions(net: Net): Actions {
  const merging = new Set<string>();
  /** Selects the agent, going to its project first when it's on another. */
  const show = (id: string, tab: 'terminal' | 'changes') => home.select(id, tab);

  const boardActions = (): BoardActions => ({
    queue: (prompt, title, issue, provider, model, effort) => net.send({ t: 'queue.add', prompt, title, issue, provider, model, effort }),
    assign: (prompt) => openDeploy(net, { prompt }),
    ask: (context) => openDeploy(net, { prompt: `${context}\n\n` }),
    goToDesk: (deskId) => {
      const w = store.workerAtDesk(deskId);
      if (w) show(w.id, 'terminal');
    },
    meeting: (preset) => void lazy.meeting().then((m) => m.openMeeting(net, { openTerminal: (id) => show(id, 'terminal'), openPr: openPrFor }, preset)),
  });

  /** A worker's pull request: its window, GitHub's page, or a new one opened from its branch. */
  function openPrFor(id: string) {
    const w = store.workers.get(id);
    if (!w) return;
    const it = w.pr && store.pulls.items.find((p) => p.number === w.pr!.number);
    if (it) void lazy.pull().then((m) => m.openPull(it, net, boardActions()));
    else if (w.pr) window.open(w.pr.url, '_blank', 'noopener');
    else net.send({ t: 'worker.pr', workerId: id });
  }

  function fixLost(id: string) {
    const w = store.workers.get(id);
    if (!w?.lost || !w.worktree) return;
    const others = [...store.workers.values()].filter((o) => o.lost && o.id !== w.id);
    lostWorktreeDialog({
      name: w.name,
      worktree: w.worktree,
      lost: w.lost,
      workspace: w.repos?.length ? w.worktree.path.replace(/[\\/][^\\/]*$/, '') : undefined,
      others: others.map((o) => o.name),
      rebuild: (all) => net.send({ t: 'worker.rebuild', workerId: w.id, all }),
      sendHome: () => stop(store.rosterEntry(w.id) ?? ({ id: w.id, name: w.name } as RosterEntry)),
    });
  }

  /** Mission control, on `tab` or the one it was last on (kept with this browser's settings). */
  function showMission(tab?: MissionTab) {
    const settings = loadSettings();
    const prefs = { tab: settings.missionTab, save: (t: MissionTab) => ((settings.missionTab = t), saveSettings(settings)) };
    void lazy.mission().then((m) => m.openMissionControl(deps, prefs, tab && MISSION_TABS.includes(tab) ? tab : undefined));
  }

  const deps: MissionDeps = {
    net,
    openTerminal: (id) => show(id, 'terminal'),
    openChanges: (id) => show(id, 'changes'),
    openPr: openPrFor,
    openPull: (number, then) => {
      const it = store.pulls.items.find((p) => p.number === number);
      if (!it) return toast(`PR #${number} isn't on this project's board yet`, 'warn');
      void lazy.pull().then((m) => m.openPull(it, net, boardActions(), then));
    },
    openQueue: () => openQueue(),
    showTab: (tab) => showMission(tab),
    fixLost: (id) => fixLost(id),
    goTo: (floor) => net.send({ t: 'floor.go', floor }),
  };

  function openQueue() {
    void lazy.queue().then((m) => m.openQueue(net, { openTerminal: (id) => show(id, 'terminal') }));
  }

  function merge(e: RosterEntry) {
    if (merging.has(e.id)) return;
    merging.add(e.id);
    home.change();
    net.send({ t: 'inbox.merge', workerId: e.id });
  }

  function sendBack(e: RosterEntry) {
    openPrompt({
      title: `Send back to ${e.name}`,
      subtitle: 'Your note goes to the same agent, which keeps working on the same branch.',
      placeholder: 'What should it change?',
      submitLabel: 'Send back',
      onSubmit: (note) => net.send({ t: 'inbox.sendBack', workerId: e.id, note }),
    });
  }

  function stop(e: RosterEntry, merged = false) {
    const branch = e.branch ? ` Its branch ${e.branch} stays, so nothing it did is lost.` : '';
    if (merged) {
      return confirmDialog(`Archive ${e.name}?`, 'Its work is merged. Its session ends, and its worktree and branch are removed.', 'Archive', () => net.send({ t: 'worker.kill', workerId: e.id, cleanup: 'all' }));
    }
    confirmDialog(`Stop ${e.name}?`, `Its session ends and it leaves the inbox.${branch}`, 'Stop agent', () => net.send({ t: 'worker.kill', workerId: e.id, cleanup: 'keep' }));
  }

  function act(e: RosterEntry, action: RowAction) {
    switch (action) {
      case 'answer':
        home.focusReply = e.id;
        return show(e.id, 'terminal');
      case 'look':
      case 'open':
        return show(e.id, 'terminal');
      case 'review':
      case 'open-pr':
        return show(e.id, 'changes');
      case 'merge':
        return merge(e);
      case 'hand-back':
        return sendBack(e);
      case 'fix-checks':
        if (!e.pr) return show(e.id, 'changes');
        net.send({ t: 'worker.prompt', workerId: e.id, prompt: fixChecksPrompt(e.pr.number) });
        return toast(`Asked ${e.name} to fix the checks on PR #${e.pr.number}`);
      case 'resume':
        net.send({ t: 'worker.resume', workerId: e.id });
        return show(e.id, 'terminal');
      case 'rebuild':
        return onProject(net, e.floor, () => fixLost(e.id));
      case 'send-home':
        return stop(e, e.pr?.state === 'merged');
      case 'give-task':
        return openPrompt({ title: `Give ${e.name} a task`, placeholder: 'What should it do?', onSubmit: (text) => net.send({ t: 'worker.prompt', workerId: e.id, prompt: text }) });
      default:
        return show(e.id, 'terminal');
    }
  }

  return {
    act,
    remind: (r) => runReminder(deps, r),
    reminderLabel: reminderAction,
    merge,
    merging,
    sendBack,
    stop,
    deploy: (prompt, provider) => openDeploy(net, { prompt, provider, started: (at) => (home.deployedAt = at) }),
    merged(msg) {
      merging.delete(msg.workerId);
      if (msg.error) {
        toast(msg.error, 'warn');
        return home.change();
      }
      // The office tells everyone who merged what; this page moves on to the next thing. The first
      // merge in this browser is worth saying once, with how long the loop took.
      if (home.firstMerge()) {
        const first = Math.min(...store.roster.map((e) => e.createdAt), Date.now());
        toast(`First change merged, ${waitWords(Date.now() - first)} after your first agent started. It's in Shipped today.`);
      }
      home.check('merge');
      // On to the next thing that needs you, so Enter keeps the loop going.
      const next = nextUp(currentView(), msg.workerId);
      // Nothing next: the pane rests on "nothing needs you" until something new arrives, rather than
      // opening the change just merged again while it's still leaving To review.
      if (!next) home.held = true;
      home.select(next?.id, next ? (next.status === 'needs_input' ? 'terminal' : 'changes') : undefined);
    },
    openBoard: (kind) => void lazy.boards().then((m) => m.openBoard(kind, net, boardActions())),
    openQueue,
    showMission,
    openLabs: () => void lazy.labs().then((m) => m.openLabs(net)),
    deps,
  };
}
