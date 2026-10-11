// Pause all, Resume all and Stop all (docs/spend.md), loaded the first time one is used so the home
// page's first load stays small (tests/home-budget.test.ts). Pause all has an Undo that lets them
// carry on again; Stop all asks first, then waits STOP_HOLD_MS for an Undo before anything is sent.

import type { Net } from '../net';
import { h } from '../ui/dom';
import { icon } from '../ui/icons';
import { confirmDialog } from '../ui/prompt';
import { toggleMenu, type MenuEntry } from './menu';
import { home } from './state';
import { liveAgents, pausedAgents, plural, scoped, workingAgents } from './spend';

/** "6s": what's left of a hold (merge-hold.ts says it the same way). */
const countdownWords = (ms: number) => `${Math.max(0, Math.ceil(ms / 1000))}s`;

/** How long Stop all waits for an Undo before it's sent. */
export const STOP_HOLD_MS = 7_000;

/** What this page last asked for, so the office's answer can carry an Undo. */
let asked: 'pause' | 'resume' | undefined;

function holdToast(text: string, sub: string, ms: number, onUndo: () => void, onDone?: () => void): void {
  const until = Date.now() + ms;
  const left = h('time.hold-left', { 'aria-hidden': 'true' }, countdownWords(ms));
  const toast = h('div.toast.hold.spend-hold', { role: 'status', style: `--hold-ms:${ms}ms` }, h('span.toast-icon', { 'aria-hidden': 'true' }, icon('pause', 14)), h('span.toast-text', {}, text, h('small', {}, sub)), left);
  const finish = (said?: string) => {
    clearInterval(tick);
    clearTimeout(timer);
    toast.querySelectorAll('.hold-left, .hold-undo, .hold-bar').forEach((x) => x.remove());
    toast.classList.remove('hold');
    if (said) toast.querySelector('.toast-text small')?.replaceChildren(said);
    setTimeout(() => toast.remove(), 2500);
  };
  const undo = h('button.btn.hold-undo', { type: 'button', onclick: () => (onUndo(), finish('Undone.')) }, 'Undo');
  toast.append(undo, h('span.hold-bar', { 'aria-hidden': 'true' }));
  document.getElementById('toasts')?.append(toast);
  const tick = setInterval(() => (left.textContent = countdownWords(until - Date.now())), 250);
  const timer = setTimeout(() => {
    onDone?.();
    finish();
  }, ms);
}

function note(text: string) {
  const el = h('div.toast.info', { role: 'status' }, h('span.toast-icon', { 'aria-hidden': 'true' }, icon('info', 14)), h('span.toast-text', {}, text));
  document.getElementById('toasts')?.append(el);
  setTimeout(() => el.remove(), 3000);
}

/** Pauses `ids` (the working ones among them); the office's answer brings the Undo. */
export function pauseAgents(net: Net, ids: string[]) {
  if (!ids.length) return note('No agent is working right now.');
  asked = 'pause';
  net.send({ t: 'spend.pause', workerIds: ids });
}

function resumeAgents(net: Net, ids: string[]) {
  if (!ids.length) return;
  asked = 'resume';
  net.send({ t: 'spend.resume', workerIds: ids });
}

export const pauseAll = (net: Net) => pauseAgents(net, workingAgents().map((e) => e.id));
export const resumeAll = (net: Net) => resumeAgents(net, pausedAgents().map((e) => e.id));

/** Asks, then holds for an Undo, then ends every running agent's session in scope. Branches stay. */
export function stopAll(net: Net) {
  const agents = liveAgents();
  if (!agents.length) return note('No agent is running.');
  const where = home.project ? ` in ${agents[0].floorName}` : '';
  confirmDialog(`Stop all ${plural(agents.length)}${where}?`, 'Each session ends and leaves the inbox. Every branch stays, so nothing they did is lost. You get a few seconds to undo.', 'Stop all', () => {
    const ids = agents.map((e) => e.id);
    holdToast(`Stopping ${plural(ids.length)}`, 'Undo keeps them running.', STOP_HOLD_MS, () => {}, () => net.send({ t: 'spend.stop', workerIds: ids }));
  });
}

/** The office's answer to a pause this page asked for: the Undo that lets them carry on. */
export function paused(net: Net, ids: string[]) {
  const kind = asked;
  asked = undefined;
  if (kind !== 'pause') return;
  if (!ids.length) return note('Nothing to pause: no agent was at work.');
  holdToast(`Paused ${plural(ids.length)}`, 'They wait in Needs you until you let them carry on.', 8_000, () => resumeAgents(net, ids));
}

/** The top bar's menu: pause the working ones, resume the paused ones, or stop them all. */
export function openMenu(net: Net, anchor: HTMLElement) {
  const w = workingAgents().length;
  const p = pausedAgents().length;
  const l = liveAgents().length;
  const entries: MenuEntry[] = [
    w ? { label: 'Pause all working', icon: 'pause', note: String(w), run: () => pauseAll(net) } : null,
    p ? { label: 'Resume all paused', icon: 'play', note: String(p), run: () => resumeAll(net) } : null,
    l ? { label: 'Stop all agents', icon: 'stop', note: String(l), run: () => stopAll(net) } : null,
  ];
  toggleMenu(anchor, home.project ? `Agents in ${scoped()[0]?.floorName ?? 'this project'}` : 'Every agent', entries);
}
