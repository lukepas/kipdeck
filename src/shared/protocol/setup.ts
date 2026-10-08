// The setup card on the home page (see server/firstrun.ts): which agent CLIs this computer has and
// whether they're signed in, the repository the office was started in, GitHub (optional), and
// anonymous usage numbers (off unless someone turns them on). Asked for by the page; nothing here
// changes without someone clicking.

import type { AgentProvider } from '../providers.js';

export interface SetupAgent {
  provider: AgentProvider;
  /** Claude Code, Codex and Cursor; the rest are beta. */
  certified: boolean;
  installed: boolean;
  /** Undefined when the office can't tell without running it. */
  signedIn?: boolean;
  /** The one line to run that fixes it: install it, or sign it in. */
  fix?: string;
}

export interface SetupGithub {
  /** ok: gh is signed in. missing: no gh. signed-out: gh is there and not signed in. error: gh failed. */
  state: 'ok' | 'missing' | 'signed-out' | 'error';
  login?: string;
  fix?: string;
  error?: string;
}

export interface SetupState {
  agents: SetupAgent[];
  /** The checkout the office was started in, and its project once it is one. */
  startedIn?: { dir: string; name: string; floor?: string };
  github: SetupGithub;
  /** Anonymous usage numbers (see docs/security.md): on, and whether this office may turn them on at all. */
  telemetry: { on: boolean; allowed: boolean; why?: string };
}

export type SetupClientMsg =
  /** Look again (`fresh` skips what was looked at a moment ago, for Check again). */
  | { t: 'setup.check'; fresh?: boolean }
  /** Admins: add the checkout the office was started in as a project. */
  | { t: 'setup.useFolder' }
  /** Admins: share anonymous usage numbers, or stop. */
  | { t: 'setup.telemetry'; on: boolean };

export type SetupServerMsg = { t: 'setup'; state: SetupState };
