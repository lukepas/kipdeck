// How much an agent may do without asking: its permission mode, read off the command line it was
// started with (the office's --agent-args or AGENT_OFFICE_AGENT_ARGS, and the project's default from
// Settings), so a row can say "bypass" before anyone trusts it with a repository. Pure: the server
// works it out at launch (server/spend/launch.ts) and every page shows it.

import type { AgentProvider } from './providers.js';

/**
 * The modes, most freedom first. `bypass` runs anything without asking, `auto` decides for itself
 * which tool calls are safe, `edits` edits files freely and asks for the rest, `ask` asks for every
 * tool call that changes something, and `plan` only reads and plans.
 */
export const AUTONOMY_MODES = ['bypass', 'auto', 'edits', 'ask', 'plan'] as const;
export type Autonomy = (typeof AUTONOMY_MODES)[number];

export function isAutonomy(v: unknown): v is Autonomy {
  return typeof v === 'string' && (AUTONOMY_MODES as readonly string[]).includes(v);
}

export interface AutonomyMeta {
  /** The badge: one short word. */
  badge: string;
  /** What it means, for a title or a Settings choice. */
  says: string;
  /** How careful to look at it: `risk` is the one that never asks. */
  tone: 'risk' | 'free' | 'calm';
}

export const AUTONOMY_META: Readonly<Record<Autonomy, AutonomyMeta>> = {
  bypass: { badge: 'bypass', says: 'Runs any command and edits any file without asking', tone: 'risk' },
  auto: { badge: 'auto', says: 'Decides for itself which tool calls are safe, and asks for the rest', tone: 'free' },
  edits: { badge: 'edits', says: 'Edits files without asking, and asks before running commands', tone: 'free' },
  ask: { badge: 'ask', says: 'Asks before every edit and command', tone: 'calm' },
  plan: { badge: 'plan', says: 'Reads and plans only: no edits, no commands', tone: 'calm' },
};

/** Claude Code's own name for each mode (`--permission-mode <name>`). */
export const CLAUDE_MODE: Readonly<Record<Autonomy, string>> = {
  bypass: 'bypassPermissions',
  auto: 'auto',
  edits: 'acceptEdits',
  ask: 'default',
  plan: 'plan',
};

const FROM_CLAUDE: Readonly<Record<string, Autonomy>> = Object.fromEntries(Object.entries(CLAUDE_MODE).map(([k, v]) => [v, k as Autonomy]));

/** Codex's approval policies (`-a`, `--ask-for-approval`). */
const FROM_CODEX_APPROVAL: Readonly<Record<string, Autonomy>> = { never: 'auto', 'on-request': 'ask', 'on-failure': 'ask', untrusted: 'ask' };

/** The value of `--flag v` or `--flag=v` in `args` (before any `--`), the last one winning, as a CLI reads it. */
function flagValue(args: readonly string[], ...names: string[]): string | undefined {
  let found: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') break;
    for (const n of names) {
      if (a === n && i + 1 < args.length) found = args[i + 1];
      else if (a.startsWith(`${n}=`)) found = a.slice(n.length + 1);
    }
  }
  return found;
}

/** Whether `args` (before any `--`) has one of these switches. */
function hasFlag(args: readonly string[], ...names: string[]): boolean {
  const end = args.indexOf('--');
  return (end < 0 ? args : args.slice(0, end)).some((a) => names.includes(a));
}

/**
 * The mode an agent runs in, as its command line says. Undefined when the command line doesn't say:
 * then its CLI's own settings decide, which the office can't see.
 */
export function modeFromArgs(provider: AgentProvider | undefined, args: readonly string[]): Autonomy | undefined {
  switch (provider) {
    case 'claude':
    case 'custom': {
      if (hasFlag(args, '--dangerously-skip-permissions')) return 'bypass';
      const m = flagValue(args, '--permission-mode');
      return m === undefined ? undefined : FROM_CLAUDE[m];
    }
    case 'codex': {
      if (hasFlag(args, '--dangerously-bypass-approvals-and-sandbox', '--yolo')) return 'bypass';
      if (hasFlag(args, '--full-auto')) return 'edits';
      const a = flagValue(args, '-a', '--ask-for-approval');
      if (a !== undefined) return FROM_CODEX_APPROVAL[a];
      return flagValue(args, '-s', '--sandbox') === 'read-only' ? 'plan' : undefined;
    }
    case 'cursor':
      return hasFlag(args, '--force', '-f', '--yolo') ? 'bypass' : undefined;
    default:
      return undefined;
  }
}

/** The providers a project's default mode is passed to at launch. Others show what their own command line says. */
export const MODE_PROVIDERS: readonly AgentProvider[] = ['claude'];

/**
 * `args` with the project's default `mode` put in, when the command line doesn't already pick one (the
 * office's --agent-args win, so whoever started Kipdeck keeps the last word). Goes before a `--`, so a
 * prompt after it stays a prompt. Only for MODE_PROVIDERS; anything else comes back as it was.
 */
export function withDefaultMode(provider: AgentProvider | undefined, args: string[], mode: Autonomy | undefined): string[] {
  if (!mode || !provider || !MODE_PROVIDERS.includes(provider)) return args;
  if (hasFlag(args, '--dangerously-skip-permissions') || flagValue(args, '--permission-mode') !== undefined) return args;
  const end = args.indexOf('--');
  const flag = ['--permission-mode', CLAUDE_MODE[mode]];
  return end < 0 ? [...args, ...flag] : [...args.slice(0, end), ...flag, ...args.slice(end)];
}

/** What a badge's title says: the mode in words, or that the CLI's own settings decide. */
export function modeWords(mode: Autonomy | undefined, providerLabel = 'its CLI'): string {
  return mode ? `${AUTONOMY_META[mode].badge}: ${AUTONOMY_META[mode].says}` : `No mode on its command line: ${providerLabel}'s own settings decide what it asks about`;
}
