// After you answer: the pane moves on to the next thing that needs you, the same as after a merge
// (actions.ts merged). The question card (question.ts) and the Approval card (approval.ts) call
// answered(id) once this page has sent an answer. The move waits until the agent has left Needs you
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
  select(id: string, tab: PaneTab): void;
  /** The person is typing in a terminal. */
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
    if (next) env.select(next.id, nextTab(next));
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
    },
  };
}

const live = createAdvance({
  view: currentView,
  stillAsking: (id) => store.rosterEntry(id)?.status === 'needs_input' || !!store.approvals.get(id)?.length,
  selected: () => home.selected,
  tab: () => home.tab,
  select: (id, tab) => home.select(id, tab),
  typing: () => typeof document !== 'undefined' && !!document.activeElement?.closest('.xterm'),
  narrow: () => !wide(),
  watch(fn) {
    home.on(fn);
    for (const t of ['roster', 'workers', 'approvals'] as const) store.on(t, fn);
  },
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
});

/** This page sent an answer for agent `id`: move the pane on once it's back at work. */
export const answered = (id: string) => live.answered(id);
