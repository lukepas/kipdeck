// The setup card: what the home page shows before the first agent. Three rows the office fills in by
// itself (the agent CLIs it found, the project, GitHub, which is optional), then one button that
// deploys the first agent on a safe task. A row that isn't ready says the one line that fixes it.
// The state comes from the office (server/firstrun.ts, the `setup` message).

import type { ServerMsg, SetupAgent, SetupState } from '../../shared/protocol';
import { PROVIDER_META, type AgentProvider } from '../../shared/providers';
import type { Net } from '../net';
import { store } from '../state';
import { h, toast } from '../ui/dom';
import { icon } from '../ui/icons';
import { agentMark } from './list';
import './setup.css';

/** The first agent's task: something every repository has an answer to, that changes nothing that matters. */
export const STARTER_PROMPT = 'Read this repository and write a SUMMARY.md of at most 5 lines on how to install, run and test it. Change no other file.';

let state: SetupState | undefined;
let repos: string[] = [];
let changed: () => void = () => {};

/** The office answered: the card's state, the repositories gh can see, a project that was added or not. */
export function setupMessage(msg: ServerMsg) {
  if (msg.t === 'setup') state = msg.state;
  else if (msg.t === 'floor.repos') repos = msg.repos.slice(0, 50).map((r) => r.name);
  else if (msg.t === 'floor.added' && msg.error) toast(msg.error, 'warn');
  else return;
  changed();
}

/** Asks the office for the card's state (on connecting, and on Check again). */
export function askSetup(net: Net, fresh = false) {
  net.send({ t: 'setup.check', fresh });
}

/** Redraws whatever shows the card when its state changes. */
export function onSetupChange(fn: () => void) {
  changed = fn;
}

/** An agent that can take a task now: installed, and not known to be signed out. */
const ready = (a: SetupAgent) => a.installed && a.signedIn !== false;

/** What the setup card found about an agent CLI on this computer, once the office has said. */
export function agentFound(provider: AgentProvider): SetupAgent | undefined {
  return state?.agents.find((a) => a.provider === provider);
}

/** The agent the first deploy picks: the first ready one, certified first. */
export function firstReadyAgent(): AgentProvider | undefined {
  return state?.agents.find(ready)?.provider;
}

/** A command to copy: its text and a copy button. */
export function copyLine(text: string): HTMLElement {
  const btn = h('button.btn.quiet.small.copy', { type: 'button', title: 'Copy', 'aria-label': `Copy ${text}` }, icon('copy', 12));
  btn.addEventListener('click', () => {
    void navigator.clipboard?.writeText(text).then(
      () => toast('Copied'),
      () => {},
    );
  });
  return h('span.fix', {}, h('code', {}, text), btn);
}

function row(ok: boolean | 'optional', title: string, ...body: (HTMLElement | string | null)[]): HTMLElement {
  const glyph = ok === true ? icon('check', 14) : ok === 'optional' ? icon('info', 14) : h('span.dot');
  return h('li', { class: ok === true ? 'ok' : ok === 'optional' ? 'opt' : 'todo' }, h('span.su-glyph', { 'aria-hidden': 'true' }, glyph), h('div.su-body', {}, h('b', {}, title), ...body));
}

function agentsRow(s: SetupState): HTMLElement {
  const usable = s.agents.filter(ready);
  const signIn = s.agents.filter((a) => a.installed && a.signedIn === false);
  const missing = s.agents.filter((a) => !a.installed);
  const name = (a: SetupAgent) => `${PROVIDER_META[a.provider].label}${a.certified ? '' : ' (beta)'}`;
  const chips = usable.length ? h('span.su-chips', {}, ...usable.map((a) => h('span.su-chip', {}, agentMark(a.provider), name(a)))) : null;
  const fixes = [
    ...signIn.map((a) => h('span.su-line', {}, `${name(a)} is installed but not signed in: `, copyLine(a.fix ?? ''))),
    ...(usable.length ? [] : missing.map((a) => h('span.su-line', {}, `${name(a)}: `, copyLine(a.fix ?? '')))),
  ];
  const more = usable.length && missing.length
    ? h('details.su-more', {}, h('summary', {}, `Add ${missing.map(name).join(' or ')}`), ...missing.map((a) => h('span.su-line', {}, `${name(a)}: `, copyLine(a.fix ?? ''))))
    : null;
  const say = usable.length ? null : h('span.su-say', {}, signIn.length ? 'Sign one in, then Check again.' : 'Install one of these, sign it in, then Check again.');
  return row(usable.length > 0, 'Agents', chips, say, ...fixes, more);
}

function projectRow(s: SetupState, net: Net, admin: boolean): HTMLElement {
  const floors = store.floors.filter((f) => !f.cloning);
  const cloning = store.floors.filter((f) => f.cloning);
  if (floors.length) {
    const here = s.startedIn?.floor ? floors.find((f) => f.id === s.startedIn!.floor) : undefined;
    const first = here ?? floors[0];
    const rest = floors.length - 1;
    return row(true, 'Project', h('span.su-chips', {}, h('span.su-chip.mono', {}, first.name)), h('span.su-say', {}, `${here ? 'the folder you started Kipdeck in' : first.dir}${rest ? ` and ${rest} more` : ''}`));
  }
  if (cloning.length) return row(false, 'Project', h('span.su-say', {}, `Cloning ${cloning.map((f) => f.repo ?? f.name).join(', ')}...`));
  const parts: (HTMLElement | null)[] = [];
  if (s.startedIn && admin) {
    parts.push(h('button.btn.solid.small', { type: 'button', onclick: () => net.send({ t: 'setup.useFolder' }) }, `Use ${s.startedIn.name}`), h('span.su-say', {}, 'the folder you started Kipdeck in'));
  }
  if (s.github.state === 'ok' && admin) {
    const input = h('input.su-repo', { type: 'text', placeholder: 'owner/repo', list: 'su-repos', 'aria-label': 'GitHub repository', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
    const list = h('datalist', { id: 'su-repos' }, ...repos.map((r) => h('option', { value: r })));
    input.addEventListener('focus', () => repos.length || net.send({ t: 'floor.repos' }), { once: true });
    const add = () => input.value.trim() && net.send({ t: 'floor.add', repo: input.value.trim() });
    input.addEventListener('keydown', (e) => e.key === 'Enter' && add());
    parts.push(h('span.su-line.su-clone', {}, s.startedIn ? 'or clone one from GitHub:' : 'Clone one from GitHub:', input, list, h('button.btn.small', { type: 'button', onclick: add }, 'Add')));
  }
  if (!parts.length) parts.push(h('span.su-say', {}, admin ? 'Start Kipdeck inside a git repository (cd into it, then npx kipdeck), or sign GitHub in to clone one.' : 'An admin adds projects.'));
  return row(false, 'Project', ...parts);
}

function githubRow(s: SetupState, net: Net): HTMLElement {
  const g = s.github;
  const again = h('button.btn.quiet.small', { type: 'button', onclick: () => askSetup(net, true) }, icon('refresh', 12), 'Check again');
  const without = h('span.su-say', {}, 'Optional. Without it, review shows the local diff and Merge merges on this computer.');
  if (g.state === 'ok') return row(true, 'GitHub', h('span.su-chips', {}, h('span.su-chip.mono', {}, g.login ?? 'signed in')), h('span.su-say', {}, 'pull requests and checks on each agent'));
  const what = g.state === 'missing' ? 'Install the GitHub CLI: ' : g.state === 'signed-out' ? 'Sign the GitHub CLI in: ' : `gh failed: ${g.error ?? ''}`;
  return row('optional', 'GitHub', without, h('span.su-line', {}, what, g.fix ? copyLine(g.fix) : null, again));
}

/** What the office last said it found, if it has. */
export function setupState(): SetupState | undefined {
  return state;
}

/** The switch for anonymous usage numbers, and exactly what they'd send (the setup card and Settings). */
export function usageSwitch(net: Net, s: SetupState): HTMLElement {
  return h(
    'div.su-usage',
    {},
    h(
      'label',
      {},
      h('input', { type: 'checkbox', checked: s.telemetry.on, onchange: (e: Event) => net.send({ t: 'setup.telemetry', on: (e.target as HTMLInputElement).checked }) }),
      h('span', {}, 'Share anonymous usage numbers: minutes to your first merge, and how long agents wait on you.'),
    ),
    h(
      'details',
      {},
      h('summary', {}, "What's sent"),
      h('p', {}, "Each event is its name (first agent, first answer, first merge, or one wait in Needs you), a number of minutes, a random id made when you turn this on, the Kipdeck version, your OS and the day. Never code, prompts, names, paths or repositories. Events wait in telemetry-outbox.jsonl in the office's data folder, so you can read them first. Off by default; DO_NOT_TRACK=1 keeps it off."),
    ),
  );
}

/** The card, or null until the office has said what it found. */
export function setupCard(net: Net, deploy: (prompt: string, provider?: AgentProvider) => void): HTMLElement {
  const s = state;
  const admin = store.me.admin;
  if (!s) return h('div.first-run.setup-card.loading', {}, h('h2', {}, 'Deploy your first agent'), h('p', {}, 'Looking for your agents and projects...'));
  const project = store.floors.some((f) => !f.cloning);
  const agent = firstReadyAgent();
  const canDeploy = project && !!agent;
  const go = h(
    'button.btn.solid.big',
    { type: 'button', disabled: !canDeploy, title: canDeploy ? undefined : !project ? 'Add a project first' : 'Install or sign in an agent first', onclick: () => deploy(STARTER_PROMPT, agent) },
    icon('plus', 16),
    'Deploy your first agent',
  );
  const rows = h('ol.su-rows', { 'aria-label': 'Setup' }, agentsRow(s), projectRow(s, net, admin), githubRow(s, net));
  // Everything found: one line says what, and the rows fold under Details. Anonymous usage numbers
  // are asked about in Settings, never before the first agent.
  const summary = canDeploy && agent ? foundLine(s, agent) : null;
  return h(
    'div.first-run.setup-card',
    { class: canDeploy ? 'ready' : '' },
    h('h2', {}, 'Deploy your first agent'),
    h('p', {}, 'It works on a branch of its own. When it needs an answer or has something to review, it shows up here.'),
    summary,
    canDeploy ? null : rows,
    go,
    h('p.first-hint', {}, 'It starts with a safe task: a 5-line SUMMARY.md on how to run this repo.'),
    canDeploy ? h('details.su-details', {}, h('summary', {}, 'Details'), rows) : null,
  );
}

/** "Claude Code · acme-web · merges on this computer, no GitHub needed": what was found, in one line. */
function foundLine(s: SetupState, agent: AgentProvider): HTMLElement {
  const floors = store.floors.filter((f) => !f.cloning);
  const here = (s.startedIn?.floor && floors.find((f) => f.id === s.startedIn!.floor)) || floors[0];
  const github = s.github.state === 'ok' ? `pull requests as ${s.github.login ?? 'you'} on GitHub` : 'merges on this computer, no GitHub needed';
  return h(
    'div.su-found',
    {},
    h('p', {}, h('span.su-glyph.ok', { 'aria-hidden': 'true' }, icon('check', 14)), agentMark(agent), h('b', {}, PROVIDER_META[agent].label), h('span', {}, 'in'), h('code', {}, here?.name ?? 'your project')),
    h('p.su-say', {}, `${github[0].toUpperCase()}${github.slice(1)}.`),
  );
}
