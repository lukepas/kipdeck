import './gate-settings.css';
// Settings > Agents: what agents may do to other agents without asking (the agent gate, shared/gate.ts).
// Admins give a standing permission per project and per action (deploying with an optional cap on
// how many run at once, messaging, sending home) and take it back; everyone sees the list and the
// record of every agent-initiated action. Shared by the home page and the Deck (settings-core.ts).
import { GATE_ACTIONS, GATE_ACTION_LABEL, GATE_LIMIT_MAX, type GateAction, type Grant } from '../../shared/gate';
import { activityLine, readLimit } from '../../shared/gate-rules';
import type { Net } from '../net';
import { store } from '../state';
import { h, timeAgo } from './dom';
import { setting } from './settings-frame';

/** How many lines of the record Settings shows. */
const SHOWN = 20;

const floorName = (id: string) => store.floors.find((f) => f.id === id)?.name ?? id;

/** A grant in words: "acme: Deploy a new agent, at most 2 at once". */
export function grantWords(g: Grant): string {
  return `${floorName(g.floor)}: ${GATE_ACTION_LABEL[g.action]}${g.action === 'hire' ? (g.limit ? `, at most ${g.limit} at once` : ', no limit') : ''}`;
}

/** The two settings, and `off` to stop following the office once Settings closes. */
export function gateSettings(net: Net): { nodes: Node[]; off: () => void } {
  const list = h('ul.gate-grants');
  const project = h('select', { 'aria-label': 'Project' }) as HTMLSelectElement;
  const action = h('select', { 'aria-label': 'Action' }, ...GATE_ACTIONS.map((a) => h('option', { value: a }, GATE_ACTION_LABEL[a]))) as HTMLSelectElement;
  const limit = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'At most (empty: no limit)', 'aria-label': `Most agent-deployed agents at once, 1 to ${GATE_LIMIT_MAX}`, autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
  const add = h('button.btn', { type: 'button' }, 'Allow');
  const form = h('div.gate-add', {}, project, action, limit, add);
  const formNote = h('p.setting-note');
  const record = h('ol.gate-record');
  const recordNote = h('p.setting-note');

  const paint = () => {
    const admin = store.me.admin;
    const { grants, activity } = store.gate;
    list.replaceChildren(
      ...grants.map((g) =>
        h(
          'li',
          { 'data-grant': g.id },
          h('span.gate-grant', {}, grantWords(g)),
          h('span.gate-by', {}, `by ${g.by} ${timeAgo(g.at)}`),
          admin ? h('button.btn', { type: 'button', onclick: () => net.send({ t: 'gate.revoke', id: g.id }), 'aria-label': `Take back: ${grantWords(g)}` }, 'Take back') : null,
        ),
      ),
    );
    list.classList.toggle('hidden', !grants.length);
    const floors = store.floors.filter((f) => !f.cloning);
    const picked = project.value;
    project.replaceChildren(...floors.map((f) => h('option', { value: f.id }, f.name)));
    if (floors.some((f) => f.id === picked)) project.value = picked;
    form.classList.toggle('hidden', !admin || !floors.length);
    limit.classList.toggle('hidden', action.value !== 'hire');
    formNote.textContent =
      (grants.length ? '' : 'No standing permissions: every request from an agent waits for a person. ') + (admin ? '' : 'Admins can change these.');
    formNote.classList.toggle('hidden', !formNote.textContent);
    const lines = activity.slice(0, SHOWN);
    record.replaceChildren(...lines.map((a) => h('li', { class: `o-${a.outcome}` }, h('span.gate-line', {}, activityLine(a)), h('span.gate-by', {}, `${a.floorName} · ${timeAgo(a.at)}`))));
    recordNote.textContent = lines.length ? 'Newest first. The full record is kept in agent-gate.json in the Kipdeck data folder.' : 'No agent has asked to act on another yet.';
  };
  action.addEventListener('change', paint);
  add.addEventListener('click', () => {
    const lim = action.value === 'hire' ? readLimit(limit.value) : undefined;
    if (typeof lim === 'string') {
      formNote.textContent = lim;
      formNote.classList.remove('hidden');
      return limit.focus();
    }
    if (!project.value) return project.focus();
    net.send({ t: 'gate.grant', floor: project.value, action: action.value as GateAction, ...(lim ? { limit: lim } : {}) });
    limit.value = '';
  });
  paint();
  const offs = [store.on('gate', paint), store.on('me', paint), store.on('floors', paint)];

  return {
    nodes: [
      setting(
        'Agents acting on other agents',
        'office',
        h('p.setting-note.gate-intro', {}, 'When an agent asks to deploy a new agent, message another one or stop and remove some, the request waits in Needs you until a person approves it. A standing permission lets agents on one project do one of these without asking.'),
        list,
        form,
        formNote,
      ),
      setting('Agent activity', 'office', record, recordNote),
    ],
    off: () => offs.forEach((off) => off()),
  };
}
