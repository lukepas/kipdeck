// The inbox's keys, six of them: Ctrl+K the command palette, N to deploy an agent, Enter for the
// selected row's primary action, Esc to step back, / to search and ? for this list. The arrow keys
// (and j and k) move the selection. None of them fire while you type in a box or the terminal, or
// while a window is open; Esc in the pane's terminal steps back to the list instead of reaching the
// agent (Ctrl+[ or the keypad's Esc sends one).

import { rowAction } from '../../shared/inbox';
import { h, modalOpen, openModal } from '../ui/dom';
import type { Actions } from './actions';
import { listedOrder, rankOf } from './list';
import { menuOpen } from './menu';
import { home } from './state';

export const SHORTCUTS: readonly [string, string][] = [
  ['Ctrl K', 'Commands and agents'],
  ['N', 'Deploy an agent'],
  ['Enter', "The selected agent's next step"],
  ['Esc', 'Back to the list'],
  ['/', 'Search agents'],
  ['?', 'These keys'],
];

/** The list of keys, in a window of its own. */
export function openKeys() {
  const el = h(
    'div.modal.keys-help',
    { role: 'dialog', 'aria-label': 'Keyboard shortcuts' },
    h('header', {}, h('h2', {}, 'Keyboard shortcuts')),
    h('div.body', {}, h('dl', {}, ...SHORTCUTS.flatMap(([k, what]) => [h('dt', {}, ...k.split(' ').map((x) => h('kbd', {}, x))), h('dd', {}, what)])), h('p.keys-note', {}, 'Up and Down (or j and k) move through the list.')),
  );
  openModal(el);
}

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !!t.closest('.xterm'));

/** Puts the keyboard on the selected row in the list (after Esc, or a move). */
export function focusSelected() {
  const id = home.selected;
  const btn = id ? document.querySelector<HTMLElement>(`.row[data-id="${CSS.escape(id)}"] .row-main`) : null;
  btn?.focus({ preventScroll: false });
  btn?.scrollIntoView({ block: 'nearest' });
}

export function installKeys(actions: Actions, palette: () => void, search: HTMLInputElement) {
  const move = (delta: number) => {
    const order = listedOrder();
    if (!order.length) return;
    const i = home.selected ? order.indexOf(home.selected) : -1;
    const next = order[Math.max(0, Math.min(order.length - 1, i < 0 ? 0 : i + delta))];
    const r = rankOf(next);
    home.select(next, r && r.att.level === 'review' ? 'changes' : 'terminal');
    focusSelected();
  };

  // Capture, so Esc in the pane's terminal comes back to the list before xterm sends it to the agent.
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.isComposing || modalOpen() || menuOpen()) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        return palette();
      }
      if (e.key === 'Escape') {
        const inPane = !!(e.target instanceof HTMLElement && e.target.closest('.pane'));
        if (e.target === search) {
          search.value = '';
          search.dispatchEvent(new Event('input'));
          search.blur();
        } else if (home.paneOpen && matchMedia('(max-width: 899px)').matches) home.select(undefined);
        else if (inPane) focusSelected();
        else if (home.selected) home.select(undefined);
        else return;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (typing(e.target) || mod || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        search.focus();
        search.select();
      } else if (e.key === '?') {
        e.preventDefault();
        openKeys();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        actions.deploy();
      } else if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        move(1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        move(-1);
      } else if (e.key === 'Enter' && home.selected) {
        // A button with the focus that isn't a row's own does what it says instead.
        const t = e.target as HTMLElement;
        if (t.tagName === 'BUTTON' && !t.classList.contains('row-main')) return;
        const r = rankOf(home.selected);
        if (!r) return;
        e.preventDefault();
        actions.act(r.entry, rowAction(r.att).action);
      }
    },
    true,
  );
}
