// The first-run task box on the setup card (setup.ts): "What were you about to ask Claude Code?",
// with three chips drawn from the repository (shared/starters.ts, found by server/starters.ts) that
// fill it in, and, when Claude Code or Codex is already running in one of the projects' folders,
// "Bring in N sessions" (server/adopt.ts): each carries on as an agent in the inbox while its terminal
// keeps going. The box keeps what you typed, and its focus, when the card is drawn again.

import type { Net } from '../net';
import type { SetupSession, SetupState } from '../../shared/protocol';
import { PROVIDER_META, type AgentProvider } from '../../shared/providers';
import type { Starter } from '../../shared/starters';
import { store } from '../state';
import { h } from '../ui/dom';
import { icon } from '../ui/icons';
import { agentMark } from './list';
import './starter.css';

/** What's typed in the box, kept across redraws. */
let draft = '';
/** The box itself, kept so a redraw doesn't take the cursor out of it. */
let box: HTMLTextAreaElement | undefined;
/** What typing updates: the Deploy button of the card drawn last. */
let typed: () => void = () => {};

/** "What were you about to ask Claude Code?": the question, in the agent's own name. */
export function askLine(agent: AgentProvider | undefined): string {
  return `What were you about to ask ${agent ? PROVIDER_META[agent].label : 'your agent'}?`;
}

function textarea(onInput: () => void): HTMLTextAreaElement {
  typed = onInput;
  if (!box) {
    box = h('textarea.st-box', { id: 'first-task', rows: 3, placeholder: 'Fix the flaky checkout test, add a dark mode, explain the auth flow...', spellcheck: 'true' }) as HTMLTextAreaElement;
    box.addEventListener('input', () => {
      draft = box!.value;
      typed();
    });
  }
  box.value = draft;
  // Put back the cursor once the card is on the page again, if it was in the box.
  if (document.activeElement === box) {
    const [a, b] = [box.selectionStart, box.selectionEnd];
    const el = box;
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(a, b);
    });
  }
  return box;
}

/** The task box, its chips and its Deploy button: `deploy` takes the task. */
export function taskBox(s: SetupState, agent: AgentProvider | undefined, canDeploy: boolean, why: string | undefined, deploy: (prompt: string) => void): HTMLElement {
  const go = h('button.btn.primary.big.st-go', { type: 'button' }, icon('plus', 16), 'Deploy your first agent') as HTMLButtonElement;
  const list = s.starters ?? [];
  let chips: HTMLElement[] = [];
  const sync = () => {
    const empty = !draft.trim();
    go.disabled = !canDeploy || empty;
    go.title = !canDeploy ? (why ?? '') : empty ? 'Type a task, or pick one below' : '';
    // The chip whose task is in the box shows as picked, until the words are changed.
    chips.forEach((el, i) => el.setAttribute('aria-pressed', String(list[i]?.prompt === draft)));
  };
  const ta = textarea(sync);
  ta.disabled = !canDeploy;
  ta.onkeydown = (e) => {
    // Ctrl/Cmd+Enter deploys, as in the Deploy sheet; a plain Enter is a new line.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !go.disabled) {
      e.preventDefault();
      go.click();
    }
  };
  go.onclick = () => draft.trim() && deploy(draft.trim());
  chips = list.map((c) => chip(c, canDeploy, () => {
    draft = c.prompt;
    ta.value = draft;
    sync();
    // From its first word, so the whole task can be read before it goes.
    ta.focus();
    ta.setSelectionRange(0, 0);
    ta.scrollTop = 0;
  }));
  sync();
  return h(
    'div.st',
    {},
    h('label.st-ask', { for: 'first-task' }, askLine(agent)),
    ta,
    chips.length ? h('div.st-chips', { role: 'group', 'aria-label': 'Suggestions from this repository' }, ...chips) : null,
    go,
  );
}

function chip(c: Starter, enabled: boolean, pick: () => void): HTMLElement {
  return h('button.st-chip', { type: 'button', disabled: !enabled, title: c.prompt, 'data-kind': c.kind, onclick: pick }, c.label);
}

/** "Found 2 Claude Code sessions running in acme-web" and Bring in, or null when there are none. */
export function sessionsBox(s: SetupState, net: Net): HTMLElement | null {
  const all = s.sessions ?? [];
  if (!all.length || !store.me.admin) return null;
  const can = all.filter((x) => x.canAdopt);
  const where = projectNames(all);
  const label = (n: number) => `Bring in ${n} session${n === 1 ? '' : 's'}`;
  const bring = can.length
    ? h('button.btn.small.st-bring', { type: 'button', onclick: (e: Event) => {
        (e.currentTarget as HTMLButtonElement).disabled = true;
        net.send({ t: 'setup.adopt', sessions: can.map((x) => ({ provider: x.provider, id: x.id })) });
      } }, icon('plus', 12), label(can.length))
    : null;
  return h(
    'div.st-sessions',
    {},
    h('div.st-found', {}, h('span', {}, h('b', {}, `${all.length} agent session${all.length === 1 ? '' : 's'} running`), ` in ${where}`), bring),
    h('ul.st-list', {}, ...all.map(sessionRow)),
    can.length ? h('div.st-note', {}, 'Each one carries on in your inbox with the whole conversation so far, in the project folder itself rather than a branch of its own. Your terminal keeps its own copy: quit it there so the two don\'t edit the same files.') : null,
  );
}

function sessionRow(x: SetupSession): HTMLElement {
  return h(
    'li',
    { class: x.canAdopt ? '' : 'st-blocked' },
    agentMark(x.provider),
    h('span.st-title', {}, x.title ?? `${PROVIDER_META[x.provider].label} session ${x.id.slice(0, 8)}`),
    x.canAdopt ? null : h('span.st-why', {}, x.why ?? ''),
  );
}

function projectNames(all: SetupSession[]): string {
  const names = [...new Set(all.map((x) => store.floors.find((f) => f.id === x.floor)?.name ?? 'this project'))];
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ');
}

/** Forgets what was typed (the first agent is on its way). */
export function clearDraft() {
  draft = '';
  if (box) box.value = '';
}

// Deploy only opens the sheet, and closing it keeps the task here: the box is emptied once the first
// agent is really on the roster.
store.on('roster', () => {
  if (store.roster.length && draft) clearDraft();
});
