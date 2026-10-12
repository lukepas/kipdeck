// An agent's one name, the same on every surface people read: the inbox's rows, its toasts and
// dialogs, the browser and Slack notifications, Signal, Mission control, Rundown and the CLI. The
// name is the work: the task's title, else the first line of what it was asked, else what it is
// doing. The agent CLI it runs (Claude Code, Codex...) is a badge beside the name, never the name,
// and the deck's nicknames ("Byte") and seat codes ("A-01") stay on the 3D Deck. The glossary is
// in docs/inbox.md ("Words"). Pure, so the server and every page use it.

import { headline } from './rowtext.js';
import { PROVIDER_META, type AgentProvider } from './providers.js';

/** What an agent's name is made from: a roster entry and a worker record both fit. */
export interface Nameable {
  kind?: 'agent' | 'shell';
  provider?: AgentProvider;
  status?: string;
  /** The short name and summary a small model writes from its prompts (server/tasks.ts). */
  task?: { name?: string; summary?: string };
  /** A title set for it by hand or from the issue it was handed. */
  title?: string;
  /** What it was first asked. */
  prompt?: string;
  /** Its latest activity line. */
  activity?: string;
}

/** The agent CLI as people know it ("Claude Code", "Codex"), or "Shell" for a plain shell: the badge. */
export function agentBadge(a: Pick<Nameable, 'kind' | 'provider'>): string {
  if (a.kind === 'shell') return 'Shell';
  return a.provider ? (PROVIDER_META[a.provider]?.label ?? a.provider) : 'Agent';
}

/**
 * The work it is on, when it has any to name it by: its task, its title or its first prompt; '' for an
 * agent nobody has asked anything yet. Never its activity line, which can hold a permission prompt's
 * input (a command with a token in it) and so stays out of toasts, notifications and the timeline.
 */
export function taskTitle(a: Nameable): string {
  const task = a.task?.name || a.task?.summary ? a.task : a.title ? { name: a.title } : undefined;
  return headline(task, a.prompt).title;
}

/**
 * The name a row and a pane header show: the task, else what it is doing right now, else what the
 * agent is waiting for ("Waiting for a task") or "Getting started". Never the deck's nickname.
 */
export function agentName(a: Nameable): string {
  return taskTitle(a) || headline(undefined, a.activity).title || (a.status === 'idle' ? 'Waiting for a task' : 'Getting started');
}

/** The longest name a sentence (a toast, a dialog's title, a notification) carries before it is cut. */
export const REF_MAX = 60;

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text;
}

/** Its CLI as a stand-in name when it has no task yet: "Codex agent", "the Codex agent", "shell". */
function standIn(a: Nameable, start: boolean): string {
  const what = a.kind === 'shell' ? 'shell' : a.provider ? `${agentBadge(a)} agent` : 'agent';
  return start ? what.charAt(0).toUpperCase() + what.slice(1) : `the ${what}`;
}

/**
 * The agent as a sentence names it: its task in quotes, cut at REF_MAX ("Fix the flaky checkout
 * test"), else its CLI ("the Codex agent", "Codex agent" at the start of a sentence), so "Answered
 * "Fix the flaky checkout test"" and "Stop the Codex agent?" read as one thing everywhere.
 */
export function agentRef(a: Nameable, opts: { start?: boolean; max?: number } = {}): string {
  const title = taskTitle(a);
  return title ? `"${cut(title, opts.max ?? REF_MAX)}"` : standIn(a, !!opts.start);
}

/** The agent as a heading names it, with no quotes: its task cut at REF_MAX, else "Codex agent". */
export function agentHeading(a: Nameable, max = REF_MAX): string {
  const title = taskTitle(a);
  return title ? cut(title, max) : standIn(a, true);
}

/**
 * A notification's title: the work, then what it needs ("Fix the flaky checkout test: needs you").
 * The browser's, the Slack message's and the stuck one's all read this way.
 */
export function alertTitle(a: Nameable, what: 'needs-you' | 'done' | 'stuck'): string {
  const words = what === 'needs-you' ? 'needs you' : what === 'done' ? 'done, to review' : 'looks stuck';
  return `${agentHeading(a)}: ${words}`;
}
