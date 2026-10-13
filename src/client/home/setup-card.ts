// The setup card itself: what the home page shows before the first agent. Three rows the office fills
// in by itself (the agent CLIs it found, the project, GitHub, which is optional), then the task box
// (starter.ts): what you were about to ask your agent, with three suggestions from the repository, and
// Bring in for sessions already running in its folder. A row that isn't ready says the one line that
// fixes it. Only a home page with no agent yet draws it, so it loads through lazy.ts (`setupCard`) with
// its stylesheet and the task box; its state stays up front in setup.ts.

import type { SetupAgent, SetupState } from '../../shared/protocol';
import { PROVIDER_META, type AgentProvider } from '../../shared/providers';
import { INSTALL_COMMAND } from '../../shared/demo';
import type { Net } from '../net';
import { store } from '../state';
import { h, toast } from '../ui/dom';
import { icon } from '../ui/icons';
import { agentMark } from './list';
import * as lazy from './lazy';
import { askSetup, firstReadyAgent, ready, setupLoading, setupRepos, setupState } from './setup';
import * as starter from './starter';
import './setup.css';

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
    parts.push(h('button.btn.primary.small', { type: 'button', onclick: () => net.send({ t: 'setup.useFolder' }) }, `Use ${s.startedIn.name}`), h('span.su-say', {}, 'the folder you started Kipdeck in'));
  }
  if (s.github.state === 'ok' && admin) {
    const input = h('input.su-repo', { type: 'text', placeholder: 'owner/repo', list: 'su-repos', 'aria-label': 'GitHub repository', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
    const list = h('datalist', { id: 'su-repos' }, ...setupRepos().map((r) => h('option', { value: r })));
    input.addEventListener('focus', () => setupRepos().length || net.send({ t: 'floor.repos' }), { once: true });
    const add = () => input.value.trim() && net.send({ t: 'floor.add', repo: input.value.trim() });
    input.addEventListener('keydown', (e) => e.key === 'Enter' && add());
    parts.push(h('span.su-line.su-clone', {}, s.startedIn ? 'or clone one from GitHub:' : 'Clone one from GitHub:', input, list, h('button.btn.small', { type: 'button', onclick: add }, 'Add')));
  }
  if (!parts.length) parts.push(h('span.su-say', {}, admin ? `Start Kipdeck inside a git repository (cd into it, then ${s.run ?? INSTALL_COMMAND}), or sign GitHub in to clone one.` : 'An admin adds projects.'));
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
      h('p', {}, "Each event is its name (first agent, first answer, first merge, or one wait in Needs you), a number of minutes, a random id made when you turn this on, the Kipdeck version, your OS and the day. Never code, prompts, names, paths or repositories. Events wait in telemetry-outbox.jsonl in Kipdeck's data folder, so you can read them first. Off by default; DO_NOT_TRACK=1 keeps it off."),
    ),
  );
}

/** The card, or null until the office has said what it found. */
export function setupCard(net: Net, deploy: (prompt: string, provider?: AgentProvider) => void): HTMLElement {
  const s = setupState();
  const admin = store.me.admin;
  if (!s) return setupLoading();
  const project = store.floors.some((f) => !f.cloning);
  const agent = firstReadyAgent();
  const canDeploy = project && !!agent;
  const why = canDeploy ? undefined : !project ? 'Add a project first' : 'Install or sign in an agent first';
  // Deploy opens the sheet on the task; the box keeps it until an agent is really on its way (starter.ts).
  const box = starter.taskBox(s, agent, canDeploy, why, (prompt) => deploy(prompt, agent));
  const rows = h('ol.su-rows', { 'aria-label': 'Setup' }, agentsRow(s), projectRow(s, net, admin), githubRow(s, net));
  // Everything found: one line says what, and the rows fold under Details. Anonymous usage numbers
  // are asked about in Settings, never before the first agent.
  const summary = canDeploy && agent ? foundLine(s, agent) : null;
  // Kip waves from the card's corner (kip-moments.ts), as he does on the sign-in card.
  const kip = h('span.kip.su-kip', { 'data-pose': 'wave' });
  void lazy.kipMoments().then((k) => k.fillKip(kip));
  return h(
    'div.first-run.setup-card',
    { class: canDeploy ? 'ready' : '' },
    kip,
    h('h2', {}, 'Give your first agent a job'),
    h('p', {}, 'It works on its own branch and comes back here when it needs you or has something to review.'),
    summary,
    canDeploy ? null : rows,
    starter.sessionsBox(s, net),
    box,
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
