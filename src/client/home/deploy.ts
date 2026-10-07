// The Deploy agent sheet (N, or the button in the top bar): a project, an agent and a prompt, with
// the model and effort under More. Enter starts the agent in a worktree of its own, so agents on the
// same project never step on each other.

import { nextFreeSeat } from '../../shared/layout';
import { PROVIDER_META, type AgentProvider } from '../../shared/providers';
import type { Net } from '../net';
import { store } from '../state';
import { h, openModal, toast } from '../ui/dom';
import { agentFields, officeChoice, supportedProviders } from '../ui/provider';
import { agentMark, CERTIFIED } from './list';
import { agentFound } from './setup';
import { home } from './state';

const LAST_AGENT = 'mergeline.agent';

/** Runs `then` once you're on project `floor`: at once on yours, else after the office has moved you there. */
export function onProject(net: Net, floor: string, then: () => void) {
  if (!floor || floor === store.floor) return then();
  const off = store.on('floor', () => {
    if (store.floor !== floor) return;
    off();
    // A tick later, once the project's agents have arrived.
    setTimeout(then, 0);
  });
  net.send({ t: 'floor.go', floor });
}

function lastAgent(): AgentProvider | undefined {
  try {
    return (localStorage.getItem(LAST_AGENT) as AgentProvider | null) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Opens the sheet. `prompt` fills the box (the first-run starter task), `provider` picks the agent; `started` hears when an agent was asked for. */
export function openDeploy(net: Net, opts: { prompt?: string; provider?: AgentProvider; started?(at: number): void } = {}) {
  const floors = store.floors.filter((f) => !f.cloning);
  if (!floors.length) return toast('Add a project first: the office has none open', 'warn');
  const project = h('select', { id: 'deploy-project', 'aria-label': 'Project' }, ...floors.map((f) => h('option', { value: f.id }, f.name))) as HTMLSelectElement;
  project.value = floors.some((f) => f.id === home.project) ? home.project : (store.floor ?? floors[0].id);

  const providers = supportedProviders(store.project);
  const def = officeChoice(store.project);
  const wanted = opts.provider ?? lastAgent();
  let provider: AgentProvider = wanted && providers.includes(wanted) ? wanted : def.provider;
  // Model and effort: the provider's fields, with their own provider list hidden (the chips pick it).
  const fields = agentFields(store.project, 'deploy-agent', provider === def.provider ? def : { provider });
  fields.element.classList.add('deploy-fields');
  const chips = h('div.deploy-agents', { role: 'radiogroup', 'aria-label': 'Agent' });
  // An agent this computer doesn't have says so, and how to get it (the setup card's finding).
  const missing = (p: AgentProvider) => agentFound(p)?.installed === false;
  // Claude Code, Codex and Cursor up front, when this computer has them; the rest (beta, or not
  // installed) under More, unless one is picked.
  const front = () => providers.filter((p) => (CERTIFIED.has(p) && !missing(p)) || p === provider);
  const absent = providers.filter((p) => CERTIFIED.has(p) && missing(p));
  const others = providers.filter((p) => !CERTIFIED.has(p));
  const other = h('select', { id: 'deploy-other', 'aria-label': 'Other agents (beta)' }, h('option', { value: '' }, 'Pick one...'), ...others.map((p) => h('option', { value: p }, `${PROVIDER_META[p].label} (beta)`))) as HTMLSelectElement;
  other.addEventListener('change', () => other.value && pick(other.value as AgentProvider));
  const paintChips = () =>
    chips.replaceChildren(
      ...front().map((p) =>
        h(
          'button.btn.deploy-agent',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(p === provider),
            class: `${p === provider ? 'on' : ''}${missing(p) ? ' missing' : ''}`,
            title: missing(p) ? `Not installed on this computer: ${agentFound(p)?.fix ?? ''}` : undefined,
            onclick: () => pick(p),
          },
          agentMark(p),
          PROVIDER_META[p].label,
          missing(p) ? h('small.beta', {}, 'not installed') : CERTIFIED.has(p) ? null : h('small.beta', {}, 'beta'),
        ),
      ),
    );
  const pick = (p: AgentProvider) => {
    provider = p;
    fields.set(p === def.provider ? def : { provider: p });
    paintChips();
  };
  paintChips();

  const ta = h('textarea', { rows: 5, id: 'deploy-prompt', placeholder: 'What should it do? For example: add rate limiting to /api/login', 'aria-label': 'Task' }) as HTMLTextAreaElement;
  ta.value = opts.prompt ?? '';
  const install = absent.length
    ? h('div.deploy-other', {}, h('label', {}, 'Not on this computer yet'), ...absent.map((p) => h('p.deploy-note', {}, `${PROVIDER_META[p].label}: `, h('code', {}, agentFound(p)?.fix ?? ''), ' ', h('button.btn.small', { type: 'button', onclick: () => pick(p) }, 'Pick anyway'))))
    : null;
  const more = h('details.deploy-more', {}, h('summary', {}, 'More: model, effort and other agents'), fields.element, others.length ? h('div.deploy-other', {}, h('label', { for: 'deploy-other' }, 'Other agents (beta)'), other) : null, install);
  const branchNote = h('p.deploy-note');
  const paintNote = () => {
    const f = store.floors.find((x) => x.id === project.value);
    branchNote.textContent = store.project?.branch || f?.id !== store.floor ? 'It works on a branch of its own, so agents never collide.' : 'This project is not a git repository, so the agent works in the folder itself.';
  };
  project.addEventListener('change', paintNote);
  paintNote();

  const cancel = h('button.btn', { type: 'button' }, 'Cancel');
  const submit = h('button.btn.primary', { type: 'submit' }, 'Deploy');
  const form = h(
    'form.modal.deploy',
    { role: 'dialog', 'aria-label': 'Deploy agent' },
    h('header', {}, h('h2', {}, 'Deploy agent')),
    h(
      'div.body',
      {},
      // With one project there's nothing to choose.
      floors.length > 1 ? h('label', { for: 'deploy-project' }, 'Project') : null,
      floors.length > 1 ? project : null,
      h('label', {}, 'Agent'),
      chips,
      h('label', { for: 'deploy-prompt' }, 'Task'),
      ta,
      branchNote,
      more,
    ),
    h('footer', {}, h('span.grow', {}, 'Enter to deploy · Shift+Enter for a new line'), cancel, submit),
  ) as HTMLFormElement;
  form.noValidate = true;
  const modal = openModal(form);
  cancel.addEventListener('click', () => modal.close());

  const send = () => {
    const prompt = ta.value.trim();
    if (!prompt) return ta.focus();
    if (!fields.valid()) return;
    const choice = { provider, model: fields.model(), effort: fields.effort() };
    const floor = project.value;
    modal.close();
    try {
      localStorage.setItem(LAST_AGENT, provider);
    } catch {
      // storage blocked
    }
    onProject(net, floor, () => {
      const deskId = nextFreeSeat((id) => !!store.workerAtDesk(id), store.floorPlan.wing)?.id;
      if (!deskId) return toast('This project has no room for another agent: archive one first', 'warn');
      const at = Date.now();
      net.send({ t: 'worker.spawn', deskId, prompt, worktree: !!store.project?.branch, provider: choice.provider, model: choice.model, effort: choice.effort });
      home.check('deploy');
      opts.started?.(at);
    });
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    send();
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
  setTimeout(() => {
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, 30);
}
