// Merge-based agent reputation in Mission control (shared/reputation.ts works the figures out): a
// chip on each worker's row with its agent's record and a link to check it on chain, a hint when its
// merges get reverted often (words only: it never moves the worker in the ranking or holds anything
// up), and the Agents section of the Goals tab, one row per agent identity.

import { rateLabel, repLine, revertHint, type RepStats } from '../../../shared/reputation';
import type { AgentRepView } from '../../../shared/protocol';
import { store } from '../../state';
import { h } from '../dom';

/** Only links the office makes: https ones, and its own agent cards. */
const safeHref = (u: string | undefined) => (u && (/^https:\/\//.test(u) || /^\/agents\/\d{1,30}\.json$/.test(u)) ? u : undefined);

/** The agent identity a worker runs as, when the office keeps reputation. */
export function agentOf(workerId: string): AgentRepView | undefined {
  return store.reputation?.enabled ? store.reputation.agents.find((a) => a.workers.includes(workerId)) : undefined;
}

function hours(s: number | null): string {
  if (s === null) return 'unknown';
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : `${Math.round(s / 360) / 10} h`;
}

/** What the chip's tooltip says: the whole record in a few lines. */
function details(a: AgentRepView, s: RepStats | undefined): string {
  const lines = [`${a.key}${a.agentId ? ` (ERC-8004 agent ${a.agentId})` : ' (not registered yet)'}`];
  if (!s) lines.push('Nothing of its work attested yet: its first merge registers it.');
  else {
    lines.push(`Merged by others: ${s.merged} (by ${s.distinctMaintainers} maintainers); self-merged: ${s.selfMerged}`);
    lines.push(`Reverted within 14 days: ${s.reverted}; closed unmerged: ${s.closedUnmerged}`);
    lines.push(`Merge rate ${rateLabel(s.mergeRate)}; revert rate ${rateLabel(s.revertRate)}; score ${s.score ?? 'not enough data'}`);
    lines.push(`Median time to merge: ${hours(s.medianTimeToMerge)}; earned ${s.usdcEarned} USDC from ${s.bountiesPaid} bounties`);
  }
  lines.push('Click for its latest attestation on chain (testnet).');
  return lines.join('\n');
}

/** The chip and the hint for a worker's row, or nothing when the office keeps no reputation. */
export function repBits(workerId: string): HTMLElement[] {
  const a = agentOf(workerId);
  if (!a) return [];
  const s = a.stats;
  const text = repLine(s) ?? (a.agentId ? `agent ${a.agentId}: no merges yet` : 'no merges yet');
  const href = safeHref(s?.latest) ?? safeHref(a.card);
  const chip = href ? h('a.mc-rep', { href, target: '_blank', rel: 'noopener noreferrer', title: details(a, s) }, text) : h('span.mc-rep', { title: details(a, s) }, text);
  const hint = revertHint(s);
  return [chip, ...(hint ? [h('span.mc-rep-hint', { title: 'A hint only: it never holds a worker up or moves it in the ranking' }, hint)] : [])];
}

/** The Agents section of the Goals tab: every agent identity with its record, or nothing when reputation is off. */
export function renderAgents(): HTMLElement | null {
  const r = store.reputation;
  if (!r?.enabled) return null;
  const cell = (v: string, title?: string) => h('td', title ? { title } : {}, v);
  const link = (label: string, u: string | undefined) => (safeHref(u) ? h('a', { href: safeHref(u)!, target: '_blank', rel: 'noopener noreferrer' }, label) : null);
  const rows = r.agents.map((a) => {
    const s = a.stats;
    return h(
      'tr',
      {},
      h('td', {}, h('span.mc-name', {}, a.label), h('span.mc-sub', {}, ` ${a.harness} · ${a.operator}${a.workers.length ? ` · at a desk now` : ''}`)),
      cell(s?.score === null || !s ? 'not enough data' : String(s.score), 'The ERC-8004 average: merged 100, closed 30, reverted 0 (others\' merges only)'),
      cell(s ? rateLabel(s.mergeRate) : 'not enough data'),
      cell(s ? `${s.merged}${s.selfMerged ? ` (+${s.selfMerged} self)` : ''}` : '0'),
      cell(s ? String(s.distinctMaintainers) : '0'),
      cell(s ? `${s.usdcEarned} USDC` : '0.00 USDC'),
      h('td.mc-links', {}, link(a.agentId ? `#${a.agentId}` : '', a.card), link('latest', s?.latest), link('registered', a.registered)),
    );
  });
  return h(
    'section.mc-agents',
    {},
    h('h3', {}, 'Agents'),
    h('p.mc-note', {}, `Records come only from what a person did: merged, reverted or closed an agent's pull request (Base Sepolia, testnet). Self-merges are shown, never ranked on.${r.owed ? ` ${r.owed} still to be written on chain.` : ''}`),
    rows.length
      ? h('table.mc-agent-table', {}, h('thead', {}, h('tr', {}, ...['Agent', 'Rep', 'Merge rate', 'Merged', 'Maintainers', 'Earned', 'On chain'].map((t) => h('th', {}, t)))), h('tbody', {}, ...rows))
      : h('p.mc-empty', {}, 'No agents yet: the first merge of an agent\'s pull request registers it.'),
  );
}
