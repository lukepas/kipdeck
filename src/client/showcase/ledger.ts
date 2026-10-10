// The ledger: one ruled row per agent PR that a person merged, closed or reverted, with its proof as
// violet chips (the payout on Solana devnet, the attestation on EAS, the ERC-8004 feedback), each with
// a short hash and a link to its explorer. A row opens to its money path: the unit's PR, the person's
// merge, the escrow released, the merge attested. The "Last merge" panel is the same path for the
// latest one, beside the proof rail: one lit segment per merge, as on the deck's Proof corner.
import { HARNESSES, type ShowcaseDoc, type ShowcaseEvent } from '../../shared/showcase';
import { h } from '../ui/dom';
import { icon } from '../ui/icons';
import { ago, short, units, when } from './format';

const SVG = 'http://www.w3.org/2000/svg';

/** The hash or signature at the end of an explorer link (before its query), shortened. */
export function hashOf(link: string | undefined): string | undefined {
  const m = /\/([^/?#]+)(?:\?[^#]*)?$/.exec(link ?? '');
  return m ? short(m[1], 6, 4) : undefined;
}

export function agentName(doc: ShowcaseDoc, id: string): string {
  const a = doc.agents.find((x) => x.agentId === id);
  return a?.label ? a.label.replace(/-/g, ' ') : `Agent #${id}`;
}

/** A violet proof chip: what it is, its short hash and the settled tick, linking to its explorer. */
function chip(href: string | undefined, label: string, title: string): HTMLElement | null {
  if (!href) return null;
  return h('a.ext.proof-chip', { href, target: '_blank', rel: 'noopener', title }, h('span.pc-k', {}, label), h('span.pc-h', {}, hashOf(href) ?? ''), icon('check', 12));
}

export function proofChips(e: ShowcaseEvent): HTMLElement {
  return h(
    'span.links',
    {},
    chip(e.links.solana, 'Solana', 'The bounty payout on Solana Explorer (devnet)'),
    chip(e.links.attestation, 'EAS', 'The proof-of-merge attestation on EAS (Base Sepolia)'),
    chip(e.links.feedback, '8004', 'The ERC-8004 feedback transaction (Base Sepolia)'),
  );
}

interface Step {
  label: string;
  done: boolean;
  detail: string;
  at?: number;
  link?: { href: string; text: string; title: string };
}

/** The money path of one PR, step by step, as far as it went. */
export function steps(doc: ShowcaseDoc, e: ShowcaseEvent): Step[] {
  const merged = e.outcome === 'merged';
  const harness = HARNESSES[e.harness] ?? e.harness;
  const att = e.links.attestation;
  return [
    { label: 'Unit done', done: true, detail: `${agentName(doc, e.agentId)} (${harness}) opened the PR`, at: e.openedAt },
    {
      label: merged ? 'Human merged' : e.outcome === 'reverted' ? 'Merged, then reverted' : 'Closed unmerged',
      done: merged,
      detail: e.maintainer ? `${e.self ? 'by its own operator' : 'by a maintainer'} (${e.maintainer.slice(0, 10)}, a keyed pseudonym)` : merged ? 'by a maintainer' : 'no merge, no payout',
      at: e.mergedAt ?? (merged ? e.at : undefined),
    },
    {
      label: 'Escrow released',
      done: !!e.paid,
      detail: e.paid ? `${units(e.paid.amount, e.paid.decimals)} test tokens on Solana devnet` : 'no bounty on this one',
      link: e.links.solana ? { href: e.links.solana, text: hashOf(e.links.solana) ?? 'tx', title: 'The payout on Solana Explorer (devnet)' } : undefined,
    },
    {
      label: 'Attested',
      done: !!att,
      detail: att ? `EAS on Base Sepolia${e.links.feedback ? ', ERC-8004 feedback' : ''}` : e.repo ? 'not attested' : 'private repo: kept off the chain',
      at: att ? e.at : undefined,
      link: att ? { href: att, text: hashOf(att) ?? 'uid', title: 'The attestation on EAS (Base Sepolia)' } : undefined,
    },
  ];
}

/** The path as a stepper: across on a wide screen, down on a phone (showcase.css). */
export function stepper(doc: ShowcaseDoc, e: ShowcaseEvent): HTMLElement {
  return h(
    'ol.stepper',
    { 'aria-label': 'Money path' },
    ...steps(doc, e).map((s, i) =>
      h(
        'li.step',
        { class: s.done ? 'done' : 'off' },
        h('span.node', { 'aria-hidden': 'true' }, s.done ? icon('check', 12) : String(i + 1)),
        h('span.s-label', {}, s.label),
        h('span.s-detail', {}, s.detail),
        s.at ? h('span.s-at', {}, when(s.at)) : null,
        s.link ? h('a.ext.s-link', { href: s.link.href, target: '_blank', rel: 'noopener', title: s.link.title }, s.link.text, icon('external', 12)) : null,
      ),
    ),
  );
}

/** One row of the ledger, with its money path folded under it. */
export function ledgerRow(doc: ShowcaseDoc, e: ShowcaseEvent): HTMLElement {
  const what = e.repo ? `${e.repo}#${e.pr}` : `PR #${e.pr} in a private repo`;
  const outcome = e.outcome === 'merged' ? (e.self ? 'self-merged' : 'merged') : e.outcome;
  const path = h('div.path', { hidden: true });
  const toggle = h(
    'button.row-open',
    { type: 'button', 'aria-expanded': 'false', title: 'Show its money path' },
    h('span.badge', { 'data-o': e.outcome }, e.outcome === 'merged' ? icon('merged', 14) : icon(e.outcome === 'reverted' ? 'stuck' : 'close', 14), outcome),
    h('span.body', {}, h('span.title', {}, h('b', {}, what), e.title ? ` ${e.title}` : ''), h('span.meta', {}, h('span.chip', { 'data-h': e.harness }, HARNESSES[e.harness] ?? e.harness), ` ${agentName(doc, e.agentId)}`, e.maintainer ? h('span.who-merged', { title: 'Who merged, as a keyed pseudonym: the chain never holds their GitHub account' }, ` - ${e.outcome} by a maintainer `, h('code', {}, e.maintainer.slice(0, 10))) : '')),
    h('span.paid', {}, e.paid ? `${units(e.paid.amount, e.paid.decimals)} TEST` : ''),
    h('span.age', {}, ago(e.at)),
  );
  toggle.addEventListener('click', () => {
    const open = path.hidden;
    if (open && !path.firstChild) path.append(stepper(doc, e));
    path.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });
  return h('li.item', { 'data-outcome': e.outcome, 'data-self': e.self ? '1' : undefined, title: e.self ? 'Merged by the agent\'s own operator: shown, but it does not count toward the rates' : undefined }, h('div.row-line', {}, toggle, proofChips(e)), path);
}

/** The proof rail: a segment per merge, lit up to `n`, in at least `min` segments. */
function rail(n: number, min = 16): SVGSVGElement {
  const total = Math.max(min, Math.ceil((n + 2) / 4) * 4);
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'rail');
  svg.setAttribute('viewBox', `0 0 24 ${total * 10 + 4}`);
  svg.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < total; i++) {
    const r = document.createElementNS(SVG, 'rect');
    r.setAttribute('x', '6');
    r.setAttribute('y', String(total * 10 - i * 10 - 6));
    r.setAttribute('width', '12');
    r.setAttribute('height', '7');
    r.setAttribute('class', i < n ? (i === n - 1 ? 'seg lit last' : 'seg lit') : 'seg');
    svg.append(r);
  }
  return svg;
}

/** The "Last merge" panel: the latest merged PR's path beside the proof rail. */
export function lastMerge(doc: ShowcaseDoc) {
  const body = document.getElementById('last-body')!;
  const whenEl = document.getElementById('last-when')!;
  // The newest merge that shows the whole path (paid and attested), else the newest attested, else any.
  const merged = doc.events.filter((x) => x.outcome === 'merged');
  const e = merged.find((x) => !x.self && x.paid && x.links.attestation) ?? merged.find((x) => !x.self && x.links.attestation) ?? merged.find((x) => !x.self) ?? merged[0];
  if (!e) {
    whenEl.textContent = '';
    body.replaceChildren(h('p.empty', {}, 'No merged agent work on chain yet. The first one lights the rail.'));
    return;
  }
  whenEl.textContent = ago(e.at);
  const what = e.repo ? `${e.repo}#${e.pr}` : `PR #${e.pr} in a private repo`;
  body.replaceChildren(
    h('div.rail-box', {}, rail(doc.counters.merged), h('span.rail-n', {}, String(doc.counters.merged)), h('span.rail-l', {}, 'merges attested')),
    h('div.last-main', {}, h('p.last-what', {}, h('b', {}, what), e.title ? h('span', {}, e.title) : null), stepper(doc, e), proofChips(e)),
  );
}
