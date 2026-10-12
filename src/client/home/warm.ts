// The inbox's warm moments, put on the page (the words are shared/warm.ts, the rules docs/voice.md):
// the greeting and the rotating line in the all-clear pane, the thank-you after an answer, the first
// job's toast, welcome back and the zero-wait day. The fact is always said; the warm clause sits in its own
// span after it, and only while nothing needs you (`quiet`): a queued beat is dropped, not held.

import { answeredLine, firstJobLine, greeting, welcomeBack, WELCOME_BACK_MS, type Said } from '../../shared/warm';
import { h } from '../ui/dom';
import { storageKey } from '../shared/storage-key';
import { settledToast } from './beat';
import { currentView, waitingNow } from './list';
import { home } from './state';
import './warm.css';

/**
 * Nothing needs you: no question, no reminder due, no agent request. Warm lines only play then.
 * `except` is the agent you just answered, which may not have left Needs you yet.
 */
export function quiet(except?: string): boolean {
  const view = currentView();
  const asking = view.sections['needs-you'];
  const others = waitingNow(view).needYou.length - asking.length;
  return others + asking.filter((r) => r.entry.id !== except).length === 0;
}

/** The fact, then the warm clause in its own span (left off while someone needs you). */
export function said(s: Said, isQuiet = quiet()): (string | HTMLElement)[] {
  return isQuiet && s.warm ? [s.fact, ' ', h('span.warm-said', {}, s.warm)] : [s.fact];
}

/** The all-clear pane's greeting by local time: a tape label over the heading. */
export function greetingLabel(now = Date.now()): HTMLElement {
  return h('p.warm-greet', {}, greeting(new Date(now).getHours(), now).label);
}

/** The all-clear pane's one warm line under the facts: the night shift's, else one of the rotating lines. */
export function clearLine(now = Date.now()): HTMLElement {
  return h('p.warm-line', {}, greeting(new Date(now).getHours(), now).line);
}

/** When "Thanks." was last said, so it is said at most once a minute (answeredLine). */
let thanked = 0;

/** After you answered agent `id`: "<task> is back at work.", with "Thanks." at most once a minute while nothing else needs you. */
export function sayAnswered(id: string, task: string, sub?: string) {
  const now = Date.now();
  const line = answeredLine(task, now, thanked);
  const warm = quiet(id) ? line.warm : undefined;
  if (warm) thanked = now;
  settledToast(line.fact, sub, warm);
}

const FIRST_JOB_KEY = storageKey('first-job');

/** Whether this browser has given out its first job (and when storage is blocked, once a page). */
let firstJobSaid = false;
function firstJobDone(): boolean {
  if (firstJobSaid) return true;
  try {
    return !!localStorage.getItem(FIRST_JOB_KEY);
  } catch {
    return false;
  }
}

/** The first job this browser gave out: "<task> is aboard. It'll come back here when it needs you." Once, and only while nothing needs you. */
export function sayFirstJob(task: string) {
  if (firstJobDone() || !quiet()) return;
  firstJobSaid = true;
  try {
    localStorage.setItem(FIRST_JOB_KEY, String(Date.now()));
  } catch {
    // storage blocked: once for this page
  }
  const line = firstJobLine(task);
  settledToast(line.fact, undefined, line.warm);
}

/**
 * Back after WELCOME_BACK_MS (away since `since`): "Welcome back. While you were out: 4 merged, 1
 * waiting 2h", the waiting part a link that opens the one waiting longest. Null after a shorter break.
 */
export function welcomeLine(since: number | undefined, open: () => void, now = Date.now()): HTMLElement | null {
  if (since === undefined || now - since < WELCOME_BACK_MS) return null;
  const merged = home.records.filter((r) => r.kind === 'merged' && r.at >= since).length;
  const w = waitingNow();
  const waits = [...w.needYou, ...w.toReview];
  const said = welcomeBack(merged, waits.length, waits.length ? now - Math.min(...waits) : 0);
  return h('p.warm-welcome', {}, said.lead, ' ', said.waiting ? h('button.warm-link', { type: 'button', onclick: open }, said.waiting) : null, said.tail);
}
