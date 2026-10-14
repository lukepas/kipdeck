// The inbox at /: puts its parts together on the page lite.ts set up. The top bar (the demo's pill, the
// project picker, Mine or Team, search, today's pulse, Deploy agent and the avatar menu), the list on
// the left with Signal's chip over it (signal.ts) and the checklist and Shipped today under it, the selected agent's pane on the right, the
// keys, and the wait clocks that tick in place (clock.ts).

import { checklistSeen, nextUp } from '../../shared/inbox';
import { waitWords } from '../../shared/wait';
import { LAB_IDS } from '../../shared/labs';
import type { ServerMsg } from '../../shared/protocol';
import type { Net } from '../net';
import { store } from '../state';
import { $, h } from '../ui/dom';
import { icon } from '../ui/icons';
import { digestCard, recallDigest, watchAway } from '../ui/mission/away';
import type { DesktopNotifier } from '../notify';
import type { Settings } from '../state';
import { applyLight, toggleLight } from '../lite-theme';
import { createActions, type Actions } from './actions';
import { startClocks, tickClocks } from './clock';
import { installKeys, openHelp, openTriage } from './keys';
import * as lazy from './lazy';
import { rewatch, routeLazy } from './lazy';
import { currentView, renderList } from './list';
import { closeMenu, menuOpen, toggleMenu, type MenuEntry } from './menu';
import { renderOwner } from './owner';
import { installPane, paneMessage } from './pane';
import { installProposals } from './proposals';
import { installYourCall, yourCallCommands } from './yourcall';
import { openPalette, type Command } from './palette';
import { renderChecklist, renderShipped } from './shipped';
import { renderPulse } from './pulse';
import { installSignal, signalView } from './signal';
import { deckCommands, deckMenuEntry } from './deck-link';
import { markChanges } from './motion';
import { askSetup, firstRunCard, onSetupChange, setupMessage } from './setup';
import { demoMessage } from './demo';
import { installSpend, spendMessage, spendUi } from './spend-slot';
import { installPhone, phoneCommands, phoneMenuEntry } from './phone';
import { home } from './state';
import { agentHeading } from '../../shared/agentname';
import { sayAnswered, sayFirstJob, welcomeLine } from './warm';
import '../ui/waitclock.css';
import './home.css';


/** Feeds the inbox the server's messages it reads itself (after the store has taken them in). */
export function homeMessage(net: Net, actions: Actions, msg: ServerMsg) {
  routeLazy(msg);
  paneMessage(msg);
  setupMessage(msg);
  demoMessage(msg, $('demo'));
  spendMessage(msg);
  switch (msg.t) {
    case 'welcome':
      void rewatch(net);
      net.send({ t: 'inbox.log' });
      askSetup(net);
      break;
    case 'inbox.log':
      home.records = msg.records;
      home.key = msg.key;
      home.change();
      break;
    case 'inbox.record':
      home.addRecord(msg.record);
      break;
    case 'inbox.merged':
      actions.merged(msg);
      break;
  }
}

/** Puts the inbox together. `settings` and `notifier` are the page's own (lite.ts), so Settings changes what the notifier reads. */
export function installHome(net: Net, settings: Settings, notifier: DesktopNotifier): Actions {
  const actions = createActions(net);
  const openSettings = () => void lazy.settings().then((m) => m.openHomeSettings({ net, settings, notifier }));
  const openNumbers = () => void lazy.numbers().then((m) => m.openNumbers());
  // Labs > Rundown: the project picked in the top bar, else the first.
  const openRundown = () => void lazy.rundown().then((m) => m.openRundown(net, { floor: home.project || undefined }));
  // Signal: the project's status at one look (the chip over the list, its card).
  const openSignal = () => void lazy.signal().then((m) => m.openSignal({ view: () => signalView(), openRundown: (floor) => void lazy.rundown().then((r) => r.openRundown(net, { floor })), openGoals: () => actions.showMission('goals') }));

  // ---- The top bar ----------------------------------------------------------------------------
  const project = $('project') as HTMLSelectElement;
  const renderProjects = () => {
    const floors = store.floors.filter((f) => !f.cloning);
    project.replaceChildren(h('option', { value: '' }, 'All projects'), ...floors.map((f) => h('option', { value: f.id }, f.name)));
    if (home.project && !floors.some((f) => f.id === home.project)) home.project = '';
    project.value = home.project;
    project.classList.toggle('hidden', floors.length < 2);
  };
  project.addEventListener('change', () => home.setProject(project.value));
  store.on('floors', renderProjects);

  const search = $('search') as HTMLInputElement;
  search.addEventListener('input', () => {
    home.query = search.value;
    home.change();
  });

  $('btn-deploy').prepend(icon('plus', 16));
  $('btn-deploy').addEventListener('click', () => actions.deploy());

  const theme = toggleLight;
  applyLight();

  // The loop's commands first, then the other core windows; the labs last (only while each is on).
  const commands = (): Command[] => [
    { label: 'Deploy agent', hint: 'N', icon: 'plus', run: () => actions.deploy() },
    ...(spendUi()?.spendCommands() ?? []),
    { label: 'Search agents', hint: '/', icon: 'search', run: () => search.focus() },
    { label: 'Triage', hint: 'T: one card at a time, from the keyboard', icon: 'queue', run: () => openTriage(actions) },
    { label: 'Numbers', hint: 'Wait time, merges, merge rate', icon: 'plot', run: openNumbers },
    { label: 'Signal', hint: 'Project status: on track, at risk or off track', icon: 'target', run: openSignal },
    { label: 'While you were away', icon: 'clock', run: () => recallDigest(showDigest) },
    { label: 'Settings', hint: 'Account, agents, notifications', icon: 'settings', run: openSettings },
    { label: 'Light or dark', icon: 'contrast', run: theme },
    ...phoneCommands(),
    { label: 'Help and keys', hint: '?', icon: 'help', run: openHelp },
    ...yourCallCommands(),
    ...(store.lab('rundown') ? [{ label: 'Rundown', hint: "Labs: a project's parts, milestones and decisions", icon: 'overview' as const, run: openRundown }] : []),
    ...(store.lab('boards') ? workCommands() : []),
    ...deckCommands(),
    { label: 'Labs', hint: 'Switch on the Deck, meetings, voice...', icon: 'labs', run: () => actions.openLabs() },
  ];
  const palette = () => openPalette(commands);
  /**
   * The GitHub boards, the queue and Mission control: behind the boards lab. The inbox is the one
   * place work is managed: every agent on every project, filtered by project and by Mine or Team.
   */
  function workCommands(): Command[] {
    return [
      { label: 'Issues', hint: 'Labs: GitHub issues', icon: 'issue', run: () => actions.openBoard('issues') },
      { label: 'Pull requests', hint: 'Labs: GitHub pull requests', icon: 'pull', run: () => actions.openBoard('pulls') },
      { label: 'Task queue', hint: 'Labs: issues and tasks waiting for an agent', icon: 'queue', run: () => actions.openQueue() },
      { label: 'Mission control', hint: 'Labs: every project on one board', icon: 'mission', run: () => actions.showMission() },
    ];
  }

  const avatar = $('btn-avatar');
  const initials = () => (store.profile.name.trim().split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2) || '?');
  const paintAvatar = () => {
    avatar.textContent = initials();
    avatar.title = `${store.profile.name}: menu`;
  };
  avatar.addEventListener('click', () => {
    const open = (n: number) => (n ? String(n) : '');
    // The core rows first; the labs last, under their own heading, with Labs itself to switch them on.
    const boards: MenuEntry[] = store.lab('boards')
      ? [
          { label: 'Issues', icon: 'issue', note: open(store.issues.items.filter((i) => i.state === 'OPEN').length), run: () => actions.openBoard('issues') },
          { label: 'Pull requests', icon: 'pull', note: open(store.pulls.items.filter((p) => p.state === 'OPEN').length), run: () => actions.openBoard('pulls') },
          { label: 'Task queue', icon: 'queue', note: open(store.queue.tasks.filter((t) => t.status !== 'done').length), run: () => actions.openQueue() },
          { label: 'Mission control', icon: 'mission', run: () => actions.showMission() },
        ]
      : [];
    const entries: MenuEntry[] = [
      { label: 'Numbers', icon: 'plot', run: openNumbers },
      { label: 'Signal', icon: 'target', run: openSignal },
      { label: 'Settings', icon: 'settings', run: openSettings },
      phoneMenuEntry(),
      { label: 'Help and keys', icon: 'help', note: '?', run: openHelp },
      { label: 'Sign out', icon: 'logout', run: () => void fetch('/api/logout', { method: 'POST' }).finally(() => location.assign('/login')) },
      { group: 'Labs' },
      ...boards,
      store.lab('rundown') ? { label: 'Rundown', icon: 'overview', run: openRundown } : null,
      deckMenuEntry(),
      { label: 'Labs', icon: 'labs', note: `${LAB_IDS.filter((id) => store.lab(id)).length} on`, run: () => actions.openLabs() },
    ];
    toggleMenu(avatar, store.profile.name, entries);
  });

  // ---- The list, the checklist, Shipped today and the digest ---------------------------------
  const inbox = $('inbox');
  const checklist = $('checklist');
  const shipped = $('shipped');
  const digest = $('digest');
  let digestShown = false;
  const showDigest = () => {
    digestShown = true;
    renderAll();
  };
  const renderDigest = () => {
    const showNext = () => {
      digestShown = false;
      const next = nextUp(currentView());
      home.select(next?.id, next?.status === 'needs_input' ? 'terminal' : 'changes');
    };
    const card = digestShown ? digestCard(showNext, () => ((digestShown = false), renderAll())) : null;
    // Back after a night away, a line over it says so (warm.ts).
    const welcome = card ? welcomeLine(store.away?.since, showNext) : null;
    digest.replaceChildren(...(welcome ? [welcome] : []), ...(card ? [h('ul.digest', {}, card)] : []));
  };
  watchAway(net, showDigest, () => false);

  const renderAll = () => {
    // What the office itself shows done counts for the checklist too.
    const seen = checklistSeen(home.checklist, store.roster, home.records);
    if (seen.deploy !== home.checklist.deploy || seen.merge !== home.checklist.merge) {
      home.checklist = { ...home.checklist, ...seen };
      home.saveChecklist();
      return;
    }
    renderList(inbox, actions, () => firstRunCard(net, (prompt, provider) => actions.deploy(prompt, provider)));
    // The demo shows the loop rather than teaching it: no checklist there.
    renderChecklist(checklist, () => actions.deploy(), !!inbox.querySelector('.first-run') || home.demo);
    // The setup card has the one Deploy button until the first agent.
    $('btn-deploy').classList.toggle('hidden', !!inbox.querySelector('.first-run'));
    // Shipped today shows up with the first merge, not as an empty box before it.
    shipped.classList.toggle('hidden', !home.records.some((r) => r.kind === 'merged'));
    renderShipped(shipped);
    markChanges(inbox, shipped, `${home.project}|${home.owner}|${home.query}|${home.idleOpen}`);
    renderPulse([$('pulse'), $('pulse-list')], openNumbers);
    renderOwner($('owner'));
    renderDigest();
    paintAvatar();
  };
  home.on(renderAll);
  onSetupChange(renderAll);
  for (const t of ['roster', 'reminders', 'floors', 'labs', 'workers', 'gate', 'spend'] as const) store.on(t, renderAll);
  // The wait clocks tick each second in place; the rest (the wait bars, the idle times) every 30.
  setInterval(renderAll, 30_000);
  startClocks();

  // A new agent this page just asked for: select it as it arrives.
  store.on('roster', () => {
    if (!home.deployedAt) return;
    const mine = store.roster.filter((e) => e.createdAt >= home.deployedAt - 5_000).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!mine) return;
    home.deployedAt = 0;
    home.select(mine.id, 'terminal');
    // The very first job this browser gave out, with nothing else on the roster: said once (warm.ts).
    if (store.roster.length === 1) sayFirstJob(agentHeading(mine));
  });

  // Answering a question counts for the checklist, and gets a small settled beat: an agent you typed
  // to stopped needing you and is back at work.
  const was = new Map<string, { status: string; since?: number }>();
  store.on('workers', () => {
    for (const w of store.workers.values()) {
      const before = was.get(w.id);
      was.set(w.id, { status: w.status, since: w.waitingSince });
      if (before?.status === 'needs_input' && w.status !== 'needs_input' && w.lastInput?.by === store.profile.name && Date.now() - w.lastInput.at < 120_000) {
        home.check('answer');
        sayAnswered(w.id, agentHeading(w), before.since ? `It waited on you ${waitWords(w.lastInput.at - before.since)}.` : undefined);
      }
    }
  });

  installPane($('pane'), net, actions);
  installProposals(net);
  installYourCall(net, (prompt, floor) => actions.deploy(prompt, undefined, floor));
  installSpend(net);
  installSignal(net, openSignal);
  installKeys(actions, palette, search);
  installPhone();
  window.addEventListener('blur', () => menuOpen() && closeMenu());
  renderProjects();
  renderAll();
  tickClocks();
  return actions;
}
