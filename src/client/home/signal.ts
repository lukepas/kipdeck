// Signal's chip at the head of the inbox list: the project's status at one look (shared/signal.ts),
// one line, its glyph by shape (● On track, ▲ At risk, ■ Off track, ○ No goal), the milestone and how
// far it got. A click opens the card (ui/signal/, loaded the first time). It shows the project the
// pulse does: the one picked in the top bar, else the one you're on.
//
// What it reads is on the page already: the Goals milestone (the floor you're on, live), the ranking,
// the shipped log and, while the Rundown window watches the floor, its rundown. The rest comes in
// Signal's gist (protocol/signal.ts), asked for when the page connects, when the project changes, when
// the tab comes back into view and when a milestone moves; never on a timer.

import { milestoneOf, milestoneProgress } from '../../shared/mission';
import { computeNumbers } from '../../shared/metrics';
import { chipText, computeSignal, gistOfRundown, SIGNAL_GLYPH, SIGNAL_LABEL, type Signal, type SignalInput } from '../../shared/signal';
import type { SignalGoal } from '../../shared/protocol';
import type { Net } from '../net';
import { store } from '../state';
import { $, h } from '../ui/dom';
import { home } from './state';
import './signal.css';

/** The least time between two peeks the page makes by itself (a tab back in view), per floor (ms). */
export const REPEEK_MS = 60_000;
/** The timeline events that move a milestone: a peek follows each. */
const MOVES = new Set(['progress', 'milestone', 'milestone-done', 'mission']);

/** What the chip and the card show. */
export interface SignalView {
  floor: string;
  project: string;
  signal: Signal;
  at: number;
}

/** The project Signal is about: the top bar's pick, else the floor you're on, else the first. */
export function signalFloor(): string | undefined {
  const floors = store.floors.filter((f) => !f.cloning);
  if (home.project && floors.some((f) => f.id === home.project)) return home.project;
  if (store.floor && floors.some((f) => f.id === store.floor)) return store.floor;
  return floors[0]?.id;
}

/** The Goals milestone of `floor`: live for the floor you're on, else from the gist. */
function goalOf(floor: string, now: number): SignalGoal | null {
  if (!store.lab('ops')) return null;
  if (floor !== store.floor) return store.signals.get(floor)?.gist.goal ?? null;
  const m = milestoneOf(store.mission, store.mission.active);
  if (!m || m.done) return null;
  const p = milestoneProgress(m, store.issues.items, store.roster.filter((e) => e.floor === floor), store.pulls.items, now);
  return { id: m.id, title: m.title, ...(m.due ? { due: m.due } : {}), closed: p.closed, issues: p.issues };
}

/** What computeSignal reads, from the store. */
export function signalInput(floor: string, now = Date.now()): SignalInput {
  const gist = store.signals.get(floor)?.gist;
  const goal = goalOf(floor, now);
  const burn = goal && gist?.burn?.goal === goal.id ? gist.burn : null;
  let rundown = store.lab('rundown') ? (gist?.rundown ?? null) : null;
  // The Rundown window watches this floor: its rundown is newer, the file's age still counts.
  const live = rundown && store.rundowns.get(floor)?.rundown;
  if (rundown && live && live.generator.mode !== 'facts') rundown = { ...gistOfRundown(live), at: rundown.at };
  const n = computeNumbers(home.records.filter((r) => r.floor === floor), now);
  return { now, goal, burn, rundown, ranked: store.ranked(floor), merges: { week: n.week.merged, before: n.before.merged } };
}

/** The status now, or null with no project. */
export function signalView(now = Date.now()): SignalView | null {
  const floor = signalFloor();
  if (!floor) return null;
  const project = store.floors.find((f) => f.id === floor)?.name ?? floor;
  return { floor, project, signal: computeSignal(signalInput(floor, now)), at: now };
}

/** The chip for a status. */
export function signalChip(v: SignalView, open: () => void): HTMLElement {
  const s = v.signal;
  const what = chipText(s);
  return h(
    'button.sig-chip',
    {
      type: 'button',
      'data-level': s.level,
      'data-person': s.person ? '1' : undefined,
      'aria-label': `${v.project}: ${SIGNAL_LABEL[s.level]}. ${what}. Open the project's status`,
      title: s.reasons[0]?.text ?? (s.milestone ? 'Open the project status' : 'No milestone in Goals or /rundown'),
      onclick: open,
    },
    h('span.sig-glyph', { 'aria-hidden': 'true' }, SIGNAL_GLYPH[s.level]),
    h('b.sig-word', {}, SIGNAL_LABEL[s.level]),
    h('span.sig-what', {}, what),
    h('span.sig-more', { 'aria-hidden': 'true' }, s.reasons.length ? s.reasons[0].text : ''),
  );
}

/** Puts the chip over the list, keeps it current and asks for the gist when it may have moved. `open` opens the card. */
export function installSignal(net: Net, open: () => void) {
  const root = $('signal');
  const peekedAt = new Map<string, number>();
  const peek = (force = false) => {
    const floor = signalFloor();
    if (!floor || !net.up) return;
    const last = peekedAt.get(floor) ?? 0;
    if (!force && Date.now() - last < REPEEK_MS) return;
    peekedAt.set(floor, Date.now());
    net.send({ t: 'signal.peek', floor });
  };

  let shownFloor: string | undefined;
  let drawn = '';
  const render = () => {
    const v = signalView();
    // The setup card has the page to itself until the first agent.
    const hide = !v || !!document.querySelector('#inbox .first-run');
    root.classList.toggle('hidden', hide);
    if (hide) return void ((drawn = ''), root.replaceChildren());
    if (v.floor !== shownFloor) {
      shownFloor = v.floor;
      peek(true);
    }
    // Drawn again only when it says something else, so focus and a click in progress stay on it.
    const chip = signalChip(v, open);
    const key = chip.outerHTML;
    if (key === drawn && root.firstElementChild) return;
    drawn = key;
    const focused = root.contains(document.activeElement);
    root.replaceChildren(chip);
    if (focused) chip.focus();
  };

  // A fresh connection (or a reconnect): ask again once the floors are in, the office may have moved on meanwhile.
  net.onStatus((up) => up && peekedAt.clear());
  store.on('floors', () => (peek(), render()));
  store.on('labs', () => (peek(true), render()));
  store.on('timeline', () => {
    const e = store.timeline.events[0];
    if (e && MOVES.has(e.kind) && e.floor === signalFloor() && Date.now() - e.at < 10_000) peek(true);
  });
  for (const t of ['roster', 'mission', 'issues', 'rundown', 'signal', 'floor'] as const) store.on(t, render);
  home.on(render);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && peek());
  // Ages cross their thresholds (a wait passing an hour, a due date passing) with nothing else moving.
  setInterval(render, 60_000);
  render();
}
