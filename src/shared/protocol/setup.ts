// The setup card on the home page (see server/firstrun.ts): which agent CLIs this computer has and
// whether they're signed in, the repository the office was started in, GitHub (optional), and
// anonymous usage numbers (off unless someone turns them on). Asked for by the page; nothing here
// changes without someone clicking.

import type { AgentProvider } from '../providers.js';
import type { Starter } from '../starters.js';

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

/** An agent session running in a terminal in one of the projects' folders (server/livesessions.ts). */
export interface SetupSession {
  provider: AgentProvider;
  id: string;
  /** The project whose folder it runs in. */
  floor: string;
  /** Last active (ms). */
  at: number;
  /** What it was asked first, when that can be read. */
  title?: string;
  /** Whether Bring in can carry it on while it keeps running (Claude Code forks it); else `why` says what to do. */
  canAdopt: boolean;
  why?: string;
}

export interface SetupState {
  agents: SetupAgent[];
  /** The checkout the office was started in, and its project once it is one. */
  startedIn?: { dir: string; name: string; floor?: string };
  github: SetupGithub;
  /** Anonymous usage numbers (see docs/security.md): on, and whether this office may turn them on at all. */
  telemetry: { on: boolean; allowed: boolean; why?: string };
  /** The first-run task box's suggestions, drawn from the project (server/starters.ts). */
  starters?: Starter[];
  /** Agent sessions running in the projects' folders right now (admins only: their titles are someone's prompts). */
  sessions?: SetupSession[];
}

export type SetupClientMsg =
  /** Look again (`fresh` skips what was looked at a moment ago, for Check again). */
  | { t: 'setup.check'; fresh?: boolean }
  /** Admins: add the checkout the office was started in as a project. */
  | { t: 'setup.useFolder' }
  /** Admins: share anonymous usage numbers, or stop. */
  | { t: 'setup.telemetry'; on: boolean }
  /** Admins: carry these running sessions on as agents (Bring in), leaving each running in its terminal. */
  | { t: 'setup.adopt'; sessions: { provider: AgentProvider; id: string }[] };

export type SetupServerMsg = { t: 'setup'; state: SetupState };
