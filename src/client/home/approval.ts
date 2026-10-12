// The Approval card: an agent asking permission to run a tool, shown from its hook's own data (the
// tool, the exact command or files, where it runs) with risk tags, and answered by the request's id
// (server/approvals.ts): Allow once, Always allow with the rule it adds, or Deny with a reason. It
// stands in the pane over whichever tab is open, in place of the question card, and its row in the
// list says Approve rather than Answer. "Answer in the terminal" hands the request back to the
// agent's own prompt. An agent whose CLI has no permission hook asks in its terminal, and the
// question card (question.ts) reads that off the screen, labelled as such.
//
// This file is what the list needs on every load (the row's words and tags) and the card's frame;
// what the card draws is approval-card.ts, loaded the first time an agent asks.

import type { ApprovalDecision, ApprovalRisk, ApprovalView, RosterEntry } from '../../shared/protocol';
import type { Net } from '../net';
import { store } from '../state';
import { h } from '../ui/dom';
import type { CardState } from './approval-card';
import * as lazy from './lazy';
import { home } from './state';

export interface ApprovalCard {
  el: HTMLElement;
  /** Shows the card for `e` when it has an open request, else hides it. Says whether it's up. */
  show(e: RosterEntry | undefined): boolean;
}

/** The risk tags' words (shared/approval.ts riskTags says which apply). */
export const RISK_LABEL: Record<ApprovalRisk, string> = { destructive: 'Destructive', network: 'Network', outside: 'Outside the repo', secrets: 'Secrets' };

/** An agent's oldest open request, if it has one: the one its card shows first. */
export const approvalOf = (workerId: string): ApprovalView | undefined => store.approvals.get(workerId)?.[0];

/** How many more requests the agent has open behind the one on show. */
export const approvalsBehind = (workerId: string): number => Math.max(0, (store.approvals.get(workerId)?.length ?? 0) - 1);

/** What a list row says for an agent with an open request: its own status line, the button's label and the tags in a word each. */
export function approvalRow(workerId: string): { status: string; label: string; tags: HTMLElement | null } | undefined {
  const a = approvalOf(workerId);
  if (!a) return undefined;
  const tags = a.risks.length ? h('span.row-owner.row-risk', {}, a.risks.map((r) => RISK_LABEL[r]).join(', ')) : null;
  const more = approvalsBehind(workerId);
  return { status: `Wants approval: ${a.title}${more ? ` (+${more} more)` : ''}`, label: 'Approve', tags };
}

export function approvalCard(net: Net): ApprovalCard {
  const el = h('section.ap-card.hidden', { 'aria-label': 'Approval', tabindex: '-1' });
  /** The request on show, and where the card is in answering it. */
  let shown: ApprovalView | undefined;
  const state: CardState = { sent: false, denying: false, behind: 0 };

  // Every welcome (a reconnect too): the open requests, and to be told from now on.
  net.onMessage((msg) => {
    if (msg.t === 'welcome') net.send({ t: 'approvals.get' });
  });
  // A request opening or going changes the list and the pane.
  store.on('approvals', () => home.change());

  const paint = () => {
    const a = shown;
    if (!a) return;
    void lazy.approval().then((m) => {
      if (shown !== a) return;
      m.paintApproval(el, a, state, (decision, reason) => answer(a, decision, reason));
    });
  };

  const answer = (a: ApprovalView, decision: ApprovalDecision | 'release', reason?: string) => {
    if (state.sent) return;
    state.sent = true;
    net.send({ t: 'approval.answer', id: a.id, decision, ...(reason ? { reason } : {}) });
    // Answered here, with nothing more from this agent behind it: the pane moves on (advance.ts).
    // Answer in the terminal hands the request to the terminal instead, so the pane stays.
    if (decision !== 'release' && !approvalsBehind(a.workerId)) lazy.answered(a.workerId);
    paint();
  };

  return {
    el,
    show(e) {
      const a = e ? approvalOf(e.id) : undefined;
      el.classList.toggle('hidden', !a);
      el.closest('.pane')?.classList.toggle('approving', !!a);
      if (!a || !e) {
        shown = undefined;
        el.replaceChildren();
        return false;
      }
      const behind = approvalsBehind(e.id);
      if (shown?.id !== a.id) {
        shown = a;
        state.sent = false;
        state.denying = false;
        state.reason = undefined;
        state.behind = behind;
        el.replaceChildren();
        paint();
      } else if (state.behind !== behind) {
        state.behind = behind;
        paint();
      }
      // Approve from a row brings the card into view; it never presses anything by itself.
      if (home.focusReply === e.id) {
        home.focusReply = undefined;
        setTimeout(() => !el.contains(document.activeElement) && el.focus({ preventScroll: false }), 60);
      }
      return true;
    },
  };
}
