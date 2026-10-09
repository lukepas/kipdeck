// The right pane: the selected agent. Its header says the task, the agent and model, how long it has
// worked, and carries Stop and the row's primary action again. Under it, three tabs: Terminal (live,
// with the question card over it while it asks something), Changes (the diff, its checks and pull
// request, the branch it merges into, Merge and Send back) and Log (what happened to it). On a wide
// screen it is never empty while something waits: with nothing selected, the oldest that needs you
// (or is ready to review) opens by itself. With nobody waiting it says so, with the day so far.
// On a phone the pane covers the list, with a Back button.

import { attention, duration } from '../../shared/attention';
import { intoWords, mergeWords, nextUp, rowAction, sectionOf } from '../../shared/inbox';
import { todayPulse } from '../../shared/metrics';
import { waitWords } from '../../shared/wait';
import type { RosterEntry, ServerMsg, TimelineEvent } from '../../shared/protocol';
import { PROVIDER_META } from '../../shared/providers';
import type { Net } from '../net';
import { store } from '../state';
import { h } from '../ui/dom';
import { icon } from '../ui/icons';
import { modelBadge } from '../ui/provider';
import type { Actions } from './actions';
import { onProject } from './deploy';
import * as lazy from './lazy';
import { agentMark, currentView, entryTitle, waitingNow, whereLabel } from './list';
import { questionCard } from './question';
import { preview } from './preview';
import { home, type PaneTab } from './state';

/** Wide enough for the list and the pane side by side (lite.css). */
const wide = () => matchMedia('(min-width: 900px)').matches;

const TABS: { id: PaneTab; label: string }[] = [
  { id: 'terminal', label: 'Terminal' },
  { id: 'changes', label: 'Changes' },
  { id: 'log', label: 'Log' },
];

/** Each project's timeline as the Log tab asked for it, by floor, newest first. */
const timelines = new Map<string, TimelineEvent[]>();
let logChanged: () => void = () => {};

/** The pane's share of the server's messages: a project's timeline, and what happens on it now. */
export function paneMessage(msg: ServerMsg) {
  if (msg.t === 'timeline' && msg.floor !== undefined && msg.before === undefined && msg.since === undefined) {
    timelines.set(msg.floor, msg.events);
    logChanged();
  } else if (msg.t === 'timeline.event') {
    const list = timelines.get(msg.event.floor);
    if (list && !list.some((e) => e.id === msg.event.id)) {
      timelines.set(msg.event.floor, [msg.event, ...list]);
      logChanged();
    }
  }
}

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** "4 files · +86 -12 · 2 commits", from what the office last saw it change. */
function workLine(e: RosterEntry): string {
  const w = e.work;
  if (!w) return '';
  return [`${w.files} file${w.files === 1 ? '' : 's'}`, `+${w.additions} -${w.deletions}`, w.ahead ? `${w.ahead} commit${w.ahead === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
}

const CHECKS: Record<string, string> = { pass: 'checks passing', fail: 'checks failing', pending: 'checks running', none: 'no checks' };
const REVIEW: Record<string, string> = { approved: 'approved', changes: 'changes requested', required: 'review required' };

/** "3 agents working, 1 merged today, median wait 32s today": the day so far, for the calm pane. */
export function daySoFar(working: number, merged: number, medianWaitMs: number | undefined): string {
  const parts = [working ? `${working} agent${working === 1 ? '' : 's'} working` : 'no agent working', `${merged} merged today`];
  if (medianWaitMs !== undefined) parts.push(`median wait ${waitWords(medianWaitMs)} today`);
  const s = parts.join(', ');
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}

/** When the last one waiting on you was dealt with, so the cleared queue is marked once, just then. */
let clearedAt = 0;

/** The pane with nothing selected: what's waiting and one button to start on it, or, with nobody waiting, the day so far. */
function emptyState(actions: Actions): HTMLElement {
  const keys = h('p.pe-keys', {}, h('kbd', {}, 'Up'), h('kbd', {}, 'Down'), ' to move · ', h('kbd', {}, 'Enter'), ' to open · ', h('kbd', {}, '?'), ' for help');
  if (!store.roster.length) return preview();
  const view = currentView();
  const next = nextUp(view);
  const n = view.counts;
  if (!n['needs-you'] && !n.review) {
    // Cleared just now: the check draws itself in, once (under reduced motion it is simply there).
    const earned = clearedAt > 0 && Date.now() - clearedAt < 1_500;
    clearedAt = 0;
    const records = home.project ? home.records.filter((r) => r.floor === home.project) : home.records;
    const day = todayPulse(records, waitingNow(view), Date.now());
    return h(
      'div.pe.calm',
      { class: earned ? 'earned' : '' },
      h('span.pe-ok', {}, icon('check', 20)),
      h('h2', {}, 'Nobody waiting'),
      h('p', {}, daySoFar(n.working, day.merged, day.medianWaitMs)),
      h('button.btn', { type: 'button', onclick: () => actions.deploy() }, icon('plus', 16), 'Deploy agent'),
      keys,
    );
  }
  const line = n['needs-you'] ? `${n['needs-you']} agent${n['needs-you'] === 1 ? ' needs' : 's need'} you` : `${n.review} change${n.review === 1 ? '' : 's'} to review`;
  const sub = n.working ? `${n.working} agent${n.working === 1 ? ' is' : 's are'} working.` : 'No agent is working right now.';
  return h(
    'div.pe',
    {},
    h('h2', {}, line),
    h('p', {}, sub),
    next ? h(n['needs-you'] ? 'button.btn.primary.needs-you' : 'button.btn.primary', { type: 'button', 'data-id': next.id, onclick: () => home.select(next.id, next.status === 'needs_input' ? 'terminal' : 'changes') }, n['needs-you'] ? 'Start with the oldest' : 'Review the oldest') : null,
    keys,
  );
}

export function installPane(root: HTMLElement, net: Net, actions: Actions) {
  const back = h('button.btn.pane-back', { type: 'button', onclick: () => home.select(undefined), 'aria-label': 'Back to the inbox' }, icon('back', 16), 'Inbox');
  const head = h('header.pane-h');
  const tabs = h('nav.pane-tabs', { role: 'tablist', 'aria-label': 'Agent' });
  const review = h('div.pane-review');
  const card = questionCard(net);
  const body = h('div.pane-body');
  const empty = h('div.pane-empty');
  root.replaceChildren(empty, back, head, tabs, review, card.el, body);

  /** What the body shows now, so a re-render only remounts when that changes. */
  let mounted: { id: string; tab: PaneTab } | null = null;
  let going: string | undefined;

  const unmount = async () => {
    if (mounted?.tab === 'terminal') (await lazy.terminal()).closeTerminal();
    if (mounted?.tab === 'changes') (await lazy.changes()).closeChanges();
    mounted = null;
    body.replaceChildren();
  };

  const renderLog = (e: RosterEntry) => {
    const events = (timelines.get(e.floor) ?? []).filter((ev) => ev.worker === e.id);
    const ships = home.records.filter((r) => r.workerId === e.id);
    const rows = [
      ...events.map((ev) => ({ at: ev.at, text: ev.text })),
      ...ships.map((r) => ({ at: r.at, text: r.kind === 'merged' ? `${r.reviewer} merged it${r.pr ? ` (PR #${r.pr.number})` : r.commit ? ` (${r.commit.slice(0, 7)})` : ''}` : `${r.reviewer} sent it back: ${r.note ?? ''}` })),
      { at: e.createdAt, text: `Deployed on ${e.floorName}` },
    ].sort((a, b) => b.at - a.at);
    body.replaceChildren(h('ol.pane-log', { 'aria-label': 'Log' }, ...rows.map((r) => h('li', {}, h('time', {}, clock(r.at)), h('span', {}, r.text)))));
  };

  const mount = async (e: RosterEntry, tab: PaneTab) => {
    const want = { id: e.id, tab };
    if (mounted && mounted.id === want.id && mounted.tab === want.tab) return;
    if (mounted && mounted.tab !== tab) await unmount();
    if (tab === 'log') {
      mounted = want;
      net.send({ t: 'timeline.get', floor: e.floor });
      logChanged = () => mounted?.tab === 'log' && mounted.id === e.id && renderLog(store.rosterEntry(e.id) ?? e);
      return renderLog(e);
    }
    if (!store.workers.has(e.id)) return;
    if (tab === 'terminal') {
      const t = await lazy.terminal();
      if (home.selected !== e.id || home.tab !== 'terminal') return;
      t.openTerminal(net, e.id, undefined, undefined, { keypad: true, dock: body });
      if (t.openTerminalFor() !== e.id) return;
      mounted = want;
      // One that's asking: the question card's box takes the cursor instead (question.ts).
      if (home.focusReply === e.id && e.status !== 'needs_input') {
        home.focusReply = undefined;
        setTimeout(() => t.focusTerminalReply(e.id), 80);
      }
    } else {
      const c = await lazy.changes();
      if (home.selected !== e.id || home.tab !== 'changes') return;
      c.openChanges(net, e.id, undefined, undefined, { dock: body });
      if (c.openChangesFor()?.workerId === e.id) mounted = want;
    }
  };

  const reviewBar = (e: RosterEntry) => {
    const pr = e.pr;
    const merging = actions.merging.has(e.id);
    const held = actions.held(e.id);
    const merged = pr?.state === 'merged';
    const facts = [merged ? '' : `into ${intoWords(e)}`, workLine(e), pr ? [`PR #${pr.number}`, merged ? 'merged' : CHECKS[pr.checks ?? 'none'], pr.review ? REVIEW[pr.review] : '', pr.conflicting ? 'conflicts' : ''].filter(Boolean).join(' · ') : ''].filter(Boolean);
    // With a GitHub repository and no pull request yet, the pull request comes first: Open PR is the
    // primary, and merging the branch here without one is the second choice.
    const prFirst = !pr && !!e.work && e.work.ahead > 0 && !!store.floors.find((f) => f.id === e.floor)?.repo;
    const mergeLabel = merging ? 'Merging...' : pr ? `Merge PR #${pr.number}` : prFirst ? 'Merge locally' : 'Merge';
    // Drawn again on every roster tick: the button with the focus keeps it (Merge becomes Undo merge
    // in the same place), so the keyboard never falls back to the page.
    const focused = [...review.querySelectorAll('button')].indexOf(document.activeElement as HTMLButtonElement);
    review.replaceChildren(
      h('div.rv-facts', {}, ...(facts.length ? facts.map((f, i) => h('span', { class: i === 0 && !merged ? 'rv-into' : undefined }, f)) : [h('span', {}, 'What it changed shows below.')])),
      merged
        ? h('div.rv-acts', {}, h('button.btn', { type: 'button', onclick: () => actions.stop(e, true) }, 'Archive'))
        : h(
            'div.rv-acts',
            {},
            h('button.btn', { type: 'button', onclick: () => actions.sendBack(e) }, 'Send back'),
            held
              ? h('button.btn.primary.rv-merge.rv-undo', { type: 'button', onclick: () => actions.undoMerge(e.id) }, 'Undo merge')
              : h(prFirst ? 'button.btn.rv-merge' : 'button.btn.primary.rv-merge', { type: 'button', disabled: merging, title: mergeWords(e), onclick: () => actions.merge(e) }, mergeLabel),
            prFirst && !held ? h('button.btn.primary.rv-open-pr', { type: 'button', title: 'Push its branch and open a pull request on GitHub', onclick: () => net.send({ t: 'worker.pr', workerId: e.id }) }, 'Open PR') : null,
          ),
    );
    if (focused >= 0) review.querySelectorAll('button')[focused]?.focus();
  };

  const header = (e: RosterEntry) => {
    const att = attention(e, Date.now());
    const { action, label } = rowAction(att);
    const worked = (e.workedMs ?? 0) + (e.workingSince ? Date.now() - e.workingSince : 0);
    const agent = e.provider ? (PROVIDER_META[e.provider]?.label ?? e.provider) : 'Shell';
    const model = e.kind === 'agent' ? modelBadge(e.provider, e.model, undefined) : '';
    const asleep = e.status === 'exited' || e.status === 'offline';
    head.replaceChildren(
      agentMark(e.provider, e.kind),
      h(
        'div.pane-title',
        {},
        h('h2', {}, entryTitle(e)),
        h('p', {}, [e.name, agent, model, worked > 60_000 ? `worked ${duration(worked)}` : '', whereLabel(e)].filter(Boolean).join(' · ')),
      ),
      h(
        'div.pane-acts',
        {},
        asleep ? null : h('button.btn.quiet.pane-stop', { type: 'button', title: 'End its session; its branch stays', onclick: () => actions.stop(e) }, 'Stop'),
        // The row's action again, unless it's only "open this", which the pane already is, or Answer,
        // which the question card under the tabs is.
        action === 'open' || action === 'look' || (action === 'answer' && home.tab === 'terminal') || (home.tab === 'changes' && (action === 'review' || action === 'merge' || action === 'hand-back')) ? null : h('button.btn.pane-primary', { type: 'button', class: sectionOf(att) === 'needs-you' ? 'act' : '', onclick: () => actions.act(e, action) }, label),
      ),
    );
    tabs.replaceChildren(
      ...TABS.map((t) =>
        h('button.pane-tab', { type: 'button', role: 'tab', 'aria-selected': String(home.tab === t.id), class: home.tab === t.id ? 'on' : '', onclick: () => home.select(e.id, t.id) }, t.label, t.id === 'changes' && e.work?.files ? h('span.tab-n', {}, String(e.work.files)) : null),
      ),
    );
  };

  let plan: HTMLElement | undefined;
  const showPlan = async () => {
    if (!plan) {
      plan = h('div.lite-plot');
      const { mountLitePlot } = await import('../lite-plot');
      mountLitePlot(plan, (id) => home.select(id, 'terminal'));
    }
    if (plan.parentElement !== empty) {
      delete empty.dataset.key;
      empty.replaceChildren(plan);
    }
  };

  /** The agents last seen waiting on you, so one that newly does opens again after an Esc or a merge. */
  let waitingIds = new Set<string>();
  /** With nothing selected on a wide screen: the oldest that needs you, else the oldest to review. */
  const autoOpen = (): boolean => {
    const view = currentView();
    const now = new Set([...view.sections['needs-you'], ...view.sections.review].map((r) => r.entry.id));
    if ([...now].some((id) => !waitingIds.has(id))) home.held = false;
    if (waitingIds.size && !now.size) clearedAt = Date.now();
    waitingIds = now;
    if (!wide() || home.held || home.selected) return false;
    const next = nextUp(view);
    if (!next) return false;
    home.select(next.id, next.status === 'needs_input' ? 'terminal' : 'changes');
    return true;
  };

  /** The selected agent's status last time, so its finishing turns the pane to what it changed. */
  let lastStatus: { id: string; status: string } | undefined;
  /** It finished while watched; the switch waits for the office to say what it changed. */
  let finished: string | undefined;

  const render = () => {
    // Selecting one renders the pane again (home.change), so this pass has nothing left to do.
    if (autoOpen()) return;
    const e = home.selected ? store.rosterEntry(home.selected) : undefined;
    // The agent you're watching finished: its diff is the next thing to look at (once there is one,
    // and not while you're typing in its terminal).
    const was = lastStatus;
    lastStatus = e ? { id: e.id, status: e.status } : undefined;
    if (e && was?.id === e.id && was.status !== e.status && e.status === 'done') finished = e.id;
    if (finished && (!e || e.id !== finished || e.status !== 'done' || home.tab !== 'terminal')) finished = undefined;
    if (e && finished === e.id && e.work?.files && !document.activeElement?.closest('.xterm')) {
      finished = undefined;
      home.select(e.id, 'changes');
      return;
    }
    card.show(e);
    root.classList.toggle('has-agent', !!e);
    document.body.classList.toggle('pane-open', home.paneOpen && !!e);
    if (!e) {
      if (home.selected && !store.rosterEntry(home.selected)) home.selected = undefined;
      // With Bridge view on in Labs, the project's deck plan fills the empty pane (loaded only then).
      if (store.lab('bridge')) void showPlan();
      else {
        // Drawn again only when what it says changes, so a roster tick doesn't restart the cleared check.
        const next = emptyState(actions);
        const key = next.outerHTML.replace(/ earned/, '');
        if (empty.dataset.key !== key || !empty.firstElementChild) {
          empty.dataset.key = key;
          empty.replaceChildren(next);
        }
      }
      void unmount();
      return;
    }
    header(e);
    review.classList.toggle('hidden', home.tab !== 'changes' || e.kind !== 'agent');
    if (home.tab === 'changes') reviewBar(e);
    // On another project: go there first, then the terminal and changes can be followed.
    if (e.floor !== store.floor) {
      if (going !== e.floor) {
        going = e.floor;
        body.replaceChildren(h('p.pane-wait', {}, `Opening ${e.floorName}...`));
        mounted = null;
        onProject(net, e.floor, () => {
          going = undefined;
          render();
        });
      }
      return;
    }
    void mount(e, home.tab);
  };

  home.on(render);
  for (const t of ['roster', 'workers', 'floor', 'labs'] as const) store.on(t, render);
  render();
}
