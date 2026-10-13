// What the Approval card shows (approval.ts holds it and its state): loaded through lazy.ts the first
// time an agent asks permission, so the inbox draws without it.

import { DENY_REASON_MAX } from '../../shared/approval';
import type { ApprovalDecision, ApprovalRisk, ApprovalView } from '../../shared/protocol';
import { h } from '../ui/dom';
import { RISK_LABEL } from './approval';
import './approval.css';

/** What each tag means, for its tooltip. */
const RISK_WHY: Record<ApprovalRisk, string> = {
  destructive: 'Deletes, overwrites or force-pushes something that may not come back',
  network: 'Reaches the network: downloads, uploads, pushes or installs',
  outside: 'Touches files outside the folder the agent works in',
  secrets: 'Reads or writes a file that usually holds keys or passwords',
};

/** The risk tags as chips, what each means as its tooltip. */
function riskChips(a: ApprovalView): HTMLElement | null {
  if (!a.risks.length) return null;
  return h('span.ap-risks', {}, ...a.risks.map((r) => h('span.ap-risk', { class: `r-${r}`, title: RISK_WHY[r] }, RISK_LABEL[r])));
}

/** Where the card is in answering its request. */
export interface CardState {
  sent: boolean;
  denying: boolean;
  /** How many more requests the agent has open after this one. */
  behind: number;
  /** The deny reason typed so far, kept across a redraw. */
  reason?: string;
}

/** Where the keyboard goes when the card is drawn again. */
export interface PaintFocus {
  /** The control to put focus on (its data-k), in place of the one that had it. */
  to?: string;
  /** Focus was in the card before its frame emptied it (a new request), so it goes back in. */
  keep?: boolean;
}

/**
 * Draws request `a` into `el`; `answer` sends the decision. Every draw makes the controls anew, so
 * when the keyboard was in the card it stays there: on the same control (each has a data-k), on
 * `focus.to`, or, when that control is gone or disabled (a new request, an answer sent), on the card
 * itself. A new request never puts focus on Allow once, so a second Enter can't approve it.
 */
export function paintApproval(el: HTMLElement, a: ApprovalView, s: CardState, answer: (d: ApprovalDecision | 'release', reason?: string) => void, focus: PaintFocus = {}) {
  const redraw = (to?: string) => paintApproval(el, a, s, answer, { to });
  const reason = h('input.ap-reason', { 'data-k': 'reason', type: 'text', placeholder: 'Why not? (it reads this)', 'aria-label': 'Why not', maxlength: String(DENY_REASON_MAX), autocomplete: 'off', enterkeyhint: 'send' }) as HTMLInputElement;
  reason.value = s.reason ?? '';
  reason.addEventListener('input', () => (s.reason = reason.value));
  const denyForm = h(
    'form.ap-deny',
    {
      onsubmit: (ev: Event) => {
        ev.preventDefault();
        answer('deny', reason.value.trim());
      },
    },
    reason,
    h('button.btn.ap-deny-send', { 'data-k': 'deny-send', type: 'submit', disabled: s.sent }, 'Deny'),
    h('button.btn.quiet.ap-back', { 'data-k': 'back', type: 'button', onclick: () => ((s.denying = false), redraw('deny-open')) }, 'Back'),
  );
  const openDeny = () => {
    s.denying = true;
    redraw('reason');
  };
  const where = [a.cwd ? `in ${a.cwd}` : '', a.tool].filter(Boolean).join(' · ');
  const parts: (HTMLElement | null)[] = [
    h(
      'header.ap-head',
      {},
      h('h3.ap-h', {}, 'Approval'),
      h('span.ap-src', { title: "Taken from the agent's permission hook, not read off its screen" }, 'from its hook'),
      s.behind ? h('span.ap-more', {}, `${s.behind} more after this one`) : null,
    ),
    // With a command, the block under it says exactly what; the title doesn't repeat it.
    h('p.ap-title', {}, a.command ? 'It wants to run this command:' : `It wants to: ${a.title}`),
    a.command ? h('pre.ap-command', { 'aria-label': 'The command' }, a.command) : null,
    !a.command && a.paths.length ? h('ul.ap-paths', { 'aria-label': 'Files' }, ...a.paths.map((p) => h('li', {}, p))) : null,
    a.description ? h('p.ap-why', {}, a.description) : null,
    h('p.ap-where', {}, where),
    riskChips(a),
    s.denying
      ? denyForm
      : h(
          'div.ap-acts',
          { role: 'group', 'aria-label': 'Answer' },
          h('button.btn.primary.ap-once', { 'data-k': 'once', type: 'button', disabled: s.sent, onclick: () => answer('once') }, 'Allow once'),
          a.always ? h('button.btn.ap-always', { 'data-k': 'always', type: 'button', disabled: s.sent, title: `Adds the rule ${a.always}: calls like this stop asking`, onclick: () => answer('always') }, 'Always allow ', h('code', {}, a.always)) : null,
          h('button.btn.ap-deny-open', { 'data-k': 'deny-open', type: 'button', disabled: s.sent, onclick: openDeny }, 'Deny...'),
          h('button.btn.quiet.ap-release', { 'data-k': 'release', type: 'button', disabled: s.sent, title: "Hand it back to the agent's own prompt in its terminal", onclick: () => answer('release') }, 'Answer in the terminal'),
        ),
    s.sent ? h('p.ap-sent', { role: 'status' }, 'Sent. Waiting for the agent...') : null,
  ];
  const active = document.activeElement;
  const inside = !!active && el.contains(active);
  const key = focus.to ?? (inside && active !== el ? active.getAttribute('data-k') : null);
  el.replaceChildren(...parts.filter((x): x is HTMLElement => !!x));
  if (!inside && !focus.keep && !focus.to) return;
  const next = key ? el.querySelector<HTMLElement>(`[data-k="${key}"]`) : null;
  (next && !next.hasAttribute('disabled') ? next : el).focus();
}
