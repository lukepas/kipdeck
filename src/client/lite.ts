// The 2D view (/lite): the office without the 3D, for a phone or a computer the 3D office is too
// much for. Every worker on the floor and how it's doing, the ones waiting on someone first; its
// terminal, with the keys a phone's keyboard hasn't got and a box to send it a prompt; and the boards
// and the task queue. You're in the office as someone on the 2D view (PeerInfo.lite), not standing
// anywhere in it.

import { Net } from './net';
import { AVATAR_COLORS, loadProfile, loadSettings, saveProfile, saveSettings, store, type MissionTab } from './state';
import { randomLook } from '../shared/avatar';
import { cloneLabel } from '../shared/floors';
import { DESK_BY_ID, nextFreeSeat } from '../shared/layout';
import { isAsleep } from '../shared/status';
import type { AgentEffort, AgentProvider, FloorInfo, RosterEntry, WorkerInfo } from '../shared/protocol';
import type { Attention } from '../shared/attention';
import { $, clip, closeAllModals, doingNow, h, onDoingChange, onModalChange, openModal, readingNow, STATUS_LABEL, timeAgo, toast } from './ui/dom';
import { openTerminal, openTerminalFor, routeTerminalMessage } from './ui/terminal';
import { openChanges, openChangesFor, routeChangesMessage } from './ui/changes';
import { lostWorktreeDialog, openPrompt, routeWorktreeMessage } from './ui/prompt';
import { openBoard } from './ui/boards';
import type { BoardActions } from './ui/github/prompts';
import { openPull, routePullMessage } from './ui/pull';
import { openQueue } from './ui/queue';
import { openAsk } from './ui/ask';
import { openMeeting, type MeetingPreset } from './ui/meeting';
import { openSignIns } from './ui/signins';
import { modelBadge, providerLabel } from './ui/provider';
import { attentionChip, digestCard, openMissionControl, recallDigest, renderStrip, runAction, watchAway, type MissionDeps } from './ui/mission';
import { doingLabel } from './ui/mission/act';
import { linkLabel } from '../shared/mission';
import { watchStuck } from './ui/mission/watch';
import { confirmSendHome } from './ui/sendhome';
import { askNotifyPermission, DesktopNotifier, notifyPermission, waitingOnSomeone } from './notify';
import { repoChoices } from './shared/hiring';
// The tab title counts the workers waiting on someone, on every floor, as the 3D office's does.
import { renderTitle } from './shared/title';

// Sent here because this browser can't draw the 3D office (see noWebGL in core/scene.ts).
if (new URLSearchParams(location.search).get('why') === 'webgl') {
  history.replaceState(null, '', location.pathname);
  toast("This browser can't draw the 3D office (WebGL is off or missing), so here's the 2D view", 'warn');
}

// Your name and color from the 3D office, if this browser has been in it. Nobody sees a character
// of yours from here, so a look is only made up to connect with.
const saved = loadProfile();
store.profile = { name: saved?.name ?? 'Guest', color: saved?.color ?? AVATAR_COLORS[1], look: saved?.look ?? randomLook() };
const net = new Net(() => store.profile, () => null, true);
const settings = loadSettings();
const notifier = new DesktopNotifier(() => settings.notify, (id) => openWorker(id));

/** The server version this page was loaded with. */
let bootVersion = '';

net.onStatus((up) => $('conn').classList.toggle('hidden', up));
net.onMessage((msg) => {
  store.apply(msg);
  routeTerminalMessage(msg);
  routeChangesMessage(msg);
  routePullMessage(msg);
  routeWorktreeMessage(msg);
  switch (msg.t) {
    case 'welcome': {
      // Back from a restart on another version: this page's code is stale, so load the new one.
      if (!bootVersion) bootVersion = msg.version;
      else if (msg.version !== bootVersion) return location.reload();
      // After a reconnect the server has forgotten which terminal we had open, and what we're doing.
      sendDoing(true);
      const openId = openTerminalFor();
      if (openId && store.workers.has(openId)) net.send({ t: 'worker.attach', workerId: openId });
      const watching = openChangesFor();
      if (watching && store.workers.has(watching.workerId)) net.send({ t: 'changes.watch', ...watching });
      break;
    }
    case 'toast':
      toast(msg.text, msg.level);
      break;
    case 'signins.needed':
      openSignIns(net, msg.why);
      break;
    case 'upgrade':
      if (msg.state.phase === 'restarting') {
        net.expectRestart();
        toast('⬆️ The office is restarting on its new version. Back in a minute.');
      }
      break;
  }
});

// ---- The floor you're on ------------------------------------------------------------------------
const floorSelect = $('floor') as HTMLSelectElement;
const floorLabel = (f: FloorInfo) => `${f.name}${f.cloning ? ` (${cloneLabel(f.clone)})` : f.waiting ? ` · 🙋 ${f.waiting}` : ''}`;

function renderFloors() {
  const options = store.floors.map((f) => h('option', { value: f.id, disabled: !!f.cloning }, floorLabel(f)));
  if (!store.floors.length) options.push(h('option', { value: '' }, 'No floors yet'));
  floorSelect.replaceChildren(...options);
  floorSelect.value = store.floor ?? '';
  floorSelect.disabled = store.floors.length < 2;
  const p = store.project;
  const f = store.currentFloor();
  $('floor-meta').textContent = p ? [p.branch && `⎇ ${p.branch}`, f?.repo ?? p.dir, f && `👥 ${f.people} here`].filter(Boolean).join(' · ') : store.floors.length ? '' : 'Add a project from Floors in the 3D office.';
  // Someone waiting on another floor: a way straight there.
  const elsewhere = store.floors.filter((o) => o.id !== store.floor && o.waiting > 0 && !o.cloning);
  const box = $('elsewhere');
  box.classList.toggle('hidden', !elsewhere.length);
  box.replaceChildren(
    ...elsewhere.map((o) =>
      h('button.btn.lite-go', { type: 'button', onclick: () => net.send({ t: 'floor.go', floor: o.id }) }, `🙋 ${o.waiting} waiting on ${o.name}`, h('span', { 'aria-hidden': 'true' }, '→')),
    ),
  );
  renderTitle();
}
floorSelect.addEventListener('change', () => {
  if (floorSelect.value && floorSelect.value !== store.floor) net.send({ t: 'floor.go', floor: floorSelect.value });
});
store.on('floors', renderFloors);
store.on('floor', renderFloors);
store.on('project', renderFloors);

// ---- Workers ------------------------------------------------------------------------------------
/** What each worker was last, to tell when one starts waiting on someone. */
const lastStatus = new Map<string, string>();

/**
 * The workers, most in need of someone first: the building's one ranking (shared/attention.ts), on
 * this floor or, with All floors, on every floor. The board agents (not on the roster) come last.
 */
function renderWorkers() {
  const ranked = store.ranked(settings.allFloors ? undefined : store.floor);
  // Back after a while away: what happened meanwhile, as the first card.
  const digest = digestShown ? digestCard(missionDeps, () => showMission('attention'), () => ((digestShown = false), renderWorkers())) : null;
  const cards = ranked.map((r) => {
    const w = r.entry.floor === store.floor ? store.workers.get(r.entry.id) : undefined;
    return w ? workerCard(w, r.att) : elsewhereCard(r.entry, r.att);
  });
  const listed = new Set(ranked.map((r) => r.entry.id));
  for (const w of [...store.workers.values()].sort((a, b) => a.createdAt - b.createdAt)) if (!listed.has(w.id)) cards.push(workerCard(w));
  const ul = $('workers');
  ul.replaceChildren(...(digest ? [digest] : []), ...cards);
  if (!cards.length) ul.append(h('li.lite-empty', {}, store.project ? 'Nobody is working on this floor. ✨ New task hires someone.' : 'No workers here.'));
  const chip = attentionChip();
  $('waiting-now').textContent = chip.text;
  $('btn-mission').querySelector('.n')!.textContent = chip.total ? String(chip.total) : '';
  $('btn-mission').classList.toggle('reminders', chip.reminders > 0);
  $('btn-mission').title = `Mission control: what needs someone, on every floor, and the floor's goals${chip.reminders ? ` · reminders open: ${chip.reminders}` : ''}`;
  const all = $('all-floors');
  all.setAttribute('aria-pressed', String(settings.allFloors));
  all.classList.toggle('hidden', store.floors.length < 2);
  renderTitle();
}

/** Why it needs someone, for its card, when it does. */
function whyLine(att: Attention | undefined): HTMLElement | null {
  if (!att?.reason || att.snoozed || (att.level !== 'needs-you' && att.level !== 'stuck' && att.level !== 'review')) return null;
  return h('span.lite-why', {}, att.reason);
}

/** A worker on another floor (All floors): what it's for and why it needs someone; a tap rides there and opens it. */
function elsewhereCard(e: RosterEntry, att: Attention): HTMLElement {
  const doing = doingLabel(e);
  return h(
    'li.lite-worker.elsewhere',
    { class: `${e.status} ${att.level}` },
    h(
      'button.lite-card',
      { type: 'button', onclick: () => runAction(missionDeps, e, att.action), 'aria-label': `${e.name} on ${e.floorName}: ${att.reason ?? STATUS_LABEL[e.status] ?? e.status}` },
      h('span.dot', { style: `background:${e.color}` }),
      h('span.lite-info', {}, h('span.lite-name', {}, e.name), whyLine(att), doing ? h('span.lite-now', {}, doing) : null, h('span.lite-sub', {}, h('b', {}, e.floorName), linkLabel(e) ? ` · ${linkLabel(e)}` : '')),
      h('span.lite-state', {}, h('span.pill', { class: e.status }, STATUS_LABEL[e.status] ?? e.status)),
    ),
  );
}

function workerCard(w: WorkerInfo, att?: Attention): HTMLElement {
  const desk = DESK_BY_ID.get(w.deskId);
  const waiting = waitingOnSomeone(w);
  const asleep = isAsleep(w.status);
  const badge = w.kind === 'agent' ? modelBadge(w.provider, w.model, w.effort) : undefined;
  const task = w.task?.name ?? w.title ?? (w.prompt ? clip(w.prompt, 90) : undefined);
  // What it's asking, doing or did, in a line.
  const now = w.lost
    ? '🌿 Its worktree was deleted outside agent-office: open it to fix it'
    : w.status === 'needs_input'
      ? `🙋 ${w.activity ?? 'Waiting on an answer'}`
      : asleep
        ? '💤 Asleep: open it to wake it up'
        : w.status === 'done'
          ? w.task?.summary && `✅ ${w.task.summary}`
          : (w.task?.summary ?? w.activity);
  const sub = [
    w.kind === 'agent' ? `⚙️ ${providerLabel(w.provider, store.project)}${badge ? ` · ${badge}` : ''}` : '🐚 shell',
    desk && (desk.station ? `📌 ${desk.label}` : desk.label),
    w.worktree && `🌿 ${w.worktree.branch}`,
    w.pr && `🔀 PR #${w.pr.number}`,
    w.lastInput && `⌨️ ${w.lastInput.by} ${timeAgo(w.lastInput.at)}`,
    store.rosterEntry(w.id) && linkLabel(store.rosterEntry(w.id)!),
  ].filter(Boolean);
  return h(
    'li.lite-worker',
    { class: `${w.status}${waiting ? ' waiting' : ''}${att?.level === 'stuck' && !att.snoozed ? ' stuck' : ''}` },
    h(
      'button.lite-card',
      { type: 'button', onclick: () => openWorker(w.id), 'aria-label': `${w.name}, ${STATUS_LABEL[w.status] ?? w.status}: open its terminal` },
      h('span.dot', { style: `background:${w.color}` }),
      h(
        'span.lite-info',
        {},
        h('span.lite-name', {}, w.name),
        whyLine(att),
        task ? h('span.lite-task', {}, task) : null,
        now ? h('span.lite-now', {}, now) : null,
        h('span.lite-sub', {}, sub.join(' · ')),
      ),
      h('span.lite-state', {}, h('span.pill', { class: w.status }, STATUS_LABEL[w.status] ?? w.status), waiting && w.waitingSince ? h('small', {}, timeAgo(w.waitingSince)) : null),
    ),
    // One that's asking something is answered in its terminal, where the question is.
    asleep || w.lost || w.status === 'needs_input' ? null : h('button.btn.lite-say', { type: 'button', title: `Send ${w.name} a prompt`, 'aria-label': `Send ${w.name} a prompt`, onclick: () => promptWorker(w.id) }, '✍️'),
  );
}

/** A worker needs input or is done: a notification while you're elsewhere, and a buzz. */
function noticeWorkers() {
  for (const w of store.workers.values()) {
    const before = lastStatus.get(w.id);
    lastStatus.set(w.id, w.status);
    if (before === undefined || before === w.status || !waitingOnSomeone(w)) continue;
    notifier.alert(w);
    if (w.status === 'needs_input') navigator.vibrate?.(200);
  }
  notifier.sync(store.workers);
}

store.on('workers', () => {
  noticeWorkers();
  renderWorkers();
});
store.on('project', renderWorkers);
store.on('roster', renderWorkers);
store.on('reminders', renderWorkers);
// "3m ago" moves on by itself.
setInterval(renderWorkers, 30_000);

/** Its terminal, with the keypad, waking it up first if it's asleep. */
function openWorker(id: string) {
  const w = store.workers.get(id);
  if (!w) return;
  if (w.lost) return fixLostWorktree(w);
  if (isAsleep(w.status)) {
    if (!w.sessionId && w.kind !== 'shell') toast(`${w.name} has no saved session — starting a fresh one`, 'warn');
    net.send({ t: 'worker.resume', workerId: id });
  }
  openTerminal(net, id, () => openChanges(net, id, () => openWorker(id)), undefined, { keypad: true });
}

/** Its worktree was deleted outside agent-office: put it back (everyone's who lost theirs), or send it home. */
function fixLostWorktree(w: WorkerInfo) {
  if (!w.lost || !w.worktree) return;
  const worktree = w.worktree;
  const others = [...store.workers.values()].filter((o) => o.lost && o.id !== w.id);
  lostWorktreeDialog({
    name: w.name,
    worktree,
    lost: w.lost,
    workspace: w.repos?.length ? worktree.path.replace(/[\\/][^\\/]*$/, '') : undefined,
    others: others.map((o) => o.name),
    openTerminal: isAsleep(w.status) ? undefined : () => openTerminal(net, w.id, () => openChanges(net, w.id, () => openWorker(w.id)), undefined, { keypad: true }),
    rebuild: (all) => {
      toast(all ? `Rebuilding ${others.length + 1} worktrees…` : `Rebuilding ${w.name}'s worktree…`);
      net.send({ t: 'worker.rebuild', workerId: w.id, all });
    },
    sendHome: () => confirmSendHome(net, w),
  });
}

function promptWorker(id: string) {
  const w = store.workers.get(id);
  if (!w) return;
  openPrompt({
    title: `✍️ Prompt ${w.name}`,
    subtitle: w.status === 'working' ? `${w.name} is busy, so this waits in its input box until it's done.` : undefined,
    placeholder: 'What should it do next?',
    submitLabel: 'Send',
    onSubmit: (text) => net.send({ t: 'worker.prompt', workerId: id, prompt: text }),
  });
}

// ---- New work: a prompt for a worker who's here, or a new one at a free desk -------------------
function hire(deskId: string, prompt: string, worktree: boolean, provider?: AgentProvider, model?: string, effort?: AgentEffort, repos?: string[], goal?: string) {
  net.send({ t: 'worker.spawn', deskId, prompt, worktree, provider, model, effort, repos: repos?.length ? repos : undefined, goal });
}

function sendToWorker(title: string, text: { context?: string; initial?: string } = {}) {
  if (!store.project) return toast('Pick a floor first', 'warn');
  // The back office's desks too, as far as the floor's built out (see WING).
  const desk = nextFreeSeat((id) => !!store.workerAtDesk(id), store.floorPlan.wing)?.id;
  const awake = [...store.workers.values()].filter((w) => w.kind === 'agent' && !isAsleep(w.status));
  if (!desk && !awake.length) return toast('Every desk and bean bag is taken — send a worker home first', 'warn');
  openAsk({
    title,
    ...text,
    newDesk: desk ? DESK_BY_ID.get(desk)!.label : undefined,
    workers: awake.map((w) => ({ id: w.id, name: w.name, color: w.color, status: w.status })),
    worktreeOption: !!store.project.branch,
    providerOption: true,
    repoOptions: repoChoices(),
    onSubmit: (prompt, to, worktree, provider, model, effort, repos, goal) => {
      if (to) net.send({ t: 'worker.prompt', workerId: to, prompt });
      else if (desk) hire(desk, prompt, worktree, provider, model, effort, repos, goal);
    },
  });
}

// ---- The boards, the queue and the meeting room -------------------------------------------------
function boardActions(): BoardActions {
  return {
    queue: (prompt, title, issue, provider, model, effort) => net.send({ t: 'queue.add', prompt, title, issue, provider, model, effort }),
    assign: (prompt, title) => sendToWorker(`🤖 ${title}`, { initial: prompt }),
    ask: (context, title) => sendToWorker(`✍️ ${title}`, { context }),
    // There's no desk to walk to from here: its terminal instead.
    goToDesk: (deskId) => {
      const w = store.workerAtDesk(deskId);
      if (!w) return;
      closeAllModals();
      openWorker(w.id);
    },
    meeting: (preset) => showMeeting(preset),
  };
}

/** A worker's pull request: its window, GitHub's page, or a new one opened from its branch. */
function openPrFor(id: string) {
  const w = store.workers.get(id);
  if (!w) return;
  const it = w.pr && store.pulls.items.find((p) => p.number === w.pr!.number);
  if (it) openPull(it, net, boardActions());
  else if (w.pr) window.open(w.pr.url, '_blank', 'noopener');
  else net.send({ t: 'worker.pr', workerId: id });
}

function showMeeting(preset?: MeetingPreset) {
  openMeeting(net, { openTerminal: openWorker, openPr: openPrFor }, preset);
}

// ---- Mission control: what needs someone, on every floor (ui/mission, as in the 3D office) -----
const missionDeps: MissionDeps = {
  net,
  openTerminal: openWorker,
  openChanges: (id) => openChanges(net, id, () => openWorker(id)),
  openPr: openPrFor,
  openPull: (number, then) => {
    const it = store.pulls.items.find((p) => p.number === number);
    if (it) openPull(it, net, boardActions(), then);
    else toast(`PR #${number} isn't on this floor's board yet`, 'warn');
  },
  openQueue: () => openQueue(net, { openTerminal: openWorker }),
  showTab: (tab) => showMission(tab),
  fixLost: (id) => {
    const w = store.workers.get(id);
    if (w) fixLostWorktree(w);
  },
  goTo: (floor) => net.send({ t: 'floor.go', floor }),
};
function showMission(tab?: MissionTab) {
  openMissionControl(missionDeps, { tab: settings.missionTab, save: (t) => ((settings.missionTab = t), saveSettings(settings)) }, tab);
}
$('btn-mission').addEventListener('click', () => showMission());
$('all-floors').addEventListener('click', () => {
  settings.allFloors = !settings.allFloors;
  saveSettings(settings);
  renderWorkers();
});
const paintStrip = () => renderStrip($('mission-strip'), (tab) => showMission(tab));
for (const t of ['mission', 'roster', 'floor', 'issues', 'pulls'] as const) store.on(t, paintStrip);
// Back after a while away: the digest as the first card (here it never covers anything, so it shows straight away).
let digestShown = false;
const showDigest = () => {
  digestShown = true;
  renderWorkers();
  window.scrollTo({ top: 0 });
};
watchAway(net, showDigest, () => false);
$('btn-digest').addEventListener('click', () => recallDigest(showDigest));
// Stuck anywhere: a notification while you're away, and a buzz.
watchStuck((e, reason) => {
  notifier.stuck(e, reason, () => runAction(missionDeps, e, 'look'));
  if (e.floor === store.floor) navigator.vibrate?.(200);
});

$('btn-issues').addEventListener('click', () => openBoard('issues', net, boardActions()));
$('btn-pulls').addEventListener('click', () => openBoard('pulls', net, boardActions()));
$('btn-queue').addEventListener('click', () => openQueue(net, { openTerminal: openWorker }));
$('btn-new').addEventListener('click', () => sendToWorker('✨ New task'));

function renderNav() {
  const count = (id: string, n: number) => ($(id).querySelector('.n')!.textContent = n ? String(n) : '');
  count('btn-issues', store.issues.items.filter((i) => i.state === 'OPEN').length);
  count('btn-pulls', store.pulls.items.filter((p) => p.state === 'OPEN').length);
  count('btn-queue', store.queue.tasks.filter((t) => t.status !== 'done').length);
}
store.on('issues', renderNav);
store.on('pulls', renderNav);
store.on('queue', renderNav);

// ---- What you have open, for the others (see PeerInfo.doing) -----------------------------------
let doingSent: string | undefined;
let readingSent = false;
function sendDoing(reconnected = false) {
  if (reconnected) {
    doingSent = undefined;
    readingSent = false;
  }
  const what = doingNow();
  const reading = readingNow();
  if (what === doingSent && reading === readingSent) return;
  doingSent = what;
  readingSent = reading;
  net.send({ t: 'doing', what, reading });
}
onModalChange(() => sendDoing());
onDoingChange(() => sendDoing());

// ---- Notifications ------------------------------------------------------------------------------
// The browser only asks from a tap, so there's a button for it while it hasn't been asked.
const bell = h('button.btn', { type: 'button', title: 'Get a notification when a worker needs input or is done', 'aria-label': 'Turn on notifications' }, '🔔');
bell.addEventListener('click', async () => {
  await askNotifyPermission();
  bell.remove();
});
if (notifyPermission() === 'default' && settings.notify) $('to-3d').before(bell);

// ---- In ----------------------------------------------------------------------------------------
/** Your name, the first time this browser comes in on the shared password. */
function askName(done: (name: string) => void) {
  const input = h('input', { type: 'text', maxlength: 24, placeholder: 'Your name', 'aria-label': 'Your name', autocomplete: 'nickname' }) as HTMLInputElement;
  const form = h(
    'form.modal.lite-name',
    {},
    h('header', {}, h('h2', {}, '👋 Who is it?')),
    h('div.body', {}, h('p', {}, 'Your teammates see this name on what you type and send.'), input),
    h('footer', {}, h('button.btn.primary', { type: 'submit' }, 'Come on in')),
  );
  const modal = openModal(form, { escCloses: false, backdropCloses: false });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return input.focus();
    modal.close();
    done(name);
  });
  setTimeout(() => input.focus(), 30);
}

void (async () => {
  try {
    const res = await fetch('/api/whoami', { cache: 'no-store' });
    if (res.status === 401) return void (location.href = '/login?next=/lite');
    const { me } = (await res.json()) as { me?: typeof store.me };
    if (me) store.me = me;
  } catch {
    // the welcome message says it too
  }
  // With an account of your own, your name is that account's.
  if (store.me.account) store.profile.name = store.me.account.name;
  if (saved || store.me.account) return net.connect();
  askName((name) => {
    store.profile.name = name;
    // No look: the 3D office still has you pick a character the first time you go in.
    saveProfile({ name, color: store.profile.color });
    net.connect();
  });
})();

renderFloors();
renderWorkers();
renderNav();
paintStrip();

// Debug handle for quick checks from the console / headless screenshots.
(window as any).__lite = { store, net };
