// Agents' requests in Needs you (the agent gate, shared/gate.ts): when an agent asks to deploy another
// agent, message one or send some home, and no standing grant covers it, the request waits here as a
// row. The row opens the request in full (who asks, what, to whom, the whole text) with Approve and
// Reject (proposal-window.ts); a rejection's reason goes back to the agent. Standing grants are in
// Settings > Agents.

import { proposalTitle, type Proposal } from '../../shared/gate';
import { AGE_PREFIX, ageLabel } from '../../shared/inbox';
import { waitTone } from '../../shared/wait';
import type { Net } from '../net';
import { store } from '../state';
import { h } from '../ui/dom';
import { icon } from '../ui/icons';
import * as lazy from './lazy';
import { home } from './state';
import './proposals.css';

let net: Net | undefined;

/** Hands the rows and the request window the page's socket (index.ts). */
export function installProposals(n: Net) {
  net = n;
}

/** The requests the list shows: on the project picked, and with Mine on, the ones from your own agents. */
export function shownProposals(): Proposal[] {
  return store.gate.proposals.filter((p) => {
    if (home.project && p.floor !== home.project) return false;
    if (home.owner !== 'mine') return true;
    return store.rosterEntry(p.by.id)?.createdBy === store.profile.name;
  });
}

/** When each shown request started waiting, for the pulse's Needs you count. */
export const proposalWaits = (): number[] => shownProposals().map((p) => p.at);

/** A request's row in Needs you: its line, its project, its clock, and the button that opens it. */
function proposalRow(p: Proposal, now: number): HTMLElement {
  const title = proposalTitle(p);
  const open = () => openProposal(p.id);
  return h(
    'li.row.proposal.l-needs-you.s-needs-you',
    { 'data-proposal': p.id, 'data-section': 'needs-you' },
    h(
      'button.row-main',
      { type: 'button', 'aria-label': `${title}: agent request on ${p.floorName}`, onclick: open },
      h('span.agent-mark.proposal', { 'aria-hidden': 'true' }, icon('lock', 14)),
      h('span.row-text', {}, h('span.row-title', {}, title), h('span.row-sub', {}, h('span.row-status', {}, 'Agent request: approve or reject'), h('span.row-where', {}, p.floorName))),
      h('span.row-age.wait-clock', { 'data-since': String(p.at), 'data-prefix': AGE_PREFIX['needs-you'], 'data-tone': waitTone(now - p.at) }, ageLabel('needs-you', { since: p.at }, now)),
    ),
    h('button.btn.row-act.act', { type: 'button', onclick: open, 'aria-label': `Decide: ${title}` }, 'Decide'),
  );
}

/** The rows for Needs you, oldest first. */
export function proposalRows(now = Date.now()): HTMLElement[] {
  return shownProposals()
    .sort((a, b) => a.at - b.at)
    .map((p) => proposalRow(p, now));
}

/** Opens request `id` in full, with Approve and Reject (proposal-window.ts, loaded the first time). */
export function openProposal(id: string) {
  if (net) void lazy.proposal().then((m) => m.openProposalWindow(net!, id));
}
