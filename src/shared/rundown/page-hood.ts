// The map page's "Under the hood" fold, closed by default: the codebase treemap and parts table, the
// commit heatmap with contributors, branch lanes and worktrees, and repo vitals (test cases, TODO and
// languages). The summary line carries tests, upstream, PRs, issues and the main language, so each
// fact shows once. Layouts come from treemap.ts, heatmap.ts and branches.ts, as in the office.

import { laneLayout } from './branches.js';
import { heatmap, weeksFor } from './heatmap.js';
import { esc, plural } from './html-sections.js';
import { glyph, num, short, type FlowCtx } from './page-flow.js';
import { icon, miniBars } from './page-svg.js';
import { STATUS_LABEL, type Part, type Rundown, type Status } from './schema.js';
import { inset, squarify } from './treemap.js';
import { ago, fmtDay, GLYPH } from './view.js';

const DAY_MS = 86_400_000;
const kfmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k` : String(n));
const trunc = (s: string, n: number) => (n < 2 ? '' : s.length > n ? `${s.slice(0, Math.max(1, n - 3))}...` : s);

// Area follows lines, with a floor by status so stuck and active parts stay readable, and a cap so one
// huge finished part can't swallow the map.
const FLOOR: Record<Status, number> = { stuck: 0.12, 'in-progress': 0.06, 'not-started': 0.05, done: 0.02 };
const CAP = 0.45;

/** Each part's treemap weight: its share of lines, between its status floor and the cap. */
export function treemapWeights(parts: readonly Part[]): { part: Part; value: number }[] {
  const total = parts.reduce((s, p) => s + p.metrics.lines, 0) || 1;
  return parts.map((p) => ({ part: p, value: Math.min(CAP, Math.max(FLOOR[p.status] ?? 0.02, p.metrics.lines / total)) }));
}

function treemapSvg(r: Rundown, W: number, H: number, cls: string, neutral: boolean): string {
  const body = squarify(treemapWeights(r.parts), (x) => x.value, { x: 0, y: 0, w: W, h: H })
    .map((t) => {
      const p = t.item.part;
      const b = inset(t, 3);
      const chars = Math.floor((b.w - 30) / 7.6);
      const name = b.h > 20 && chars > 2 ? `<text class="tm-name" x="${(b.x + 8).toFixed(1)}" y="${(b.y + 19).toFixed(1)}">${neutral ? '' : `<tspan class="g" aria-hidden="true">${GLYPH[p.status]}</tspan> `}${esc(trunc(p.name, chars))}</text>` : '';
      const sub = b.h > 40 && b.w > 60 ? `<text class="tm-sub" x="${(b.x + 8).toFixed(1)}" y="${(b.y + 36).toFixed(1)}">${esc(kfmt(p.metrics.lines))} ${p.metrics.lines === 1 ? 'line' : 'lines'}</text>` : '';
      const stl = neutral ? 'not assessed' : STATUS_LABEL[p.status];
      return `<g class="tm-part st-${neutral ? 'unjudged' : p.status}" tabindex="0" role="button" data-open-part="${esc(p.id)}" aria-label="${esc(`${p.name}: ${stl}, ${plural(p.metrics.lines, 'line')}. Open details.`)}"><rect class="bg" x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" rx="6"><title>${esc(p.name)} · ${stl} · ${plural(p.metrics.lines, 'line')}</title></rect>${name}${sub}</g>`;
    })
    .join('');
  return `<svg class="treemap ${cls}" viewBox="0 0 ${W} ${H}" role="group" aria-label="Parts sized by lines of code">${body}</svg>`;
}

const panel = (id: string, title: string, gist: string, body: string) => `<details class="panel" id="${id}"><summary><span class="chev">${icon('chev')}</span><b>${title}</b><span class="gist">${gist}</span></summary><div class="panel-body">
${body}
</div></details>`;

function codebasePanel(r: Rundown, ctx: FlowCtx): string {
  const total = r.parts.reduce((s, p) => s + p.metrics.lines, 0);
  const partFiles = r.parts.reduce((s, p) => s + p.metrics.files, 0);
  const un = ctx.unassigned;
  const unPct = un ? Math.round((un / (un + partFiles)) * 100) : 0;
  const neutral = !ctx.judged && r.parts.every((p) => p.statusSource === 'inferred');
  const rows = r.parts
    .map((p) => `<tr><th scope="row"><button type="button" class="linkish" data-open-part="${esc(p.id)}">${esc(p.name)}</button></th><td>${neutral ? 'not assessed' : `${glyph(p.status)} ${STATUS_LABEL[p.status]}`}</td><td class="n">${num(p.metrics.lines)}</td><td class="n">${num(p.metrics.files)}</td><td class="n">${num(p.metrics.testFiles)}</td><td class="n">${num(p.metrics.todo + p.metrics.fixme)}</td><td class="n">${num(p.metrics.commits30d)}</td><td class="n">${p.metrics.lastCommit ? esc(fmtDay(p.metrics.lastCommit, ctx.nowDate)) : '-'}</td></tr>`)
    .join('');
  return panel(
    'hood-code',
    'Codebase',
    `${esc(kfmt(total))} lines in ${plural(r.parts.length, 'part')}${un ? ` · ${unPct < 1 ? '<1' : unPct}% of files in no part` : ''}`,
    `${r.parts.length ? treemapSvg(r, 1000, 420, 'wide', neutral) + treemapSvg(r, 400, 560, 'narrow', neutral) : ''}
<p class="muted small">Area = all lines in the part's files, docs and data included (small parts get a minimum size).${un ? ` ${plural(un, 'file')} are in no part.` : ''}</p>
<div class="tablewrap"><table class="parts-t"><caption class="sr">Parts with their size and activity</caption><thead><tr><th scope="col">Part</th><th scope="col">Status</th><th scope="col" class="n">Lines</th><th scope="col" class="n">Files</th><th scope="col" class="n">Tests</th><th scope="col" class="n">TODO</th><th scope="col" class="n">Commits 30d</th><th scope="col" class="n">Last commit</th></tr></thead><tbody>${rows}</tbody></table></div>`,
  );
}

const initials = (name: string) =>
  String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();

function activityPanel(r: Rundown, ctx: FlowCtx): string {
  const g = r.facts.git;
  if (!g || !g.totalCommits) return '';
  const weeks = weeksFor(g.firstCommit, ctx.nowDate);
  const h = heatmap(g.activityByDay, ctx.nowDate, weeks);
  const C = 13;
  const G = 3;
  const L = 28;
  const T = 16;
  const cells = h.weeks
    .flatMap((col, w) => col.filter((c) => !c.future).map((c, d) => `<rect class="hm l${c.level}" x="${L + w * (C + G)}" y="${T + d * (C + G)}" width="${C}" height="${C}" rx="3"><title>${c.date}: ${plural(c.count, 'commit')}</title></rect>`))
    .join('');
  const months: string[] = [];
  let last = '';
  h.weeks.forEach((col, w) => {
    const m = col[0].date.slice(0, 7);
    if (m !== last && Number(col[0].date.slice(8)) <= 7) months.push(`<text class="ax" x="${L + w * (C + G)}" y="11">${new Date(`${col[0].date}T12:00:00`).toLocaleString('en-US', { month: 'short' })}</text>`);
    last = m;
  });
  const days = ['Mon', 'Wed', 'Fri'].map((d, i) => `<text class="ax" x="0" y="${T + i * 2 * (C + G) + 10}">${d}</text>`).join('');
  const W = L + weeks * (C + G);
  const H = T + 7 * (C + G);
  const weekly = h.weeks.map((col) => ({ start: col[0].date, n: col.reduce((s, c) => s + c.count, 0) }));
  const last5 = weekly.slice(-5).map((x) => x.n);
  const windowTotal = weekly.reduce((s, x) => s + x.n, 0);
  const who = g.contributors.slice(0, 5);
  return panel(
    'hood-activity',
    'Activity',
    `${miniBars(last5, `Commits in the last ${last5.length} weeks: ${last5.join(', ')}`)} ${plural(g.totalCommits, 'commit')}${h.streak ? ` · ${h.streak}-day streak` : ''}`,
    `<div class="act"><div><svg class="heatmap" viewBox="0 0 ${W} ${H}" style="max-width:${Math.round(Math.min(620, W * 1.6))}px" role="img" aria-label="Commits per day over the last ${weeks} weeks; weekly totals in the table that follows">${months.join('')}${days}${cells}</svg>
<table class="sr"><caption>Commits per week</caption><thead><tr><th scope="col">Week of</th><th scope="col">Commits</th></tr></thead><tbody>${weekly.map((x) => `<tr><td>${x.start}</td><td>${x.n}</td></tr>`).join('')}</tbody></table>
<p class="muted small">${num(h.totals.d7)} this week · ${num(h.totals.d30)} in 30 days · ${num(windowTotal)} in ${weeks} weeks</p></div>
${who.length ? `<ul class="contrib" aria-label="Top contributors, 90 days">${who.map((c) => `<li title="${esc(c.name)}"><span class="av" aria-hidden="true">${esc(initials(c.name))}</span><span class="cn">${esc(c.name.split(/\s+/)[0])}</span><b>${num(c.commits)}</b></li>`).join('')}</ul>` : ''}</div>
${g.recentCommits.length ? `<details class="sub-d"><summary>Last ${g.recentCommits.length} commits</summary><ul class="commits">${g.recentCommits.map((c) => `<li><code>${short(c.sha)}</code> <span>${esc(c.subject)}</span> <span class="muted small">${esc(fmtDay(c.date, ctx.nowDate))}${c.parts.length ? ` · ${esc(c.parts.join(', '))}` : ''}</span></li>`).join('')}</ul></details>` : ''}`,
  );
}

function branchesPanel(r: Rundown, ctx: FlowCtx): string {
  const g = r.facts.git;
  if (!g || !g.branches.length) return '';
  if (g.branches.length <= 1 && g.worktrees.length <= 1) return '';
  const def = r.project.defaultBranch;
  const lay = laneLayout(g.branches, def, g.worktrees, ctx.nowDate);
  const facts = new Map(g.branches.map((b) => [b.name, b]));
  const X0 = 300;
  const X1 = 975;
  const RH = 34;
  const TOP = 24;
  const H = TOP + lay.lanes.length * RH + 26;
  const yDef = TOP + RH / 2;
  const x = (u: number) => X0 + u * (X1 - X0);
  const meta = (name: string) => {
    const b = facts.get(name);
    if (!b) return '';
    return `${b.name === def ? 'default' : b.forkDate ? `+${b.ahead} / -${b.behind}` : 'no shared history'} · ${esc(ago(b.date, ctx.now))}${b.merged ? ' · merged' : ''}`;
  };
  const rows = lay.lanes
    .map((l, i) => {
      const y = TOP + i * RH + RH / 2;
      const tip = x(l.to);
      const line = l.isDefault
        ? `<line class="lane def" x1="${X0}" y1="${y}" x2="${tip.toFixed(1)}" y2="${y}"/>`
        : facts.get(l.name)?.forkDate
          ? `<path class="lane" d="M${x(l.from).toFixed(1)},${yDef} Q${x(l.from).toFixed(1)},${y} ${(x(l.from) + Math.min(16, tip - x(l.from))).toFixed(1)},${y} L${tip.toFixed(1)},${y}"/>`
          : `<line class="lane nobase" x1="${X0}" y1="${y}" x2="${tip.toFixed(1)}" y2="${y}"/>`;
      const w = l.worktree;
      return `<g class="br${l.isDefault ? ' isdef' : ''}"><title>${esc(l.name)}, last commit ${esc(l.date.slice(0, 10))}${w ? `, worktree ${esc(w.path)}` : ''}</title>
<text class="br-name" x="8" y="${y - 3}">${esc(trunc(l.name, w ? 28 : 34))}${w ? '<tspan class="wt-t" dx="8">WORKTREE</tspan>' : ''}</text><text class="br-meta" x="8" y="${y + 11}">${meta(l.name)}</text>${line}<circle class="tip${w ? ' has-wt' : ''}" cx="${tip.toFixed(1)}" cy="${y}" r="5"/></g>`;
    })
    .join('');
  const t0 = Date.parse(lay.start);
  const span = Date.parse(lay.end) - t0;
  const fmt = (t: number) => {
    const d = new Date(t);
    const md = d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
    return span < 6 * DAY_MS ? `${md} ${String(d.getHours()).padStart(2, '0')}:00` : md;
  };
  const ticks = [0, 0.5, 1].map((f) => `<text class="ax" x="${x(f).toFixed(1)}" y="${H - 6}" text-anchor="${f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}">${fmt(t0 + f * span)}</text>`).join('');
  const wtN = g.worktrees.length;
  const wt = new Set(g.worktrees.map((w) => w.branch).filter(Boolean));
  return panel(
    'hood-branches',
    'Branches',
    `${lay.lanes.length} shown${wtN > 1 ? ` · ${plural(wtN, 'worktree')}` : ''}${lay.rest.length ? ` · ${lay.rest.length} more` : ''}`,
    `<p class="muted small">Each branch forks off <code>${esc(def || 'the default branch')}</code> at its merge-base; +ahead / -behind.</p>
<ul class="br-list" aria-label="Branches">${lay.lanes.map((l) => `<li><code>${esc(l.name)}</code>${wt.has(l.name) ? ' <span class="wt-inline">WORKTREE</span>' : ''}<div class="muted small">${meta(l.name)}</div></li>`).join('')}</ul>
<div class="br-svg"><svg class="branches" viewBox="0 0 1000 ${H}" aria-hidden="true">${ticks}<line class="now" x1="${X1}" y1="${TOP - 8}" x2="${X1}" y2="${H - 22}"/>${rows}</svg></div>
${lay.rest.length ? `<details class="sub-d"><summary>${plural(lay.rest.length, 'more branch', 'more branches')}</summary><ul class="plain">${lay.rest.map((b) => `<li><code>${esc(b.name)}</code> <span class="muted small">${meta(b.name)}</span></li>`).join('')}</ul></details>` : ''}
${wtN > 1 ? `<h3 class="mini-h">Worktrees</h3><ul class="plain">${g.worktrees.map((w) => `<li><code>${esc(w.path)}</code> ${w.branch ? esc(w.branch) : `detached at ${short(w.sha)}`}${w.locked ? ' · locked' : ''}${w.prunable ? ' · prunable' : ''}</li>`).join('')}</ul>` : ''}`,
  );
}

const NOT_CODE = new Set(['Markdown', 'JSON', 'CSV', 'YAML', 'Text', 'Other', 'TOML', 'XML', 'SVG', 'reStructuredText', 'Lockfile']);

/** The language with the most lines of code (docs and data left out), and its share. */
export function topCodeLanguage(langs: Rundown['facts']['files']['languages']): { name: string; pct: number } | null {
  const code = Object.entries(langs).filter(([k, v]) => v.lines > 0 && !NOT_CODE.has(k));
  const total = code.reduce((s, [, v]) => s + v.lines, 0);
  if (!total) return null;
  const [name, v] = code.sort((a, b) => b[1].lines - a[1].lines)[0];
  return { name, pct: Math.round((v.lines / total) * 100) };
}

function repoPanel(r: Rundown): string {
  const f = r.facts.files;
  const g = r.facts.git;
  const u = g?.uncommitted;
  const unc = u ? u.staged + u.modified + u.deleted + u.untracked : 0;
  const todo = f.todo.todo + f.todo.fixme;
  const langs = Object.entries(f.languages)
    .filter(([, v]) => v.lines > 0)
    .sort((a, b) => b[1].lines - a[1].lines);
  const totalLines = langs.reduce((s, [, v]) => s + v.lines, 0) || 1;
  const top: [string, number][] = langs.slice(0, 7).map(([k, v]) => [k, v.lines]);
  const other = langs.slice(7).reduce((s, [, v]) => s + v.lines, 0);
  if (other) top.push(['Other', other]);
  const pct = (n: number) => Math.round((n / totalLines) * 100);
  const tile = (label: string, value: string, sub: string, cls = '') => `<div${cls ? ` class="${cls}"` : ''}><dt>${label}</dt><dd>${value}</dd>${sub ? `<dd class="small muted">${sub}</dd>` : ''}</div>`;
  return panel(
    'hood-repo',
    'Repo',
    'tests, TODO, languages',
    `<dl class="vitals">
${tile('Test cases', `~${num(f.tests.casesApprox)}`, f.tests.frameworks.length ? esc(f.tests.frameworks.join(', ')) : '')}
${tile('TODO / FIXME', num(todo), `${num(f.todo.todo)} TODO · ${num(f.todo.fixme)} FIXME`)}
${u && unc ? tile('Uncommitted', num(unc), `${u.staged} staged · ${u.modified} modified · ${u.deleted} deleted · ${u.untracked} untracked${g?.stashes ? ` · ${plural(g.stashes, 'stash', 'stashes')}` : ''}`, 'show-s') : ''}
</dl>
${top.length ? `<div class="langbar" role="img" aria-label="All lines by language: ${top.map(([k, n]) => `${esc(k)} ${pct(n)}%`).join(', ')}">${top.map(([k, n], i) => `<span class="lang l${i}" style="flex:${n}" title="${esc(k)}: ${num(n)} lines"></span>`).join('')}</div>
<ul class="langs" aria-hidden="true">${top.map(([k, n], i) => `<li><span class="sw l${i}"></span>${esc(k)} <span class="muted">${pct(n)}%</span></li>`).join('')}</ul>
<p class="muted small">Share of all lines, docs and data included.</p>` : ''}${r.facts.gaps.length || r.facts.truncated || f.skippedSensitive ? `<ul class="plain small muted">${[...r.facts.gaps, ...(r.facts.truncated ? ['A limit was hit: the numbers are partial'] : []), ...(f.skippedSensitive ? [`${plural(f.skippedSensitive, 'file')} on the deny list (keys, .env, credentials, dumps, logs) were counted, never opened`] : [])].map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`,
  );
}

export function hoodSection(r: Rundown, ctx: FlowCtx): string {
  const g = r.facts.git;
  const t = r.facts.files.tests;
  const tDelta = ctx.prev ? t.files - ctx.prev.testFiles : 0;
  const up = g?.upstream;
  const gh = r.facts.github;
  const lang = topCodeLanguage(r.facts.files.languages);
  const gist = [
    `${plural(t.files, 'test file')}${tDelta ? ` (${tDelta > 0 ? '+' : ''}${tDelta})` : ''}`,
    up ? `↑${up.ahead} ↓${up.behind} ${esc(up.ref)}` : null,
    gh ? plural(gh.openPrs.length, 'PR') : null,
    gh ? plural(gh.openIssues, 'issue') : null,
    lang ? `${esc(lang.name)} ${lang.pct}% of code` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return `<details id="hood" class="hood"><summary><span class="chev">${icon('chev')}</span><b>Under the hood</b><span class="gist">${gist}</span></summary>
${codebasePanel(r, ctx)}${activityPanel(r, ctx)}${branchesPanel(r, ctx)}${repoPanel(r)}
</details>`;
}
