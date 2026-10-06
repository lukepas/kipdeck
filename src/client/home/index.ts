// The inbox at /: puts its parts together on the page lite.ts set up. The top bar (the project picker,
// search, Deploy agent and the avatar menu), the list on the left with the checklist over it and
// Shipped today under it, the selected agent's pane on the right, and the keys.

import { checklistSeen, nextUp } from '../../shared/inbox';
import type { ServerMsg } from '../../shared/protocol';
import type { Net } from '../net';
import { loadSettings, saveSettings, store } from '../state';
import { $, h } from '../ui/dom';
import { icon } from '../ui/icons';
import { digestCard, recallDigest, watchAway } from '../ui/mission/digest';
import { askNotifyPermission, notifyPermission } from '../notify';
import { applyLight, isLight, toggleLight } from '../lite-theme';
import { createActions, type Actions } from './actions';
import { installKeys, openKeys } from './keys';
import { rewatch, routeLazy } from './lazy';
import { currentView, renderList } from './list';
import { closeMenu, menuOpen, toggleMenu, type MenuEntry } from './menu';
import { installPane, paneMessage } from './pane';
import { openPalette, type Command } from './palette';
import { renderChecklist, renderShipped } from './shipped';
import { home } from './state';
import './home.css';


/** Feeds the inbox the server's messages it reads itself (after the store has taken them in). */
export function homeMessage(net: Net, actions: Actions, msg: ServerMsg) {
  routeLazy(msg);
  paneMessage(msg);
  switch (msg.t) {
    case 'welcome':
      void rewatch(net);
      net.send({ t: 'inbox.log' });
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

export function installHome(net: Net): Actions {
  const actions = createActions(net);
  const settings = loadSettings();

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

  const commands = (): Command[] => [
    { label: 'Deploy agent', hint: 'N', icon: 'plus', run: () => actions.deploy() },
    { label: 'Search agents', hint: '/', icon: 'search', run: () => search.focus() },
    { label: 'Issues', hint: 'Work', icon: 'issue', run: () => actions.openBoard('issues') },
    { label: 'Pull requests', hint: 'Work', icon: 'pull', run: () => actions.openBoard('pulls') },
    { label: 'Task queue', hint: 'Work', icon: 'queue', run: () => actions.openQueue() },
    { label: 'Mission control', hint: 'Attention and review across projects', icon: 'mission', run: () => actions.showMission() },
    { label: 'While you were away', icon: 'clock', run: () => recallDigest(showDigest) },
    { label: 'Light or dark', icon: 'contrast', run: theme },
    { label: 'Labs', hint: 'Bridge view, meetings, voice...', icon: 'labs', run: () => actions.openLabs() },
    ...(store.lab('bridge') ? [{ label: 'Bridge view', hint: '3D', icon: 'ship' as const, run: () => location.assign('/bridge') }] : []),
    { label: 'Keyboard shortcuts', hint: '?', icon: 'keyboard', run: openKeys },
  ];
  const palette = () => openPalette(commands);

  const avatar = $('btn-avatar');
  const initials = () => (store.profile.name.trim().split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2) || '?');
  const paintAvatar = () => {
    avatar.textContent = initials();
    avatar.title = `${store.profile.name}: menu`;
  };
  avatar.addEventListener('click', () => {
    const notes = notifyPermission();
    const entries: MenuEntry[] = [
      { group: 'Work' },
      { label: 'Issues', icon: 'issue', note: String(store.issues.items.filter((i) => i.state === 'OPEN').length || ''), run: () => actions.openBoard('issues') },
      { label: 'Pull requests', icon: 'pull', note: String(store.pulls.items.filter((p) => p.state === 'OPEN').length || ''), run: () => actions.openBoard('pulls') },
      { label: 'Task queue', icon: 'queue', note: String(store.queue.tasks.filter((t) => t.status !== 'done').length || ''), run: () => actions.openQueue() },
      { label: 'Mission control', icon: 'mission', run: () => actions.showMission() },
      { group: 'You' },
      notes === 'unsupported'
        ? null
        : {
            label: 'Notifications',
            icon: 'bell',
            note: settings.notify && notes === 'granted' ? 'On' : 'Off',
            run: async () => {
              if (notes !== 'granted') {
                settings.notify = true;
                await askNotifyPermission();
              } else settings.notify = !settings.notify;
              saveSettings(settings);
            },
          },
      { label: 'Light or dark', icon: 'contrast', note: isLight() ? 'Light' : 'Dark', run: theme },
      { label: 'Keyboard shortcuts', icon: 'keyboard', note: '?', run: openKeys },
      { label: 'Labs', icon: 'labs', run: () => actions.openLabs() },
      store.lab('bridge') ? { label: 'Bridge view', icon: 'ship', run: () => location.assign('/bridge') } : null,
      { label: 'Sign out', icon: 'logout', run: () => void fetch('/api/logout', { method: 'POST' }).finally(() => location.assign('/login')) },
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
    const card = digestShown
      ? digestCard(
          actions.deps,
          () => {
            digestShown = false;
            const next = nextUp(currentView());
            home.select(next?.id, next?.status === 'needs_input' ? 'terminal' : 'changes');
          },
          () => ((digestShown = false), renderAll()),
        )
      : null;
    digest.replaceChildren(...(card ? [h('ul.digest', {}, card)] : []));
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
    renderList(inbox, actions);
    renderChecklist(checklist, () => actions.deploy(), !!inbox.querySelector('.first-run'));
    // Before the first agent there's nothing to have shipped: the first-run card stands alone.
    shipped.classList.toggle('hidden', !!inbox.querySelector('.first-run') && !home.records.length);
    renderShipped(shipped);
    renderDigest();
    $('to-bridge').classList.toggle('hidden', !store.lab('bridge'));
    paintAvatar();
  };
  home.on(renderAll);
  for (const t of ['roster', 'reminders', 'floors', 'labs', 'workers'] as const) store.on(t, renderAll);
  // "waiting 3m" moves on by itself.
  setInterval(renderAll, 30_000);

  // A new agent this page just asked for: select it as it arrives.
  store.on('roster', () => {
    if (!home.deployedAt) return;
    const mine = store.roster.filter((e) => e.createdAt >= home.deployedAt - 5_000).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!mine) return;
    home.deployedAt = 0;
    home.select(mine.id, 'terminal');
  });

  // Answering a question counts for the checklist: an agent you typed to stopped needing you.
  const was = new Map<string, string>();
  store.on('workers', () => {
    for (const w of store.workers.values()) {
      const before = was.get(w.id);
      was.set(w.id, w.status);
      if (before === 'needs_input' && w.status !== 'needs_input' && w.lastInput?.by === store.profile.name && Date.now() - w.lastInput.at < 120_000) home.check('answer');
    }
  });

  installPane($('pane'), net, actions);
  installKeys(actions, palette, search);
  window.addEventListener('blur', () => menuOpen() && closeMenu());
  renderProjects();
  renderAll();
  return actions;
}
