// Mission control: one window for what needs a person right now, across every floor. Attention (the
// reminders, then who needs you, ranked), Goals (what the floor is for), Review (everything waiting
// for a person's decision), Timeline (what happened), Crew (each unit's record). The same module serves the 3D office and the
// 2D view, so it imports no three.js and nothing of the 3D office's (tests/client-structure.test.ts checks).
import './mission.css';
import { attentionLabel, chipTab, needingSomeone } from '../../../shared/attention';
import { MISSION_TABS, store, type MissionTab, type Topic } from '../../state';
import { h, openModal, type Modal } from '../dom';
import { setMissionOpen, type MissionDeps } from './act';
import { renderAttention } from './attention';
import { EDITING, renderGoals } from './goals';
import { openReminders } from './reminders';
import { renderReview } from './review';
import { renderTimeline } from './timeline';
import { renderCrew } from './crew';

export type { MissionDeps } from './act';
export { runAction } from './act';
export { renderStrip } from './strip';
export { digestCard, openDigest, recallDigest, watchAway } from './digest';

const TAB_LABEL: Record<MissionTab, string> = { attention: 'Attention', goals: 'Goals', review: 'Review', timeline: 'Timeline', crew: 'Crew' };

/** The tabs on offer: Attention and Review always; Goals, Timeline and Crew with Goals and timeline on in Labs. */
export function missionTabs(): MissionTab[] {
  return MISSION_TABS.filter((t) => t === 'attention' || t === 'review' || store.lab('ops'));
}

/** Where the last tab is remembered (the view's Settings). */
export interface MissionPrefs {
  tab: MissionTab;
  save(tab: MissionTab): void;
}

let open: { modal: Modal; show(tab: MissionTab): void } | null = null;

export function missionOpen(): boolean {
  return !!open;
}
setMissionOpen(missionOpen);

/** Opens Mission control on `tab` (else the one you had last), or switches the open one to it. */
export function openMissionControl(deps: MissionDeps, prefs: MissionPrefs, wanted: MissionTab = prefs.tab) {
  const shown = missionTabs();
  const tab = shown.includes(wanted) ? wanted : 'attention';
  if (open) return open.show(tab);
  let current = tab;
  const tabs = new Map<MissionTab, HTMLButtonElement>();
  const bar = h('div.mc-tabs', { role: 'tablist', 'aria-label': 'Mission control' });
  shown.forEach((t, i) => {
    const b = h('button.mc-tab', { type: 'button', role: 'tab', title: `${TAB_LABEL[t]} (${i + 1})`, onclick: () => show(t) }) as HTMLButtonElement;
    tabs.set(t, b);
    bar.append(b);
  });
  const body = h('div.mc-body', { role: 'tabpanel' });
  body.addEventListener('focusout', () => setTimeout(() => behind && render(), 0));
  const el = h('div.modal.mission-control', { role: 'dialog', 'aria-label': 'Mission control' }, h('header', {}, h('h2', {}, 'Mission control'), bar), body);

  function paintTabs() {
    const counts = store.counts();
    const badge: Record<MissionTab, number> = { attention: counts['needs-you'] + counts.stuck + openReminders().length, goals: 0, review: counts.review, timeline: 0, crew: 0 };
    for (const [t, b] of tabs) {
      b.setAttribute('aria-selected', String(t === current));
      b.replaceChildren(TAB_LABEL[t], badge[t] ? h('span.mc-n', {}, String(badge[t])) : '');
    }
  }

  /** Set when a redraw waited for you to finish with a box or a picker. */
  let behind = false;
  /**
   * Draws the tab again, keeping the row you were on, where you'd scrolled to, and what you're typing
   * in a box that stays (data-keep). Never under a box being edited or a picker in use: it catches
   * up once you leave it.
   */
  function render() {
    const active = document.activeElement as HTMLElement | null;
    if (active && body.contains(active) && (active.classList.contains(EDITING) || active.matches('select'))) {
      behind = true;
      return;
    }
    behind = false;
    const keep = active && body.contains(active) ? active.dataset.keep : undefined;
    const typed = keep ? (active as HTMLInputElement).value : '';
    const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.mc-row')?.dataset.id;
    const scroll = body.scrollTop;
    const now = Date.now();
    const ranked = store.ranked();
    body.replaceChildren(current === 'attention' ? renderAttention(deps, ranked, now) : current === 'review' ? renderReview(deps, ranked, now) : current === 'timeline' ? renderTimeline(deps, deps.net) : current === 'crew' ? renderCrew(deps) : renderGoals(deps));
    body.scrollTop = scroll;
    if (focused) body.querySelector<HTMLElement>(`.mc-row[data-id="${CSS.escape(focused)}"]`)?.focus();
    const again = keep ? body.querySelector<HTMLInputElement>(`[data-keep="${CSS.escape(keep)}"]`) : null;
    if (again) {
      again.value = typed;
      again.focus();
    }
    paintTabs();
  }

  function show(t: MissionTab) {
    current = t;
    prefs.save(t);
    body.scrollTop = 0;
    render();
  }

  /** ↑↓ walk the rows, Enter does the row's action, 1-5 switch tabs, Esc cancels an edit or closes. */
  function onKey(e: KeyboardEvent) {
    const top = document.querySelector('#modal-root > .backdrop:last-child');
    if (!top?.contains(el)) return;
    const at = document.activeElement as HTMLElement | null;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (at?.classList.contains(EDITING)) at.dispatchEvent(new Event('mc-cancel'));
      else modal.close();
      return;
    }
    if (at && (at.matches('input, textarea, select') || at.isContentEditable)) return;
    const n = Number(e.key);
    if (n >= 1 && n <= shown.length && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      return show(shown[n - 1]);
    }
    const rows = [...body.querySelectorAll<HTMLElement>('.mc-row')];
    if (!rows.length) return;
    const i = rows.indexOf(at?.closest<HTMLElement>('.mc-row') as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? rows[Math.min(rows.length - 1, i + 1)] : rows[Math.max(0, i < 0 ? 0 : i - 1)];
      next.focus();
      next.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && at?.classList.contains('mc-row')) {
      e.preventDefault();
      at.querySelector<HTMLButtonElement>('.mc-act')?.click();
    }
  }

  const topics: Topic[] = ['labs', 'roster', 'mission', 'issues', 'pulls', 'workers', 'floor', 'me', 'reminders', 'timeline', 'signins', 'bounties', 'reputation'];
  const offs = topics.map((t) => store.on(t, render));
  // "12 min" moves on by itself, and a worker goes silent by not changing.
  const timer = window.setInterval(render, 30_000);
  // Esc is ours (it may be cancelling an edit), so the window's own Esc is off; the ✕ stays.
  const modal = openModal(el, {
    escCloses: false,
    closeButton: true,
    doing: 'in Mission control',
    onClose: () => {
      offs.forEach((off) => off());
      clearInterval(timer);
      window.removeEventListener('keydown', onKey, true);
      open = null;
    },
  });
  window.addEventListener('keydown', onKey, true);
  open = { modal, show };
  // The agents' merge records: asked for as it opens, then kept up to date by the server.
  deps.net.send({ t: 'reputation.get' });
  show(tab);
  setTimeout(() => (body.querySelector<HTMLElement>('.mc-row') ?? body.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true }), 30);
}

/**
 * What the attention chip says: "2 need you · 1 stuck · 3 to review", across every floor, and
 * whether any reminders are open (an amber dot).
 */
export function attentionChip(): { text: string; tone: 'danger' | 'warn' | 'ok' | undefined; total: number; reminders: number; tab: 'attention' | 'review' } {
  const counts = store.counts();
  const total = needingSomeone(counts);
  const reminders = openReminders().length;
  return { text: attentionLabel(counts), tone: counts['needs-you'] ? 'danger' : counts.stuck ? 'warn' : counts.review ? 'ok' : undefined, total, reminders, tab: chipTab(counts, reminders) };
}
