// The Rundown window's sections that are words and numbers: the status overview, what changed, a part's
// details, the milestone timeline, "Your call" and the facts. Drawn with the deck's own tokens and glyphs.
import { itemsLeft, statusCounts } from '../../../shared/rundown/model';
import { STATUSES, STATUS_LABEL, type Part, type Rundown } from '../../../shared/rundown/schema';
import { h } from '../dom';
import { icon } from '../icons';
import { statusChip } from './glyph';

const n = (x: number) => x.toLocaleString();
const plural = (x: number, one: string, many = `${one}s`) => `${n(x)} ${x === 1 ? one : many}`;

function tile(label: string, value: string, sub: string, cls = ''): HTMLElement {
  return h('div.rd-tile-kpi', { class: cls }, h('span.rd-label', {}, label), h('span.rd-value', {}, value), h('span.rd-sub', {}, sub));
}

export function overview(r: Rundown): HTMLElement {
  const counts = statusCounts(r.parts);
  const total = r.parts.length || 1;
  const ms = r.milestones.find((m) => m.id === r.nextMilestone);
  const open = r.decisions.filter((d) => !d.answer).length;
  const git = r.facts.git;
  const unc = git ? git.uncommitted.staged + git.uncommitted.modified + git.uncommitted.deleted + git.uncommitted.untracked : null;
  const testChange = r.changes.find((c) => c.kind === 'tests');
  const parts = h(
    'div.rd-tile-kpi',
    {},
    h('span.rd-label', {}, 'Parts'),
    h('span.rd-value', {}, String(r.parts.length)),
    h('div.rd-bar', { role: 'img', 'aria-label': STATUSES.map((st) => `${STATUS_LABEL[st]} ${counts[st]}`).join(', ') }, ...STATUSES.filter((st) => counts[st]).map((st) => h('span', { class: `st-${st}`, style: `width:${(counts[st] / total) * 100}%` }))),
    h('div.rd-legend', {}, ...STATUSES.map((st) => h('span', {}, statusChip(st), ` ${counts[st]}`))),
  );
  const step = r.nextStep;
  return h(
    'section.rd-kpis',
    { 'aria-label': 'Status overview' },
    parts,
    ms ? tile('Next milestone', `${ms.id} ${ms.name}`, `${plural(itemsLeft(r), 'item')} left${ms.due ? `, due ${ms.due}` : ''}`) : tile('Next milestone', 'None', r.milestones.length ? 'Every milestone is done' : 'Add them in .rundown/milestones.md'),
    h('div.rd-tile-kpi.next', {}, h('span.rd-label', {}, 'Suggested next step'), h('span.rd-value.small', {}, step ? step.text : 'Run /rundown in this project for one'), h('span.rd-sub', {}, step ? step.why : 'The collector alone does not pick a next step.')),
    tile('Your call', String(open), open ? 'open decisions, defaults below' : 'nothing waiting on you'),
    tile('Tests', plural(r.facts.files.tests.files, 'file'), `about ${n(r.facts.files.tests.casesApprox)} cases${testChange ? `; ${testChange.text}` : ''}`),
    tile('Uncommitted', unc === null ? 'n/a' : n(unc), git ? `${git.uncommitted.modified} modified, ${git.uncommitted.untracked} untracked` : 'not a git repository'),
    tile('Upstream', git?.upstream ? `+${git.upstream.ahead} / -${git.upstream.behind}` : 'none', git?.upstream ? `against ${git.upstream.ref}, as of the last fetch` : 'no upstream set'),
  );
}

export function changes(r: Rundown): HTMLElement {
  const box = h('section.rd-changes', { 'aria-label': 'Changed since last update' }, h('h3', {}, 'Changed since last update'));
  if (!r.previous) box.append(h('p', {}, 'First rundown. The next one shows what changed since this one.'));
  else if (!r.changes.length) box.append(h('p', {}, 'Nothing changed since the last commit.'));
  else {
    const list = h('ul', {}, ...r.changes.map((c, i) => h('li', { class: i >= 8 ? 'hidden' : '' }, c.text)));
    box.append(list);
    if (r.changes.length > 8) {
      const more = h('button.linkish', { type: 'button' }, `and ${r.changes.length - 8} more`);
      more.addEventListener('click', () => {
        list.querySelectorAll('.hidden').forEach((li) => li.classList.remove('hidden'));
        more.remove();
      });
      box.append(more);
    }
  }
  return box;
}

/** A part's details: why it has its status, its numbers, its paths, what's linked to it. */
export function partDetail(r: Rundown, p: Part, close: () => void): HTMLElement {
  const m = p.metrics;
  const items = r.milestones.flatMap((ms) => ms.items.filter((i) => i.partId === p.id).map((i) => `${ms.id}: ${i.done ? 'done, ' : ''}${i.text}`));
  const decs = r.decisions.filter((d) => d.partId === p.id && !d.answer);
  const base = (g: string) => g.split('/').filter((x) => !/[*?]/.test(x)).join('/');
  const todos = r.facts.files.todo.locations.filter((t) => p.paths.some((g) => !base(g) || t.path.startsWith(`${base(g)}/`))).slice(0, 10);
  const x = h('button.btn.close', { type: 'button', 'aria-label': 'Close part', title: 'Close' }, icon('close', 14));
  x.addEventListener('click', close);
  return h(
    'div.rd-detail',
    { role: 'region', 'aria-label': `${p.name} details` },
    h('div.rd-detail-head', {}, h('h3', {}, p.name), x),
    h('p.rd-note', {}, p.summary),
    h('p', {}, statusChip(p.status), p.waitingOn ? h('span', {}, ` waiting on `, h('b', {}, p.waitingOn)) : null, p.statusSource === 'inferred' ? h('small.rd-note', {}, '  inferred') : null),
    h('dl', {}, ...[['Lines', n(m.lines)], ['Files', n(m.files)], ['Test files', n(m.testFiles)], ['TODO / FIXME', `${m.todo} / ${m.fixme}`], ['Commits, 30 days', String(m.commits30d)], ['Last commit', m.lastCommit?.slice(0, 10) ?? 'none'], ['Uncommitted', String(m.uncommitted)], ['Paths', p.paths.join(', ')]].flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
    p.evidence.length ? h('div', {}, h('h4', {}, 'Why'), h('ul', {}, ...p.evidence.map((e) => h('li', {}, e.text)))) : null,
    items.length ? h('div', {}, h('h4', {}, 'Milestone items'), h('ul', {}, ...items.map((t) => h('li', {}, t)))) : null,
    decs.length ? h('div', {}, h('h4', {}, 'Your call'), h('ul', {}, ...decs.map((d) => h('li', {}, `${d.id}. ${d.question}`)))) : null,
    todos.length ? h('div', {}, h('h4', {}, 'TODO locations'), h('ul.rd-mono', {}, ...todos.map((t) => h('li', {}, `${t.path}:${t.line} ${t.tag}`)))) : null,
  );
}

export function milestones(r: Rundown): HTMLElement {
  const sec = h('section.rd-ms', { 'aria-label': 'Milestones' }, h('h3', {}, 'Milestones', r.milestones.some((m) => m.source === 'proposed') ? h('span.rd-badge', {}, 'Proposed: edit me') : null));
  if (!r.milestones.length) {
    sec.append(h('p.rd-note', {}, 'No milestones yet. Write them in .rundown/milestones.md, or run /rundown and Claude proposes a first set.'));
    return sec;
  }
  sec.append(
    h(
      'ol.rd-tl',
      {},
      ...r.milestones.map((m) => {
        const left = m.items.filter((i) => !i.done).length;
        return h('li', { class: m.state }, h('span.node', { 'aria-hidden': 'true' }), h('span.name', {}, `${m.id}. ${m.name}`), h('span.when', {}, `${m.state === 'done' ? 'Done' : m.state === 'active' ? `${left} left` : `${m.items.length} ${m.items.length === 1 ? 'item' : 'items'}`}${m.due ? ` · due ${m.due}` : ''}`));
      }),
    ),
  );
  const active = r.milestones.find((m) => m.state === 'active');
  if (active) sec.append(h('p.rd-note', {}, `${active.id} is done when: ${active.doneWhen || 'every item is ticked'}`), h('ul.rd-items', {}, ...active.items.map((i) => h('li', { class: i.done ? 'done' : '' }, i.text))));
  return sec;
}

export function decisions(r: Rundown): HTMLElement {
  const open = r.decisions.filter((d) => !d.answer);
  const done = r.decisions.filter((d) => d.answer);
  const partName = (id: string | null) => (id ? (r.parts.find((p) => p.id === id)?.name ?? id) : '');
  return h(
    'section.rd-call',
    { 'aria-label': 'Your call' },
    h('h3', {}, 'Your call'),
    open.length
      ? h(
          'div.rd-decs',
          {},
          ...open.map((d) =>
            h(
              'div.rd-dec',
              {},
              h('span.rd-label', {}, [d.id, d.raised && `raised ${d.raised}`, partName(d.partId)].filter(Boolean).join(' · ')),
              h('p.q', {}, d.question),
              d.options.length ? h('ul', {}, ...d.options.map((o) => h('li', {}, o))) : null,
              h('p.def', {}, h('b', {}, 'DEFAULT '), d.default),
            ),
          ),
        )
      : h('p.rd-note', {}, 'Nothing waiting on you.'),
    h('p.rd-note', {}, 'Write it under Answer: in .rundown/decisions.md and run /rundown quick.'),
    done.length ? h('details', {}, h('summary', {}, plural(done.length, 'resolved decision')), h('ul', {}, ...done.map((d) => h('li', {}, `${d.id}. ${d.question}: ${d.answer}`)))) : null,
  );
}

export function facts(r: Rundown): HTMLElement {
  const f = r.facts.files;
  const langs = Object.entries(f.languages).filter(([, v]) => v.lines > 0).sort((a, b) => b[1].lines - a[1].lines).slice(0, 6);
  const total = langs.reduce((a, [, v]) => a + v.lines, 0) || 1;
  const d = f.docs;
  const docs: [boolean, string][] = [[d.readme, 'README'], [!!d.docsDir, 'Docs folder'], [d.changelog, 'Changelog'], [d.license, 'Licence'], [d.architecture, 'Architecture'], [d.agentFiles.length > 0, 'Agent instructions']];
  const gaps = [...r.facts.gaps, ...(r.facts.truncated ? ['A limit was hit: the numbers are partial'] : []), ...(f.skippedSensitive ? [`${f.skippedSensitive} files on the deny list were counted, never opened`] : [])];
  return h(
    'details.rd-facts',
    {},
    h('summary', {}, `Facts: ${plural(f.total, 'file')}, ${langs.map(([k, v]) => `${k} ${Math.round((v.lines / total) * 100)}%`).join(', ')}`),
    h(
      'div.rd-facts-grid',
      {},
      h('div', {}, h('span.rd-label', {}, 'Top folders'), h('table', {}, h('tbody', {}, ...f.byTopFolder.slice(0, 8).map((t) => h('tr', {}, h('td.rd-mono', {}, t.folder), h('td.num', {}, n(t.lines))))))),
      h('div', {}, h('span.rd-label', {}, 'Largest files'), h('table', {}, h('tbody', {}, ...f.largest.slice(0, 8).map((t) => h('tr', {}, h('td.rd-mono', {}, t.path), h('td.num', {}, n(t.lines))))))),
      h('div', {}, h('span.rd-label', {}, 'Docs'), h('ul.rd-check', {}, ...docs.map(([ok, label]) => h('li', { class: ok ? 'ok' : '' }, `${ok ? 'Has' : 'No'} ${label.toLowerCase()}`))), h('span.rd-label', {}, 'CI'), h('ul', {}, ...(f.ci.length ? f.ci.map((c) => h('li.rd-mono', {}, c.name ?? c.path)) : [h('li.rd-note', {}, 'No pipelines found')]))),
      gaps.length ? h('div', {}, h('span.rd-label', {}, 'Gaps'), h('ul', {}, ...gaps.map((g) => h('li', {}, g)))) : null,
    ),
  );
}

/** Over the map, whole: each stuck part and what it waits on, which a tile may have to clip. */
export function needsYou(r: Rundown, open: (id: string) => void): HTMLElement | null {
  const stuck = r.parts.filter((p) => p.status === 'stuck');
  if (!stuck.length) return null;
  return h(
    'div.rd-needs',
    {},
    h('div.rd-label', {}, 'Needs you'),
    h('ul', {}, ...stuck.map((p) => h('li', {}, h('button.rd-link', { type: 'button', onclick: () => open(p.id) }, p.name), `: waiting on ${p.waitingOn ?? 'something not named yet'}`))),
  );
}
