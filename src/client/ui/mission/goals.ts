// Mission control's Goals tab: what the floor is for. Its mission statement and milestones, edited
// in place (Enter saves, Esc cancels), how far each milestone has got and what it has cost, the
// workers nobody linked to anything, and telling the workers when the mission changes.

import { duration } from '../../../shared/attention';
import { MISSION_LIMITS, milestoneProgress, toLink, unlinked } from '../../../shared/mission';
import type { MissionMilestone } from '../../../shared/protocol';
import { store } from '../../state';
import { h, timeAgo } from '../dom';
import { money, type MissionDeps } from './act';
import { renderAgents } from './rep';

/** Marks the text box being edited, so Esc cancels the edit instead of closing the window (see index.ts). */
export const EDITING = 'mc-edit';

/**
 * Text that turns into a box to edit when clicked: Enter saves (Shift+Enter is a new line in a
 * multiline one) and so does clicking away, so nothing typed is lost; Esc cancels. Shows `empty` while there's nothing.
 */
function inlineEdit(opts: { text: string; empty: string; label: string; max: number; multiline?: boolean; can: boolean; save(text: string): void; render?(text: string): HTMLElement }): HTMLElement {
  const shown = opts.text ? (opts.render?.(opts.text) ?? h('span.mc-text', {}, opts.text)) : h('span.mc-placeholder', {}, opts.empty);
  if (!opts.can) return h('div.mc-editable.ro', {}, shown);
  const box = h('div.mc-editable', {});
  const show = () => box.replaceChildren(h('button.mc-edit-btn', { type: 'button', title: `Edit ${opts.label}`, 'aria-label': `Edit ${opts.label}`, onclick: edit }, shown));
  function edit() {
    const input = (opts.multiline ? h('textarea', { rows: 3, maxlength: opts.max, 'aria-label': opts.label, class: EDITING }) : h('input', { type: 'text', maxlength: opts.max, 'aria-label': opts.label, class: EDITING })) as HTMLInputElement | HTMLTextAreaElement;
    input.value = opts.text;
    let done = false;
    const finish = (save: boolean) => {
      if (done) return;
      done = true;
      if (save && input.value.trim() !== opts.text) opts.save(input.value);
      show();
    };
    input.addEventListener('keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' && !(opts.multiline && ke.shiftKey) && !ke.isComposing) {
        ke.preventDefault();
        finish(true);
      }
    });
    input.addEventListener('mc-cancel', () => finish(false));
    input.addEventListener('blur', () => finish(true));
    box.replaceChildren(input, h('span.mc-hint', {}, opts.multiline ? 'Enter saves · Shift+Enter for a new line · Esc cancels' : 'Enter saves · Esc cancels'));
    setTimeout(() => input.focus(), 0);
  }
  show();
  return box;
}

const parseIssues = (s: string) => [...s.matchAll(/\d+/g)].map((m) => Number(m[0])).filter((n) => Number.isSafeInteger(n) && n > 0);

function milestoneRow(deps: MissionDeps, m: MissionMilestone, i: number, n: number, can: boolean): HTMLElement {
  const send = (op: Record<string, unknown>) => deps.net.send({ t: 'mission.milestone', ...op } as never);
  const floorRoster = store.roster.filter((e) => e.floor === store.floor);
  const p = milestoneProgress(m, store.issues.items, floorRoster, store.pulls.items);
  const active = store.mission.active === m.id;
  const pct = p.issues ? Math.round((p.closed / p.issues) * 100) : 0;
  const stats = [p.issues ? `issues ${p.closed}/${p.issues}` : 'no issues linked yet', p.prsOpen ? `PRs ${p.prsOpen} open` : '', p.working ? `${p.working} working` : '', money(p.usd), p.workedMs ? `${duration(p.workedMs)} on task` : ''].filter(Boolean).join(' · ');
  const issues = m.issues.map((num) => {
    const it = store.issues.items.find((x) => x.number === num);
    return h('li', { class: it?.state === 'CLOSED' ? 'closed' : '' }, `#${num}`, it ? ` ${it.title}` : '');
  });
  const workers = floorRoster.filter((e) => e.goal === m.id);
  const btn = (label: string, title: string, run: () => void, disabled = false) => h('button.btn.small', { type: 'button', title, 'aria-label': title, disabled, onclick: run }, label);
  return h(
    'li.mc-milestone',
    { class: `${active ? 'active' : ''}${m.done ? ' done' : ''}` },
    h(
      'div.mc-ms-head',
      {},
      can ? (h('input', { type: 'checkbox', checked: m.done, 'aria-label': `${m.title} is done`, title: 'Done', onchange: (e: Event) => send({ op: 'update', id: m.id, done: (e.target as HTMLInputElement).checked }) }) as HTMLElement) : null,
      inlineEdit({ text: m.title, empty: 'Untitled', label: 'the milestone title', max: MISSION_LIMITS.title, can, save: (title) => send({ op: 'update', id: m.id, title }) }),
      active ? h('span.mc-badge', {}, 'Active') : can && !m.done ? btn('Make active', 'The milestone the team is on now', () => send({ op: 'activate', id: m.id })) : null,
      m.due ? h('span.mc-due', { title: 'Due' }, m.due) : null,
      can ? btn('Up', `Move ${m.title} up`, () => send({ op: 'move', id: m.id, delta: -1 }), i === 0) : null,
      can ? btn('Down', `Move ${m.title} down`, () => send({ op: 'move', id: m.id, delta: 1 }), i === n - 1) : null,
      can ? btn('Remove', `Remove ${m.title}`, () => send({ op: 'remove', id: m.id })) : null,
    ),
    p.issues ? h('div.mc-bar', { role: 'progressbar', 'aria-label': `${m.title}: ${p.closed} of ${p.issues} issues closed`, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct }, h('span', { style: `width:${pct}%` })) : null,
    h('div.mc-stats', {}, stats),
    h(
      'div.mc-ms-detail',
      {},
      h('span.mc-label', {}, 'Issues'),
      inlineEdit({ text: m.issues.join(', '), empty: 'none yet: add issue numbers like 12, 14', label: 'the issue numbers', max: 400, can, save: (s) => send({ op: 'update', id: m.id, issues: parseIssues(s) }), render: () => h('ul.mc-issues', {}, ...issues) }),
      h('span.mc-label', {}, 'Due'),
      inlineEdit({ text: m.due ?? '', empty: 'no date', label: 'the due date (YYYY-MM-DD)', max: 10, can, save: (s) => send({ op: 'update', id: m.id, due: s.trim() || null }) }),
      h('span.mc-label', {}, 'Workers'),
      h('span', {}, workers.length ? workers.map((e) => e.name).join(', ') : 'nobody yet'),
    ),
  );
}

/** Whether "Tell the workers" was left open, kept while the tab draws itself again. */
let tellOpen = false;

/** Tell the agents on the floor what the mission is now, as their next prompt; you pick which. */
function tellBox(deps: MissionDeps): HTMLElement | null {
  const agents = [...store.workers.values()].filter((w) => w.kind === 'agent' && !w.lost && store.rosterEntry(w.id));
  if (!agents.length || (!store.mission.statement && !store.mission.milestones.length)) return null;
  const picks = agents.map((w) => ({ id: w.id, box: h('input', { type: 'checkbox', checked: w.status === 'working' }) as HTMLInputElement, name: w.name }));
  const box = h('details.mc-tell', { open: tellOpen }, h('summary', {}, 'Tell the workers about a change')) as HTMLDetailsElement;
  box.addEventListener('toggle', () => (tellOpen = box.open));
  box.append(
    h('p.mc-note', {}, 'Workers are never interrupted when the mission changes. Pick the ones to tell: they get a one-line note as their next prompt, and carry on with their task.'),
    h('div.mc-picks', {}, ...picks.map((p) => h('label', {}, p.box, p.name))),
    h('button.btn.small', { type: 'button', onclick: () => deps.net.send({ t: 'mission.tell', workers: picks.filter((p) => p.box.checked).map((p) => p.id) }) }, 'Tell them'),
  );
  return box;
}

export function renderGoals(deps: MissionDeps): HTMLElement {
  const m = store.mission;
  if (!store.floor) return h('p.mc-empty', {}, 'Go to a floor to see its mission.');
  const can = !m.locked || store.me.admin;
  const statement = inlineEdit({
    text: m.statement,
    empty: 'No mission yet. Click to say what this floor is for, in a sentence or two.',
    label: 'the mission statement',
    max: MISSION_LIMITS.statement,
    multiline: true,
    can,
    save: (text) => deps.net.send({ t: 'mission.set', statement: text }),
  });
  const add = h('input', { type: 'text', maxlength: MISSION_LIMITS.title, placeholder: 'Add a milestone, then Enter', 'aria-label': 'New milestone', 'data-keep': 'add-milestone' }) as HTMLInputElement;
  add.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || !add.value.trim()) return;
    e.preventDefault();
    deps.net.send({ t: 'mission.milestone', op: 'add', title: add.value });
    add.value = '';
  });
  const floorRoster = store.roster.filter((e) => e.floor === store.floor);
  const lost = toLink(m, floorRoster);
  // Workers nobody linked, and no open milestone yet to link them to: say how, rather than ask.
  const noTarget = !lost.length && unlinked(floorRoster).length > 0;
  const linkRow = (id: string, name: string) => {
    const select = h('select', { 'aria-label': `Milestone for ${name}` }, h('option', { value: '' }, 'Link to...'), ...m.milestones.filter((x) => !x.done).map((x) => h('option', { value: x.id }, x.title))) as HTMLSelectElement;
    select.addEventListener('change', () => select.value && deps.net.send({ t: 'worker.goal', workerId: id, goal: select.value }));
    return h('li', {}, h('span', {}, name), select);
  };
  const changed = m.by ? `Changed by ${m.by} ${m.at ? timeAgo(m.at) : ''}`.trim() : '';
  return h(
    'div.mc-goals',
    {},
    h('section.mc-statement', {}, h('h3', {}, 'Mission'), statement, h('p.mc-note', {}, [changed, m.locked ? 'Locked: only admins can change it' : ''].filter(Boolean).join(' · '))),
    store.me.admin ? h('label.mc-lock', {}, h('input', { type: 'checkbox', checked: !!m.locked, onchange: (e: Event) => deps.net.send({ t: 'mission.lock', locked: (e.target as HTMLInputElement).checked }) }), 'Only admins can change the mission') : null,
    h('section', {}, h('h3', {}, 'Milestones'), m.milestones.length ? h('ol.mc-milestones', {}, ...m.milestones.map((x, i) => milestoneRow(deps, x, i, m.milestones.length, can))) : h('p.mc-empty', {}, 'No milestones yet. Each one is a step of the mission, with the issues it covers.'), can && m.milestones.length < MISSION_LIMITS.milestones ? add : null),
    lost.length ? h('section.mc-unlinked', {}, h('h3', {}, `Unlinked: ${lost.length}`), h('p.mc-note', {}, 'Workers with no milestone and no issue: link each one, so the reason it is here is not lost.'), h('ul', {}, ...lost.map((e) => linkRow(e.id, e.name)))) : null,
    noTarget ? h('p.mc-note.mc-link-hint', {}, 'Add a milestone to link workers to it.') : null,
    tellBox(deps),
    renderAgents(),
  );
}
