// The workers list in the sidebar: every worker on your floor, most in need of someone first (the
// building's one ranking, see shared/attention.ts), why, what it's on, and what it has spent.

import { duration } from '../../shared/attention';
import type { WorkerInfo } from '../../shared/protocol';
import { store } from '../state';
import { DESK_BY_ID } from '../../shared/layout';
import { $, h, STATUS_LABEL } from './dom';
import { usageLabel, usageTitle } from './usage';
import { providerLabel, providerUsageState, providerWaitingLabel, resolvedProvider, modelBadge } from './provider';

export function renderWorkers(onOpen: (id: string) => void) {
  const ul = $('workers');
  ul.replaceChildren();
  // The roster's order on this floor; the board agents (not on the roster) after, as they were hired.
  const ranked = store.ranked(store.floor);
  const order = new Map(ranked.map((r, i) => [r.entry.id, i]));
  const why = new Map(ranked.map((r) => [r.entry.id, r.att]));
  const at = (w: WorkerInfo) => order.get(w.id) ?? Number.MAX_SAFE_INTEGER;
  const workers = [...store.workers.values()].sort((a, b) => at(a) - at(b) || a.createdAt - b.createdAt);
  const now = Date.now();
  for (const w of workers) {
    const provider = w.kind === 'agent' ? providerLabel(w.provider, store.project) : null;
    const providerKind = w.kind === 'agent' ? resolvedProvider(w.provider, store.project) : undefined;
    const usageState = w.kind === 'agent' ? providerUsageState(w.provider, store.project, w.usage) : undefined;
    const waiting = usageState === 'waiting' ? providerWaitingLabel(providerKind, store.project) : '';
    const usageNote = usageState === 'untracked' ? ' · usage untracked' : waiting ? ` · ${waiting}` : '';
    const badge = w.kind === 'agent' ? modelBadge(w.provider, w.model, w.effort) : undefined;
    const worked = (w.workedMs ?? 0) + (w.workingSince === undefined ? 0 : Math.max(0, now - w.workingSince));
    const sub = [provider && `⚙️ ${provider}${badge ? ` · ${badge}` : ''}${usageNote}`, w.worktree && `🌿 ${w.worktree.branch}`, w.repos?.length && `🗂️ ${w.repos.length + 1} repos`, w.pr && `🔀 PR #${w.pr.number}`, worked >= 60_000 && `${duration(worked)} on task`, w.activity || w.title || w.prompt].filter(Boolean).join(' · ');
    const att = why.get(w.id);
    // Why it needs someone, in words, in place of the bare status.
    const reason = att?.reason && !att.snoozed && (att.level === 'needs-you' || att.level === 'stuck' || att.level === 'review') ? att : undefined;
    ul.append(
      h(
        'li',
        { onclick: () => onOpen(w.id), title: `Open ${w.name}'s terminal` },
        h('span.dot', { style: `background:${w.color}` }),
        h('span.name', {}, w.name, sub ? h('span.sub', {}, sub) : null,
          usageState === 'tracked' && w.usage ? h('span.cost', { title: usageTitle(w.usage, providerKind) }, usageLabel(w.usage, providerKind)) : null),
        w.lost
          ? h('span.pill.lost', { title: 'Its worktree was deleted outside agent-office: open it to fix it' }, 'worktree deleted')
          : reason
            ? h('span.pill.reason', { class: reason.level, title: reason.reason }, reason.reason)
            : h('span.pill', { class: w.status }, STATUS_LABEL[w.status] ?? w.status),
      ),
    );
  }
  if (!workers.length) ul.append(h('li.empty', {}, 'Walk up to a desk and press E to hire one'));
  // The count is the workers hired onto desks and bean bags (and a meeting's table): the board agents
  // standing at the Issues, PR and queue kiosks are listed but aren't counted.
  const hired = workers.filter((w) => !DESK_BY_ID.get(w.deskId)?.station).length;
  $('worker-count').textContent = hired ? String(hired) : '';
}
