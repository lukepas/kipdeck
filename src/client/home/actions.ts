// What the inbox's buttons do, the same from a row, the pane's header and the keyboard: answer, review,
// merge, send back, fix checks, resume, stop and archive. The windows behind them that the home page
// doesn't draw itself (a pull request, the boards, the queue, Mission control) load when first wanted.

import { firstMergeLine } from '../../shared/warm';
import { nextTab, nextUp, shippedToday, type RowAction } from '../../shared/inbox';
import type { InboxServerMsg, Reminder, RosterEntry } from '../../shared/protocol';
import type { AgentProvider } from '../../shared/providers';
import type { Net } from '../net';
import { loadSettings, MISSION_TABS, saveSettings, store, type MissionTab } from '../state';
import { toast } from '../ui/dom';
import type { BoardActions } from '../ui/github/prompts';
import type { MissionDeps } from '../ui/mission/act';
import { reminderAction } from '../../shared/reminders';
import { restackPrompt } from '../../shared/landqueue';
import { clearComments, commentsNote } from './brief';
import { quiet } from './warm';
import type { openDeploy as OpenDeploy } from './deploy';
import { onProject } from './on-project';
import * as lazy from './lazy';
import { currentView, entryRef, entryTitle } from './list';
import { agentRef } from '../../shared/agentname';
import { holdMerge, isHeld, mergeLanded, undoMerge } from './merge-hold';
import { home } from './state';

/** The prompt Fix checks sends: the agent looks the failures up itself. */
export const fixChecksPrompt = (pr: number) => `The checks on pull request #${pr} are failing. Run \`gh pr checks ${pr}\`, find out why, fix it and push.`;

export interface Actions {
  act(e: RosterEntry, action: RowAction): void;
  remind(r: Reminder): void;
  reminderLabel(r: Reminder): string;
  /** Merge, after a hold with Undo (merge-hold.ts). */
  merge(e: RosterEntry): void;
  /** Takes a held merge back before it's sent. */
  undoMerge(id: string): void;
  /** Whether a merge is held for its Undo. */
  held(id: string): boolean;
  /** Agents whose merge is under way. */
  merging: Set<string>;
  /** Send back with a note; `initial` starts the box (Restack's rebase prompt). */
  sendBack(e: RosterEntry, initial?: string): void;
  stop(e: RosterEntry, merged?: boolean): void;
  /** Opens the Deploy sheet: with `prompt` in its box, `provider` picked (the setup card's first ready agent), and on project `floor`. */
  deploy(prompt?: string, provider?: AgentProvider, floor?: string): void;
  /** The office answered a merge. */
  merged(msg: Extract<InboxServerMsg, { t: 'inbox.merged' }>): void;
  openBoard(kind: 'issues' | 'pulls'): void;
  openQueue(): void;
  showMission(tab?: MissionTab): void;
  openLabs(): void;
  deps: MissionDeps;
}

export function createActions(net: Net): Actions {
  /**
   * The Deploy sheet, kept out of the first load (home/lazy.ts) but fetched once the page is idle, so
   * N opens it at once: while it loads, the job you type straight after N would reach the inbox's own
   * keys (D, J, K, Enter, another N) instead. Asked for again while it loads, it opens once.
   */
  let deployMod: Awaited<ReturnType<typeof lazy.deploy>> | undefined;
  let deployAsked = false;
  const loadDeploy = () => lazy.deploy().then((m) => (deployMod = m));
  const idle = (window as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 500));
  idle(() => void loadDeploy().catch(() => {}));
  const openDeploy = (n: Net, opts: Parameters<typeof OpenDeploy>[1]) => {
    if (deployMod) return deployMod.openDeploy(n, opts);
    if (deployAsked) return;
    deployAsked = true;
    void loadDeploy()
      .then((m) => m.openDeploy(n, opts))
      .finally(() => (deployAsked = false));
  };
  /**
   * Opens one of the confirm or note dialogs (Stop, Archive, Send back, Give a task, a lost worktree),
   * loaded the first time one is wanted. A second click while that load is under way opens nothing:
   * without this, each click queues its own dialog, and confirming both would stop the agent or send
   * the task twice. The Deploy sheet has its own guard, above.
   */
  let asking = false;
  const ask = (open: (m: Awaited<ReturnType<typeof lazy.prompt>>) => void) => {
    if (asking) return;
    asking = true;
    void lazy
      .prompt()
      .then(open)
      .finally(() => (asking = false));
  };
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
    const { lost, worktree } = w;
    const others = [...store.workers.values()].filter((o) => o.lost && o.id !== w.id);
    ask(({ lostWorktreeDialog }) => lostWorktreeDialog({
      name: agentRef(w),
      worktree,
      lost,
      workspace: w.repos?.length ? worktree.path.replace(/[\\/][^\\/]*$/, '') : undefined,
      others: others.map((o) => agentRef(o)),
      rebuild: (all) => net.send({ t: 'worker.rebuild', workerId: w.id, all }),
      sendHome: () => stop(store.rosterEntry(w.id) ?? ({ id: w.id, name: w.name, kind: w.kind, provider: w.provider, task: w.task, floor: store.floor } as RosterEntry)),
    }));
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
    if (merging.has(e.id) || isHeld(e.id)) return;
    holdMerge(
      e,
      entryTitle(e),
      () => {
        merging.add(e.id);
        net.send({ t: 'inbox.merge', workerId: e.id });
      },
      () => home.change(),
    );
    // The review bar was drawn again with Undo where Merge was: the keyboard goes there, so Enter or
    // Space takes it back (Esc and u do too, keys.ts).
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.pane .rv-undo')?.focus());
  }

  function undo(id: string) {
    undoMerge(id, () => home.change());
    // Merge is back where Undo was; the keyboard stays on it rather than falling to the page.
    requestAnimationFrame(() => {
      if (!document.activeElement || document.activeElement === document.body) document.querySelector<HTMLElement>('.pane .rv-merge')?.focus();
    });
  }

  function sendBack(e: RosterEntry, initial?: string) {
    ask(({ openPrompt }) => openPrompt({
      title: initial ? `Restack ${entryRef(e)}` : `Send back to ${entryRef(e)}`,
      subtitle: initial ? 'It rebases its branch onto the branch it merges into. Change the note first if you like.' : 'Your note goes to the same agent, which keeps working on the same branch.',
      placeholder: 'What should it change?',
      submitLabel: initial ? 'Send restack' : 'Send back',
      // The line comments left on its diff go with it, anchored (brief/comments.ts).
      initial: [initial, commentsNote(e.id)].filter(Boolean).join('\n\n') || undefined,
      onSubmit: (note) => {
        net.send({ t: 'inbox.sendBack', workerId: e.id, note });
        clearComments(e.id);
      },
    }));
  }

  function stop(e: RosterEntry, merged = false) {
    const branch = e.branch ? ` Its branch ${e.branch} stays, so nothing it did is lost.` : '';
    if (merged) {
      return ask(({ confirmDialog }) => confirmDialog(`Archive ${entryRef(e)}?`, 'Its work is merged. Its session ends, and its worktree and branch are removed.', 'Archive', () => net.send({ t: 'worker.kill', workerId: e.id, cleanup: 'all' })));
    }
    ask(({ confirmDialog }) => confirmDialog(`Stop ${entryRef(e)}?`, `Its session ends and it leaves the inbox.${branch}`, 'Stop agent', () => net.send({ t: 'worker.kill', workerId: e.id, cleanup: 'keep' })));
  }

  function act(e: RosterEntry, action: RowAction) {
    switch (action) {
      case 'answer':
        home.focusReply = e.id;
        return show(e.id, 'terminal');
      case 'look':
      case 'open':
        return show(e.id, 'terminal');
      // Merge from a row or a key is a review: only the review bar's Merge button merges (merge-hold.ts).
      case 'review':
      case 'open-pr':
      case 'merge':
        return show(e.id, 'changes');
      case 'hand-back':
        return sendBack(e);
      // Conflicts with its base: the same Send back, with a rebase prompt to edit (shared/landqueue.ts).
      case 'restack':
        return sendBack(e, restackPrompt(e));
      case 'fix-checks':
        if (!e.pr) return show(e.id, 'changes');
        net.send({ t: 'worker.prompt', workerId: e.id, prompt: fixChecksPrompt(e.pr.number) });
        return toast(`Asked ${entryRef(e)} to fix the checks on PR #${e.pr.number}`);
      case 'unpause':
        return net.send({ t: 'spend.resume', workerIds: [e.id] });
      case 'resume':
        net.send({ t: 'worker.resume', workerId: e.id });
        return show(e.id, 'terminal');
      case 'rebuild':
        return onProject(net, e.floor, () => fixLost(e.id));
      case 'send-home':
        return stop(e, e.pr?.state === 'merged');
      case 'give-task':
        return ask(({ openPrompt }) => openPrompt({ title: `Give ${entryRef(e)} a task`, placeholder: "What's the job?", onSubmit: (text) => net.send({ t: 'worker.prompt', workerId: e.id, prompt: text }) }));
      default:
        return show(e.id, 'terminal');
    }
  }

  return {
    act,
    remind: (r) => void lazy.missionAct().then((m) => m.runReminder(deps, r)),
    reminderLabel: reminderAction,
    merge,
    undoMerge: undo,
    held: isHeld,
    merging,
    sendBack,
    stop,
    deploy: (prompt, provider, floor) => openDeploy(net, { prompt, provider, floor, started: (at) => (home.deployedAt = at) }),
    merged(msg) {
      merging.delete(msg.workerId);
      if (msg.error) {
        if (!mergeLanded(msg.workerId, msg)) toast(msg.error, 'warn');
        return home.change();
      }
      // The office tells everyone who merged what; this page's hold toast says it landed and moves on
      // to the next thing. The first merge in this browser says so once, in one short sentence; any
      // other says how many are on today's tape, and only while nothing needs you.
      const isQuiet = quiet();
      const first = home.firstMerge();
      const today = shippedToday(home.records, Date.now());
      const onTape = today.length + (msg.record && !today.some((r) => r.id === msg.record?.id) ? 1 : 0);
      const entry = store.rosterEntry(msg.workerId);
      const task = msg.record?.task ?? (entry ? entryTitle(entry) : 'Agent work');
      const landed = mergeLanded(msg.workerId, msg, { first, onTape, quiet: isQuiet }) ?? (first ? toast(firstMergeLine(task, isQuiet)) : undefined);
      // Kip cheers in its icon slot and the tuft hops, only while nobody waits on you (kip-moments.ts).
      void lazy.kipMoments().then((k) => k.celebrate(landed));
      home.check('merge');
      // On to the next thing that needs you.
      const next = nextUp(currentView(), msg.workerId);
      // Nothing next: the pane rests on "nothing needs you" until something new arrives, rather than
      // opening the change just merged again while it's still leaving To review.
      if (!next) home.held = true;
      home.select(next?.id, next ? nextTab(next) : undefined);
    },
    openBoard: (kind) => void lazy.boards().then((m) => m.openBoard(kind, net, boardActions())),
    openQueue,
    showMission,
    openLabs: () => void lazy.labs().then((m) => m.openLabs(net)),
    deps,
  };
}
