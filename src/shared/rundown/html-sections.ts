// The map page's sections as HTML strings, drawn ahead (html.ts puts them together): the status
// overview, what changed, the parts treemap and its table, the milestone timeline, the activity
// heatmap, branches and worktrees, "Your call", and the facts. Every string from the model is escaped.

import { laneLayout } from './branches.js';
import { heatmap, weeksFor } from './heatmap.js';
import { itemsLeft, statusCounts } from './model.js';
import { partOfPath } from './paths.js';
import { STATUS_LABEL, STATUSES, type Part, type Rundown, type Status } from './schema.js';
import { inset, squarify, withFloor } from './treemap.js';

export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (n: number) => n.toLocaleString('en-US');
export const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

const STATUS_VAR: Record<Status, string> = { done: 'var(--done)', 'in-progress': 'var(--progress)', 'not-started': 'var(--idle)', stuck: 'var(--stuck)' };

/** A status's glyph as SVG paths in a 16 by 16 box (check, half circle, empty circle, warning triangle). */
export function glyphPaths(s: Status): string {
  switch (s) {
    case 'done':
      return '<circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M4.6 8.3l2.2 2.2 4.6-5" fill="none" stroke="var(--bg)" stroke-width="1.9"/>';
    case 'in-progress':
      return '<circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 1.6a6.4 6.4 0 0 1 0 12.8z" fill="currentColor"/>';
    case 'not-started':
      return '<circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.6"/>';
    case 'stuck':
      return '<path d="M8 1.6 15 14.2H1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 6.2v3.8M8 11.6v.6" stroke="currentColor" stroke-width="1.7"/>';
  }
}

/** Glyph and label: status is never colour alone. */
export const statusTag = (s: Status) => `<span class="st s-${s}"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">${glyphPaths(s)}</svg>${STATUS_LABEL[s]}</span>`;

export function overview(r: Rundown): string {
  const counts = statusCounts(r.parts);
  const total = r.parts.length || 1;
  const bar = STATUSES.map((s) => (counts[s] ? `<span style="width:${(counts[s] / total) * 100}%;background:${STATUS_VAR[s]}" title="${STATUS_LABEL[s]}: ${counts[s]}"></span>` : '')).join('');
  const legend = STATUSES.map((s) => `<span>${statusTag(s)} ${counts[s]}</span>`).join('');
  const ms = r.milestones.find((m) => m.id === r.nextMilestone);
  const left = itemsLeft(r);
  const open = r.decisions.filter((d) => !d.answer).length;
  const t = r.facts.files.tests;
  const testChange = r.changes.find((c) => c.kind === 'tests');
  const git = r.facts.git;
  const unc = git ? git.uncommitted.staged + git.uncommitted.modified + git.uncommitted.deleted + git.uncommitted.untracked : null;
  const up = git?.upstream;
  const step = r.nextStep;
  return `<section aria-labelledby="h-over"><h2 id="h-over">Status overview</h2><div class="kpis">
<div class="card"><div class="label">Parts</div><div class="big">${r.parts.length}</div><div class="bar" role="img" aria-label="Parts by status">${bar}</div><div class="legend">${legend}</div></div>
<div class="card"><div class="label">Next milestone</div>${ms ? `<div class="big">${esc(ms.id)} ${esc(ms.name)}</div><div class="sub">${plural(left, 'item')} left${ms.due ? `, due ${esc(ms.due)}` : ''}</div>` : `<div class="big">None</div><div class="sub">${r.milestones.length ? 'Every milestone is done' : 'No milestones yet: add them in .rundown/milestones.md'}</div>`}</div>
<div class="card next"><div class="label">Suggested next step</div>${step ? `<div class="big">${esc(step.text)}</div><div class="sub">${esc(step.why)}</div>` : `<div class="big">Run /rundown for a suggestion</div><div class="sub">The collector alone doesn't pick a next step.</div>`}</div>
<div class="card"><div class="label">Your call</div><div class="big">${open}</div><div class="sub">${open ? 'open decisions, with defaults below' : 'nothing waiting on you'}</div></div>
<div class="card"><div class="label">Tests</div><div class="big">${plural(t.files, 'file')}</div><div class="sub">about ${fmt(t.casesApprox)} cases${testChange ? `, ${esc(testChange.text)}` : ''}${t.frameworks.length ? `; ${esc(t.frameworks.join(', '))}` : ''}</div></div>
<div class="card"><div class="label">Uncommitted</div><div class="big">${unc === null ? 'n/a' : fmt(unc)}</div><div class="sub">${git ? `${git.uncommitted.modified} modified, ${git.uncommitted.untracked} untracked, ${git.uncommitted.staged} staged` : 'not a git repository'}</div></div>
<div class="card"><div class="label">Upstream</div><div class="big">${up ? `+${up.ahead} / -${up.behind}` : 'none'}</div><div class="sub">${up ? `against ${esc(up.ref)}, as of the last fetch` : 'no upstream branch set'}</div></div>
</div></section>`;
}

export function changes(r: Rundown): string {
  const body = !r.previous
    ? '<p style="margin:0">First rundown. The next one shows what changed since this one.</p>'
    : r.changes.length
      ? `<ul>${r.changes.map((c, i) => `<li${i >= 8 ? ' class="hidden"' : ''}>${esc(c.text)}</li>`).join('')}</ul>${r.changes.length > 8 ? `<button class="more-btn" type="button">and ${r.changes.length - 8} more</button>` : ''}`
      : `<p style="margin:0">Nothing changed since ${esc(r.previous.generatedAt.slice(0, 16).replace('T', ' '))}.</p>`;
  return `<section aria-labelledby="h-chg"><h2 id="h-chg">Changed since last update</h2><div class="changes">${body}</div></section>`;
}

/** The part's folders one level under its own paths, for the cells inside its tile. */
export function partFolders(r: Rundown, part: Part): { path: string; lines: number }[] {
  const out = new Map<string, number>();
  for (const d of r.facts.files.dirs) {
    if (!d.lines || partOfPath(r.parts, d.path) !== part.id) continue;
    const base = part.paths.map((g) => g.split('/').filter((s) => !/[*?[\]{}]/.test(s)).join('/')).find((b) => !b || d.path === b || d.path.startsWith(`${b}/`)) ?? '';
    const rest = base ? d.path.slice(base.length).replace(/^\//, '') : d.path;
    const key = rest ? `${base ? `${base}/` : ''}${rest.split('/')[0]}` : base || '.';
    out.set(key, (out.get(key) ?? 0) + d.lines);
  }
  return [...out.entries()].map(([path, lines]) => ({ path, lines })).sort((a, b) => b.lines - a.lines);
}

export function partsMap(r: Rundown): string {
  const W = 1000;
  const H = 560;
  const floored = withFloor(r.parts.map((p) => p.metrics.lines), 0.02);
  const tiles = squarify(r.parts.map((p, i) => ({ p, v: floored[i] })), (x) => x.v, { x: 0, y: 0, w: W, h: H });
  const g = tiles
    .map(({ item: { p }, ...t }) => {
      const box = inset(t, 3);
      const cells = squarify(partFolders(r, p).slice(0, 12), (f) => f.lines, inset({ x: box.x, y: box.y + 46, w: box.w, h: Math.max(0, box.h - 46) }, 4))
        // A cell too small for its name is left out rather than drawn as an empty box.
        .filter((c) => c.w > 70 && c.h > 18)
        .map((c) => `<rect class="cell" x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" width="${c.w.toFixed(1)}" height="${c.h.toFixed(1)}"/>${c.w > 70 && c.h > 18 ? `<text class="ctext" x="${(c.x + 5).toFixed(1)}" y="${(c.y + 14).toFixed(1)}">${esc(clipTo(c.item.path.split('/').pop() ?? '', c.w / 7))}</text>` : ''}`)
        .join('');
      const room = box.w / 8.5;
      const wait = p.status === 'stuck' && p.waitingOn ? `<text class="wait" x="${box.x + 10}" y="${box.y + box.h - 10}">Waiting on ${esc(clipTo(p.waitingOn, room - 11))}</text>` : '';
      return `<g class="tile" tabindex="0" role="button" data-part="${esc(p.id)}" aria-label="${esc(`${p.name}: ${STATUS_LABEL[p.status]}, ${plural(p.metrics.lines, 'line')}. Open details`)}">
<rect class="frame" x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${box.w.toFixed(1)}" height="${box.h.toFixed(1)}" rx="6" style="fill:${STATUS_VAR[p.status]};fill-opacity:.2;stroke:${STATUS_VAR[p.status]};stroke-width:2"/>${cells}
${box.w > 60 && box.h > 34 ? `<g transform="translate(${box.x + 9},${box.y + 9})" style="color:${STATUS_VAR[p.status]}">${glyphPaths(p.status)}</g><text x="${box.x + 31}" y="${box.y + 22}" font-weight="700">${esc(clipTo(p.name, room - 4))}</text><text class="tsub" x="${box.x + 10}" y="${box.y + 40}">${esc(clipTo(`${STATUS_LABEL[p.status]} · ${plural(p.metrics.lines, 'line')}`, room + 4))}</text>` : ''}${wait}</g>`;
    })
    .join('');
  const rows = r.parts
    .map((p) => `<tr><td><button type="button" data-part="${esc(p.id)}" class="more-btn">${esc(p.name)}</button><div class="note">${esc(p.summary)}</div></td><td>${statusTag(p.status)}${p.waitingOn ? `<div class="note">Waiting on ${esc(p.waitingOn)}</div>` : ''}</td><td class="n">${fmt(p.metrics.lines)}</td><td class="n">${p.metrics.testFiles}</td><td class="n">${p.metrics.todo + p.metrics.fixme}</td><td class="n">${p.metrics.commits30d}</td><td>${esc(p.metrics.lastCommit?.slice(0, 10) ?? '')}</td></tr>`)
    .join('');
  const inferred = r.parts.some((p) => p.statusSource === 'inferred') ? '<p class="note">Statuses inferred from activity. Run /rundown in this project for a real read.</p>' : '';
  // What needs the person first, whole: a stuck part's name and what it waits on, never clipped.
  const stuck = r.parts.filter((p) => p.status === 'stuck');
  const needs = stuck.length ? `<div class="needs"><div class="label">Needs you</div><ul>${stuck.map((p) => `<li><button type="button" class="more-btn" data-part="${esc(p.id)}">${esc(p.name)}</button>: waiting on ${esc(p.waitingOn ?? 'something not named yet')}</li>`).join('')}</ul></div>` : '';
  return `<section aria-labelledby="h-parts"><h2 id="h-parts">Parts map</h2>${inferred}${needs}<div class="scroll"><svg class="tree" viewBox="0 0 ${W} ${H}" role="group" aria-label="Parts sized by lines of code, coloured by status">${g}</svg></div>
<details><summary>Parts as a table</summary><div class="scroll"><table><thead><tr><th>Part</th><th>Status</th><th class="n">Lines</th><th class="n">Test files</th><th class="n">TODO</th><th class="n">Commits 30d</th><th>Last commit</th></tr></thead><tbody>${rows}</tbody></table></div></details></section>`;
}

const clipTo = (s: string, n: number) => {
  const max = Math.max(3, Math.floor(n));
  return s.length > max ? `${s.slice(0, Math.max(1, max - 3))}...` : s;
};

export function milestones(r: Rundown): string {
  if (!r.milestones.length) return `<section aria-labelledby="h-ms"><h2 id="h-ms">Milestones</h2><p class="note">No milestones yet. Write them in .rundown/milestones.md (or run /rundown and Claude proposes a first set).</p></section>`;
  const proposed = r.milestones.some((m) => m.source === 'proposed') ? '<span class="badge">Proposed: edit me</span>' : '';
  const nodes = r.milestones
    .map((m) => {
      const left = m.items.filter((i) => !i.done).length;
      return `<li class="${m.state}"><span class="node" aria-hidden="true"></span><div class="name">${esc(m.id)}. ${esc(m.name)}</div><div class="when">${m.state === 'done' ? 'Done' : m.state === 'active' ? `${left} left` : plural(m.items.length, 'item')}${m.due ? ` · due ${esc(m.due)}` : ''}</div></li>`;
    })
    .join('');
  const active = r.milestones.find((m) => m.state === 'active');
  const items = active ? `<p class="note" style="margin-top:14px">${esc(active.id)} is done when: ${esc(active.doneWhen || 'every item is ticked')}</p><ul class="items">${active.items.map((i) => `<li class="${i.done ? 'done' : ''}">${esc(i.text)}</li>`).join('')}</ul>` : '';
  return `<section aria-labelledby="h-ms"><h2 id="h-ms">Milestones${proposed}</h2><ol class="tl">${nodes}</ol>${items}</section>`;
}

export function activity(r: Rundown, now: Date): string {
  const git = r.facts.git;
  if (!git) return '';
  const heat = heatmap(git.activityByDay, now, weeksFor(git.firstCommit, now));
  const C = 13;
  const G = 3;
  const rects = heat.weeks
    .map((col, w) => col.map((c, d) => `<rect x="${24 + w * (C + G)}" y="${14 + d * (C + G)}" width="${C}" height="${C}" rx="2" class="${c.future ? 'fut' : `d${c.level}`}"><title>${c.date}: ${plural(c.count, 'commit')}</title></rect>`).join(''))
    .join('');
  const months = heat.weeks
    .map((col, w) => {
      const first = col.find((c) => c.date.endsWith('-01') || (w === 0 && c === col[0]));
      return first ? `<text class="axis" x="${24 + w * (C + G)}" y="10">${new Date(`${first.date}T12:00:00`).toLocaleString('en-US', { month: 'short' })}</text>` : '';
    })
    .join('');
  const days = ['Mon', '', 'Wed', '', 'Fri', '', ''].map((d, i) => (d ? `<text class="axis" x="0" y="${24 + i * (C + G)}">${d}</text>` : '')).join('');
  const width = 24 + heat.weeks.length * (C + G);
  const who = git.contributors.slice(0, 10).map((c) => `<li>${esc(c.name)} <span class="note">${c.commits}</span></li>`).join('');
  return `<section aria-labelledby="h-act"><h2 id="h-act">Commit activity</h2><div class="heat"><div><svg viewBox="0 0 ${width} ${14 + 7 * (C + G)}" width="${width}" role="img" aria-label="Commits per day, last ${heat.weeks.length} weeks">${months}${days}${rects}</svg>
<div class="totals"><span><b>${heat.totals.d7}</b> last 7 days</span><span><b>${heat.totals.d30}</b> last 30</span><span><b>${heat.totals.d182}</b> last 182</span><span><b>${heat.streak}</b> day streak</span></div></div>
<div><div class="label note">Contributors, 90 days</div><ul class="who">${who || '<li class="note">None</li>'}</ul></div></div></section>`;
}

export function branches(r: Rundown, now: Date): string {
  const git = r.facts.git;
  if (!git || !git.branches.length) return '';
  const L = laneLayout(git.branches, r.project.defaultBranch, git.worktrees, now);
  const W = 1000;
  const X0 = 20;
  const X1 = 540;
  const RH = 30;
  const H = 20 + L.lanes.length * RH;
  const x = (u: number) => X0 + u * (X1 - X0);
  const baseY = 20 + (L.lanes.length - 1) * RH + 6;
  const lanes = L.lanes
    .map((l, i) => {
      const y = l.isDefault ? baseY : 20 + (L.lanes.length - 1 - i) * RH + 6;
      const cls = l.isDefault ? 'ln def' : l.merged ? 'ln mg' : 'ln';
      const fork = l.isDefault ? '' : `<path class="${cls}" d="M${x(l.from).toFixed(1)} ${baseY} C ${(x(l.from) + 14).toFixed(1)} ${baseY}, ${(x(l.from) + 4).toFixed(1)} ${y}, ${(x(l.from) + 18).toFixed(1)} ${y}"/>`;
      const label = `${l.isDefault ? '' : `+${l.ahead} / -${l.behind} · `}${l.date.slice(0, 10)}${l.merged && !l.isDefault ? ' · merged' : ''}`;
      const wt = l.worktree ? `<tspan class="wt"> · worktree${l.worktree.owner ? ` ${esc(l.worktree.owner)}` : ''}</tspan>` : '';
      const end = Math.max(x(l.to), x(l.from) + 22);
      return `${fork}<line class="${cls}" x1="${(l.isDefault ? x(0) : x(l.from) + 18).toFixed(1)}" y1="${y}" x2="${end.toFixed(1)}" y2="${y}"/><circle cx="${end.toFixed(1)}" cy="${y}" r="4" style="fill:${l.isDefault ? 'var(--accent)' : 'var(--progress)'}"/>
<text x="${X1 + 14}" y="${y + 4}"${l.merged && !l.isDefault ? ' opacity=".55"' : ''}>${esc(clipTo(l.name, 34))}<tspan class="lt"> ${esc(label)}</tspan>${wt}</text>`;
    })
    .join('');
  const rest = L.rest.length ? `<p class="note">And ${L.rest.length} more: ${L.rest.map((b) => esc(b.name)).join(', ')}</p>` : '';
  const wts = git.worktrees.length ? `<details><summary>${plural(git.worktrees.length, 'worktree')}</summary><ul>${git.worktrees.map((w) => `<li><code>${esc(w.path)}</code> ${esc(w.branch ?? 'detached')}${w.owner ? ` · ${esc(w.owner)}` : ''}${w.locked ? ' · locked' : ''}${w.prunable ? ' · prunable' : ''}</li>`).join('')}</ul></details>` : '';
  return `<section aria-labelledby="h-br"><h2 id="h-br">Branches and worktrees</h2><div class="scroll"><svg class="lanes" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="Branches as lanes off ${esc(r.project.defaultBranch ?? 'the default branch')}">${lanes}</svg></div>${rest}${wts}</section>`;
}

export function decisions(r: Rundown): string {
  const open = r.decisions.filter((d) => !d.answer);
  const done = r.decisions.filter((d) => d.answer);
  const part = (id: string | null) => (id ? r.parts.find((p) => p.id === id)?.name ?? id : null);
  const cards = open
    .map((d) => {
      const opts = d.options.map((o) => `<li class="${d.default.toLowerCase().startsWith(o.toLowerCase().slice(0, 12)) ? 'def' : ''}">${esc(o)}</li>`).join('');
      return `<div class="card dec"><div class="label">${esc(d.id)}${d.raised ? ` · raised ${esc(d.raised)}` : ''}${part(d.partId) ? ` · ${esc(part(d.partId))}` : ''}</div><div class="q">${esc(d.question)}</div>${opts ? `<ul>${opts}</ul>` : ''}<div class="defline"><b style="color:var(--accent)">DEFAULT</b> ${esc(d.default)}</div></div>`;
    })
    .join('');
  const resolved = done.length ? `<details><summary>${plural(done.length, 'resolved decision')}</summary><ul>${done.map((d) => `<li><b>${esc(d.id)}</b> ${esc(d.question)}: ${esc(d.answer)}</li>`).join('')}</ul></details>` : '';
  return `<section aria-labelledby="h-call"><h2 id="h-call">Your call</h2>${open.length ? `<div class="decs">${cards}</div>` : '<p class="note">Nothing waiting on you.</p>'}
<p class="how">Write it under Answer: in .rundown/decisions.md and run /rundown quick.</p>${resolved}</section>`;
}

export function facts(r: Rundown): string {
  const f = r.facts.files;
  const langs = Object.entries(f.languages).filter(([, v]) => v.lines > 0).sort((a, b) => b[1].lines - a[1].lines);
  const totalLines = langs.reduce((a, [, v]) => a + v.lines, 0) || 1;
  const hue = (i: number) => `hsl(${(24 + i * 47) % 360} 70% 58%)`;
  const langBar = langs.slice(0, 8).map(([k, v], i) => `<span title="${esc(k)}: ${plural(v.lines, 'line')}" style="width:${(v.lines / totalLines) * 100}%;background:${hue(i)}"></span>`).join('');
  const langList = langs.slice(0, 8).map(([k, v], i) => `<span class="st"><svg width="10" height="10" aria-hidden="true"><rect width="10" height="10" rx="2" fill="${hue(i)}"/></svg>${esc(k)} ${Math.round((v.lines / totalLines) * 100)}%</span>`).join(' ');
  const folders = f.byTopFolder.slice(0, 10).map((x) => `<tr><td><code>${esc(x.folder)}</code></td><td class="n">${fmt(x.files)}</td><td class="n">${fmt(x.lines)}</td></tr>`).join('');
  const largest = f.largest.slice(0, 10).map((x) => `<tr><td><code>${esc(x.path)}</code></td><td class="n">${fmt(x.lines)}</td></tr>`).join('');
  const scripts = f.manifests.flatMap((m) => Object.entries(m.scripts).slice(0, 12).map(([k, v]) => `<tr><td><code>${esc(k)}</code></td><td><code>${esc(v.length > 70 ? `${v.slice(0, 67)}...` : v)}</code></td></tr>`)).slice(0, 14).join('');
  const ci = f.ci.map((c) => `<li><code>${esc(c.path)}</code>${c.name ? ` ${esc(c.name)}` : ''}${c.triggers.length ? ` <span class="note">on ${esc(c.triggers.join(', '))}</span>` : ''}</li>`).join('');
  const d = f.docs;
  const check = (ok: boolean, label: string) => `<li class="${ok ? 'ok' : ''}">${label}</li>`;
  const todos = Object.entries(f.todo.byTopFolder).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `<tr><td><code>${esc(k)}</code></td><td class="n">${v}</td></tr>`).join('');
  const gaps = [...r.facts.gaps, ...(r.facts.truncated ? ['A limit was hit: the numbers are partial'] : []), ...(f.skippedSensitive ? [`${plural(f.skippedSensitive, 'file')} on the deny list (keys, .env, credentials, dumps, logs) were counted, never opened`] : [])];
  return `<section aria-labelledby="h-facts"><h2 id="h-facts">Facts</h2><div class="facts">
<div class="card"><div class="label">Languages</div><div class="langbar">${langBar}</div><div class="legend">${langList || 'None'}</div><p class="note">${plural(f.total, 'file')}, ${plural(totalLines, 'line')}</p></div>
<div class="card"><div class="label">Top folders</div><table><thead><tr><th>Folder</th><th class="n">Files</th><th class="n">Lines</th></tr></thead><tbody>${folders}</tbody></table></div>
<div class="card"><div class="label">Largest files</div><table><tbody>${largest}</tbody></table></div>
${scripts ? `<div class="card"><div class="label">Package scripts</div><table><tbody>${scripts}</tbody></table></div>` : ''}
<div class="card"><div class="label">CI</div>${ci ? `<ul>${ci}</ul>` : '<p class="note">No pipelines found</p>'}</div>
<div class="card"><div class="label">Docs</div><ul class="check">${check(d.readme, 'README')}${check(!!d.docsDir, `Docs folder${d.docsDir ? ` (${esc(d.docsDir)}, ${plural(d.docsFiles, 'file')})` : ''}`)}${check(d.changelog, 'Changelog')}${check(d.contributing, 'Contributing guide')}${check(d.license, 'Licence')}${check(d.architecture, 'Architecture notes')}${check(d.adrs > 0, `Decision records${d.adrs ? ` (${d.adrs})` : ''}`)}${check(d.agentFiles.length > 0, `Agent instructions${d.agentFiles.length ? ` (${esc(d.agentFiles.join(', '))})` : ''}`)}</ul></div>
<div class="card"><div class="label">TODO, FIXME, HACK</div><p class="note">${f.todo.todo} TODO, ${f.todo.fixme} FIXME, ${f.todo.hack} HACK</p><table><tbody>${todos}</tbody></table></div>
${gaps.length ? `<div class="card"><div class="label">Gaps</div><ul>${gaps.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>` : ''}
</div></section>`;
}
