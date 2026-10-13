// The setup card's state: what the office found (server/firstrun.ts, the `setup` message) and the
// repositories gh can see, kept up front because the deploy sheet and Settings read it too. The card
// itself (setup-card.ts, with its stylesheet and the task box) shows only before the first agent, so it
// loads through lazy.ts; until it has, `firstRunCard` draws the card's loading state and redraws once
// it's in.

import type { ServerMsg, SetupAgent, SetupState } from '../../shared/protocol';
import type { AgentProvider } from '../../shared/providers';
import type { Net } from '../net';
import { store } from '../state';
import { h, toast } from '../ui/dom';
import * as lazy from './lazy';

let state: SetupState | undefined;
let repos: string[] = [];
let changed: () => void = () => {};
let card: typeof import('./setup-card') | undefined;
/** Loads the card (and its task box) once it's wanted, then redraws whatever shows it. */
function loadCard() {
  if (card) return;
  void lazy.setupCard().then((m) => {
    if (card) return;
    card = m;
    changed();
  });
}

/** The office answered: the card's state, the repositories gh can see, a project that was added or not. */
export function setupMessage(msg: ServerMsg) {
  if (msg.t === 'setup') {
    state = msg.state;
    if (!store.roster.length) loadCard();
  }
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
export const ready = (a: SetupAgent) => a.installed && a.signedIn !== false;

/** What the setup card found about an agent CLI on this computer, once the office has said. */
export function agentFound(provider: AgentProvider): SetupAgent | undefined {
  return state?.agents.find((a) => a.provider === provider);
}

/** The agent the first deploy picks: the first ready one, certified first. */
export function firstReadyAgent(): AgentProvider | undefined {
  return state?.agents.find(ready)?.provider;
}

/** What the office last said it found, if it has. */
export function setupState(): SetupState | undefined {
  return state;
}

/** The repositories gh can see, for the card's clone box (asked for when it's first focused). */
export function setupRepos(): string[] {
  return repos;
}

/** The setup card, or its loading state while setup-card.ts loads (the card redraws once it has). */
export function firstRunCard(net: Net, deploy: (prompt: string, provider?: AgentProvider) => void): HTMLElement {
  if (card) return card.setupCard(net, deploy);
  loadCard();
  return setupLoading();
}

/** The card before the office (or setup-card.ts) has answered. */
export function setupLoading(): HTMLElement {
  return h('div.first-run.setup-card.loading', {}, h('h2', {}, 'Give your first agent a job'), h('p', {}, "Checking who's aboard: agents and projects..."));
}
