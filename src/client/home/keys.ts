// The inbox's keys, six of them and D: Ctrl+K the command palette, N to deploy an agent, Enter for the
// selected row's primary action (which is never Merge: that's the pane's, behind a hold), Esc to step
// back (or, while a merge is held, to undo it; u does too), / to search and ? for Help (the loop and
// these keys), and D to enter the Deck while it's on (home/deck-cta.ts). The arrow keys (and j and k) move the selection. None of them fire while you type in a box or the terminal, or
// while a window is open; Esc in the pane's terminal steps back to the list instead of reaching the
// agent (Ctrl+[ or the keypad's Esc sends one).

import { DOCS_URL, PRODUCT, UPSTREAM_CREDIT } from '../../shared/copy';
import { rowAction } from '../../shared/inbox';
import { h, modalOpen, openModal } from '../ui/dom';
import type { Actions } from './actions';
import { deckOn, goToDeck } from './deck-cta';
import { listedOrder, rankOf } from './list';
import { menuOpen } from './menu';
import { latestHeld } from './merge-hold';
import { home } from './state';

export const SHORTCUTS: readonly [string, string][] = [
  ['Ctrl K', 'Commands and agents'],
  ['N', 'Deploy an agent'],
  ['Enter', 'Answer or review the selected agent'],
  ['Esc', 'Back to the list, or undo a merge while it waits'],
  ['/', 'Search agents'],
  ['?', 'This help'],
];

/** Shown in Help while the Deck is on. */
export const DECK_SHORTCUT: readonly [string, string] = ['D', 'Enter the Deck'];

/** The loop the inbox is built around, in four verbs. */
export const LOOP: readonly [string, string][] = [
  ['Deploy', 'Deploy agent (or N) starts an agent on a branch of its own.'],
  ['Get pinged', 'It shows up in Needs you when it has a question, and in To review when it is done.'],
  ['Act', 'Each row has one button: Answer, Review changes or Fix checks. Merge is in the review, with the branch it goes into.'],
  ['Ship', 'Merge waits a few seconds for Undo, then lands in Shipped today with a signed record, and the next one opens.'],
];

/** Help (? or the avatar menu): the loop, the six keys and where the docs are. */
export function openHelp() {
  const el = h(
    'div.modal.keys-help',
    { role: 'dialog', 'aria-label': 'Help' },
    h('header', {}, h('h2', {}, 'Help')),
    h(
      'div.body',
      {},
      h('h3.help-h', {}, 'How it works'),
      h('ol.help-loop', {}, ...LOOP.map(([verb, what]) => h('li', {}, h('b', {}, verb), h('span', {}, what)))),
      h('h3.help-h', {}, 'Keys'),
      h('dl', {}, ...[...SHORTCUTS, ...(deckOn() ? [DECK_SHORTCUT] : [])].flatMap(([k, what]) => [h('dt', {}, ...k.split(' ').map((x) => h('kbd', {}, x))), h('dd', {}, what)])),
      h('p.keys-note', {}, 'Up and Down (or j and k) move through the list.'),
      h('p.keys-note', {}, h('a', { href: DOCS_URL, target: '_blank', rel: 'noopener' }, 'Read the docs'), ' for teams, servers, Labs and every option.'),
      h('h3.help-h', {}, 'About'),
      h('p.keys-note', {}, `${PRODUCT}: the inbox for your AI coding agents. Every agent in one place, who waits on you and for how long, and one button to act.`),
      h('p.keys-note', {}, h('a', { href: 'https://github.com/AgentSystemLabs/agent-office', target: '_blank', rel: 'noopener noreferrer' }, UPSTREAM_CREDIT), '. The license and NOTICE ship with every copy.'),
    ),
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
      // While a merge waits for its Undo, Esc (or u) takes the latest back, before anything else.
      const held = latestHeld();
      if (held && (e.key === 'Escape' || (e.key === 'u' && !typing(e.target) && !mod && !e.altKey)) && e.target !== search) {
        e.preventDefault();
        e.stopPropagation();
        return actions.undoMerge(held);
      }
      if (e.key === 'Escape') {
        const inPane = !!(e.target instanceof HTMLElement && e.target.closest('.pane'));
        if (e.target === search) {
          search.value = '';
          search.dispatchEvent(new Event('input'));
          search.blur();
        } else if (home.paneOpen && matchMedia('(max-width: 899px)').matches) home.select(undefined);
        else if (inPane) focusSelected();
        else if (home.selected) {
          // Held first: an empty pane would otherwise open the next one again at once (pane.ts).
          home.held = true;
          home.select(undefined);
        } else return;
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
        openHelp();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        actions.deploy();
      } else if ((e.key === 'd' || e.key === 'D') && deckOn()) {
        e.preventDefault();
        goToDeck();
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
