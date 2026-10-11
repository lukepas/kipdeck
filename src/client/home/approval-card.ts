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
}

/** Draws request `a` into `el`; `answer` sends the decision. */
export function paintApproval(el: HTMLElement, a: ApprovalView, s: CardState, answer: (d: ApprovalDecision | 'release', reason?: string) => void) {
  const redraw = () => paintApproval(el, a, s, answer);
  const reason = h('input', { type: 'text', placeholder: 'Why not? (it reads this)', 'aria-label': 'Why not', maxlength: String(DENY_REASON_MAX), autocomplete: 'off', enterkeyhint: 'send' }) as HTMLInputElement;
  const denyForm = h(
    'form.ap-deny',
    {
      onsubmit: (ev: Event) => {
        ev.preventDefault();
        answer('deny', reason.value.trim());
      },
    },
    reason,
    h('button.btn.ap-deny-send', { type: 'submit', disabled: s.sent }, 'Deny'),
    h('button.btn.quiet', { type: 'button', onclick: () => ((s.denying = false), redraw()) }, 'Back'),
  );
  const openDeny = () => {
    s.denying = true;
    redraw();
    el.querySelector<HTMLInputElement>('.ap-deny input')?.focus();
  };
  const where = [a.cwd ? `in ${a.cwd}` : '', a.tool].filter(Boolean).join(' · ');
  const parts: (HTMLElement | null)[] = [
    h('header.ap-head', {}, h('h3.ap-h', {}, 'Approval'), h('span.ap-src', { title: "Taken from the agent's permission hook, not read off its screen" }, 'from its hook')),
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
          h('button.btn.primary.ap-once', { type: 'button', disabled: s.sent, onclick: () => answer('once') }, 'Allow once'),
          a.always ? h('button.btn.ap-always', { type: 'button', disabled: s.sent, title: `Adds the rule ${a.always}: calls like this stop asking`, onclick: () => answer('always') }, 'Always allow ', h('code', {}, a.always)) : null,
          h('button.btn.ap-deny-open', { type: 'button', disabled: s.sent, onclick: openDeny }, 'Deny...'),
          h('button.btn.quiet.ap-release', { type: 'button', disabled: s.sent, title: "Hand it back to the agent's own prompt in its terminal", onclick: () => answer('release') }, 'Answer in the terminal'),
        ),
    s.sent ? h('p.ap-sent', { role: 'status' }, 'Sent. Waiting for the agent...') : null,
  ];
  el.replaceChildren(...parts.filter((x): x is HTMLElement => !!x));
}
