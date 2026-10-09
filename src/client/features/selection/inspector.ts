/**
 * The inspector: a card docked bottom right over the deck, above the bottom bar, for the selected
 * unit. Not a window: the deck stays live round it and the keys stay the deck's. Four lines (who and
 * how long in what state, the task, its latest activity, its branch, PR and engine) and the button its
 * state asks for (logic.ts buttonsFor), so answering a unit is one click from finding it.
 *
 * Motion: it comes in 8px up and fades (160 ms, ease-out); switching units cross-fades the content
 * (120 ms) without bringing the card in again. Held still, both cut (the tokens' reduced-motion rule).
 */
import './ui.css';
import { spokenActivity, type Attention } from '../../../shared/attention';
import { waitClock } from '../../../shared/wait';
import { paintWait } from '../../ui/waitclock';
import { headline, sameText, statusPhrase } from '../../../shared/rowtext';
import type { WorkerInfo } from '../../../shared/protocol';
import { store } from '../../state';
import { h } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { engineLabel } from '../../ui/provider';
import { unitSign } from '../../ui/unitsign';
import { buttonsFor, elapsed, shortPhrase, type InspectAction } from './logic';

export interface InspectorDeps {
  /** What each button does for unit `id`. */
  act(action: InspectAction, id: string): void;
  /** The card's ✕: let go of the selection. */
  close(): void;
}

/** The ranking's word on unit `id` now, or one made from its own status while it isn't on the roster yet. */
function attentionOf(w: WorkerInfo): Attention {
  const r = store.ranked(store.floor).find((x) => x.entry.id === w.id);
  if (r) return r.att;
  const level = w.status === 'needs_input' ? 'needs-you' : w.status === 'working' || w.status === 'starting' ? 'working' : 'parked';
  return { level, label: level === 'needs-you' ? 'Needs an answer' : level === 'working' ? 'Working' : 'Ready', since: w.waitingSince ?? w.createdAt, action: 'look', snoozed: false };
}

/**
 * Fades out everything in `body` ahead of new content: what's already fading goes at once, the rest
 * fades (120 ms) and is then removed.
 */
export function switchOut(body: HTMLElement) {
  for (const gone of body.querySelectorAll(':scope > .sel-out')) gone.remove();
  for (const old of [...body.children] as HTMLElement[]) {
    old.classList.add('sel-out');
    old.addEventListener('animationend', () => old.remove(), { once: true });
    window.setTimeout(() => old.remove(), 200);
  }
}

export function createInspector(deps: InspectorDeps) {
  const body = h('div.sel-body');
  const x = h('button.btn.close.corner', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => deps.close() }, icon('close', 14));
  const card = h('section.sel-card', { 'aria-label': 'Selected unit', 'aria-live': 'polite', hidden: true }, body, x);
  document.body.append(card);

  let id: string | null = null;
  /** The level its buttons were drawn for: they're drawn again only when it changes. */
  let drawnLevel = '';
  let timer = 0;
  let leaving = 0;

  /** The current content's lines, made by build(). */
  const els = { head: h('div'), state: h('span'), word: h('span'), clock: h('span'), title: h('div'), activity: h('div'), meta: h('div'), actions: h('div') };

  /** The card's content for unit `w`, made fresh (a switch of unit). */
  function build(w: WorkerInfo): HTMLElement {
    els.head = h('div.sel-head', {}, unitSign(w.deskId), h('span.sel-name', {}, w.name), (els.state = h('span.sel-state', {}, (els.word = h('span')), ' · ', (els.clock = h('span.sel-clock')))));
    els.title = h('div.sel-title');
    els.activity = h('div.sel-activity');
    els.meta = h('div.sel-meta');
    els.actions = h('div.sel-actions');
    drawnLevel = '';
    return h('div.sel-content', {}, els.head, els.title, els.activity, els.meta, els.actions);
  }

  /** Brings the lines up to date with the store and the clock (every second while it's open). */
  function refresh() {
    const w = id ? store.workers.get(id) : undefined;
    if (!w) return;
    const att = attentionOf(w);
    // What it's doing, without an asking tool's bare name ("request_user_input"): that names no question.
    const said = spokenActivity(w.activity);
    const head = headline(w.task ?? (w.title ? { name: w.title } : undefined), said ?? w.prompt);
    els.state.className = `sel-state ${att.level}`;
    // Only the short word up here ("Needs you · Wants permission"), never a whole question: what it asks
    // ("Bash: npm publish", "Update the snapshot?") is the line below, and the clock stays in view.
    const phrase = w.lost ? 'Worktree deleted' : shortPhrase(statusPhrase(att, head.title));
    els.word.textContent = phrase;
    // How long, in its wait's tone when it waits on you (amber past 5 minutes, red past 30), ticking to the minute.
    const clock = waitClock(att.level, Date.now() - att.since);
    paintWait(els.clock, elapsed(Date.now() - att.since), clock.tone, `sel:${w.id}`);
    els.state.title = w.lost ? '' : statusPhrase(att, head.title);
    els.title.textContent = head.title || 'No task yet';
    const activity = said && !sameText(said, head.title) ? said : '';
    els.activity.textContent = activity || (head.detail ?? '');
    els.activity.hidden = !els.activity.textContent;
    const meta = [w.worktree?.branch, w.pr ? `PR #${w.pr.number}` : '', w.kind === 'agent' ? engineLabel(w, store.project) : 'shell'].filter(Boolean);
    els.meta.textContent = meta.join(' / ');
    if (drawnLevel !== att.level) {
      drawnLevel = att.level;
      els.actions.replaceChildren(
        ...buttonsFor(att.level).map((b) =>
          h(`button.btn${b.primary ? '.primary' : ''}` as 'button.btn', { type: 'button', 'data-action': b.action, onclick: () => id && deps.act(b.action, id) }, b.label),
        ),
      );
    }
  }

  /** Shows unit `next` (null hides the card). */
  function show(next: string | null) {
    if (next === id) return;
    const was = id;
    id = next;
    window.clearInterval(timer);
    const w = next ? store.workers.get(next) : undefined;
    if (!w) {
      id = null;
      card.classList.remove('open');
      // Faded out, then gone from the page's tab order.
      window.clearTimeout(leaving);
      leaving = window.setTimeout(() => (card.hidden = true), 180);
      return;
    }
    window.clearTimeout(leaving);
    const fresh = build(w);
    if (was && body.firstElementChild && !card.hidden) {
      // A switch: the old content fades out over the new one fading in, the card stays put. A switch
      // again before that's done drops what was already fading at once, and fades every other child,
      // so only the newest content is ever left at full strength.
      switchOut(body);
      fresh.classList.add('sel-in');
      body.append(fresh);
    } else {
      body.replaceChildren(fresh);
      card.hidden = false;
      // Next frame, so it transitions in from where it starts.
      requestAnimationFrame(() => card.classList.add('open'));
    }
    refresh();
    timer = window.setInterval(refresh, 1000);
  }

  // The card keeps up with the unit between ticks too.
  for (const t of ['workers', 'roster', 'pulls'] as const) store.on(t, () => id && refresh());

  return {
    show,
    open: () => !!id,
    el: card,
  };
}

