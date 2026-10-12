// After you answer: the pane moves on to the next thing that needs you, the same as after a merge
// (actions.ts merged). The question card (question.ts) and the Approval card (approval.ts) call
// answered(id), through lazy.ts, once this page has sent an answer. The move waits until the agent has left Needs you
// (or a few seconds, if the office is slow to say so), so its question doesn't flash back. It doesn't
// move when you've opened another row since, when you're typing in its terminal, or on a phone,
// where the agent you answered stays open over the list. With nothing else waiting, the pane stays on
// the one you answered, on its terminal, so you can watch it start again. Unlike a merge it never
// holds the pane empty: the agent is still live. The rule is pure in shared/inbox.ts.

import { advanceAfterAnswer, nextTab, type InboxView } from '../../shared/inbox';
import { store } from '../state';
import { currentView } from './list';
import { home, wide, type PaneTab } from './state';

/** How long the pane waits for the office to say the agent is back at work before it moves anyway. */
export const ADVANCE_MS = 4_000;

/** What the advance reads and does, so a test can hand it a fake store and inbox. */
export interface AdvanceEnv {
  view(): InboxView;
  /** Whether the agent still waits on you: its status, or another request open. */
  stillAsking(id: string): boolean;
  selected(): string | undefined;
  tab(): PaneTab;
  /** Opens `id` on `tab`; `asks` when it waits on you, so the keyboard can follow the answer to its card. */
  select(id: string, tab: PaneTab, asks?: boolean): void;
  /** The person is typing: in a terminal, or a reply half written in a box. */
  typing(): boolean;
  /** The pane covers the list (a phone). */
  narrow(): boolean;
  /** Calls `fn` on every change to the inbox or the agents. */
  watch(fn: () => void): void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(t: unknown): void;
}

export interface Advance {
  /** This page sent an answer for agent `id`. */
  answered(id: string): void;
}

export function createAdvance(env: AdvanceEnv): Advance {
  let pending: { id: string; timer: unknown } | undefined;
  let watching = false;

  const drop = () => {
    if (pending) env.clearTimer(pending.timer);
    pending = undefined;
  };

  const settle = (timedOut: boolean) => {
    const p = pending;
    if (!p) return;
    // You've moved on yourself, or you're typing to it: the pane is yours.
    if (env.selected() !== p.id || env.typing()) return drop();
    if (!timedOut && env.stillAsking(p.id)) return;
    drop();
    const next = advanceAfterAnswer(env.view(), p.id, false);
    if (next) env.select(next.id, nextTab(next), next.status === 'needs_input' || env.stillAsking(next.id));
    else if (env.tab() !== 'terminal') env.select(p.id, 'terminal');
  };

  return {
    answered(id) {
      drop();
      if (env.narrow()) return;
      if (!watching) {
        watching = true;
        env.watch(() => settle(false));
      }
      pending = { id, timer: env.setTimer(() => settle(true), ADVANCE_MS) };
      // Loaded with the first answer, the office may have said so already.
      settle(false);
    },
  };
}

const live = createAdvance({
  view: currentView,
  stillAsking: (id) => store.rosterEntry(id)?.status === 'needs_input' || !!store.approvals.get(id)?.length,
  selected: () => home.selected,
  tab: () => home.tab,
  select(id, tab, asks) {
    // Answered from a card, the keyboard was on it (or lost with its button): it follows to the next
    // card, the way Answer from a row does, so a keyboard or a screen reader isn't left on the page.
    if (asks && answering()) home.focusReply = id;
    home.select(id, tab);
  },
  typing() {
    const el = typeof document !== 'undefined' ? document.activeElement : null;
    if (!el) return false;
    if (el.closest('.xterm')) return true;
    // A reply half written in the question card (it asked again before the pane moved): the pane is yours.
    return el instanceof HTMLInputElement && !!el.closest('.q-reply') && el.value.trim() !== '';
  },
  narrow: () => !wide(),
  watch(fn) {
    home.on(fn);
    for (const t of ['roster', 'workers', 'approvals'] as const) store.on(t, fn);
  },
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
});

/** The keyboard is on an answer card, or nowhere (its button went once it was pressed). */
function answering(): boolean {
  const el = document.activeElement;
  return !el || el === document.body || !!el.closest('.q-card, .ap-card');
}

/** This page sent an answer for agent `id`: move the pane on once it's back at work. */
export const answered = (id: string) => live.answered(id);
