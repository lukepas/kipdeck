// The index of every project's rundown (~/.claude/rundown/index.html): one card per project, newest
// first, with its active milestone and progress, the next step, a "needs you" badge and the part counts.
// An entry holds only what the project's own page already shows. Pure: the entry from a Rundown, and
// the page from the entries; src/server/rundown/index-file.ts keeps the registry on disk.

import { esc, plural } from './html-sections.js';
import { accentPair, type PageStyle } from './html.js';
import { BASE_CSS, INDEX_CSS } from './page-css.js';
import { num, time } from './page-flow.js';
import { icon } from './page-svg.js';
import { INDEX_JS, STALE_DAYS } from './page-js.js';
import { STATUS_LABEL, STATUSES, type Rundown, type Status } from './schema.js';
import { cutWords, fmtDay, GLYPH, judged, needsQueue, STATUS_ORDER } from './view.js';

export interface IndexEntry {
  /** The project's real absolute root: the key (each worktree is its own card). */
  root: string;
  name: string;
  /** The page, absolute. */
  htmlPath: string;
  generatedAt: string;
  mode: Rundown['generator']['mode'];
  branch: string | null;
  judged: boolean;
  description: string | null;
  milestone: { id: string; name: string; done: number; total: number; due: string | null } | null;
  milestonesDone: boolean;
  next: string | null;
  needs: { decisions: number; stuck: number };
  parts: number;
  counts: Record<Status, number>;
  /** The device the root sits on, to tell an unmounted drive from a deleted folder. */
  dev: number | null;
}

/** The registry entry for one rendered project. */
export function indexEntry(r: Rundown, at: { root: string; htmlPath: string; dev: number | null }): IndexEntry {
  const active = r.milestones.find((m) => m.state === 'active') ?? null;
  const q = needsQueue(r);
  return {
    root: at.root,
    name: cutWords(r.project.name || at.root, 200),
    htmlPath: at.htmlPath,
    generatedAt: r.generatedAt,
    mode: r.generator.mode,
    branch: r.project.head?.branch ?? null,
    judged: judged(r),
    description: r.project.description ? cutWords(r.project.description, 160) : null,
    milestone: active ? { id: active.id, name: cutWords(active.name, 60), done: active.items.filter((i) => i.done).length, total: active.items.length, due: active.due } : null,
    milestonesDone: r.milestones.length > 0 && !active,
    next: r.nextStep ? cutWords(r.nextStep.text, 160) : null,
    needs: { decisions: q.decisions.length, stuck: q.stuck.length },
    parts: r.parts.length,
    counts: Object.fromEntries(STATUSES.map((s) => [s, r.parts.filter((p) => p.status === s).length])) as Record<Status, number>,
    dev: at.dev,
  };
}

/** Whether something read from index.json is an entry this page can draw. */
export function validEntry(e: unknown): e is IndexEntry {
  const x = e as Partial<IndexEntry> | null;
  return !!x && typeof x.root === 'string' && typeof x.htmlPath === 'string' && typeof x.name === 'string' && typeof x.generatedAt === 'string';
}

const FILTER_FROM = 9;
const DAY_MS = 86_400_000;

function road(e: IndexEntry): string {
  if (!e.judged) return `<span class="muted">not assessed yet, ${plural(e.parts || 0, 'part')} by folder</span>`;
  const m = e.milestone;
  if (!m) return `<span class="muted">${e.milestonesDone ? 'all milestones done' : 'no milestones yet'}</span>`;
  const pct = m.total ? Math.round((m.done / m.total) * 100) : 0;
  return `<b class="ms-id">${esc(m.id)}</b> <span class="ms-n">${esc(m.name)}</span><span class="pbar" role="img" aria-label="${num(m.done)} of ${num(m.total)} done"><span style="width:${pct}%"></span></span><span class="ms-c">${num(m.done)}/${num(m.total)}</span>${m.due ? `<span class="muted">due ${esc(fmtDay(m.due))}</span>` : ''}`;
}

/** One project's card; `href` is its page as a file: URL and `pathLabel` its root, tildified. */
function card(e: IndexEntry & { href: string; pathLabel: string }, now: number): string {
  const t = Date.parse(e.generatedAt);
  const stale = Number.isFinite(t) && now - t > STALE_DAYS * DAY_MS;
  const waiting = e.needs.decisions + e.needs.stuck;
  const needsBits = [e.needs.decisions ? plural(e.needs.decisions, 'open decision') : '', e.needs.stuck ? `${num(e.needs.stuck)} stuck` : ''].filter(Boolean).join(', ');
  const counts = STATUS_ORDER.filter((s) => e.counts?.[s])
    .map((s) => `<span><span class="st-${s}" aria-hidden="true">${GLYPH[s]}</span> ${num(e.counts[s])} ${STATUS_LABEL[s].toLowerCase()}</span>`)
    .join('');
  const at = Number.isFinite(t) ? `updated ${e.generatedAt.slice(0, 16).replace('T', ' ')}` : '';
  // The name link covers the whole card, so its title carries what the rows may cut off.
  const tip = [e.name, e.description, e.pathLabel, at, needsBits && `needs you: ${needsBits}`].filter(Boolean).join('\n');
  return `<li class="pc${stale ? ' stale' : ''}" data-q="${esc(`${e.name} ${e.pathLabel} ${e.branch ?? ''}`.toLowerCase())}">
<div class="pc-top"><a class="pc-name" href="${esc(e.href)}" title="${esc(tip)}">${esc(e.name)}</a>${waiting ? `<span class="needs-b">${icon('person')}needs you ${num(waiting)}<span class="sr">: ${esc(needsBits)}</span></span>` : ''}<span class="pc-age">${stale ? '<span class="stale-m">stale</span>' : ''}${time(e.generatedAt, now)}</span></div>
<div class="pc-path"><span class="pp"><bdi>${esc(e.pathLabel)}</bdi></span>${e.branch ? `<span class="pc-br">${esc(e.branch)}</span>` : ''}</div>
<div class="pc-road">${road(e)}</div>
${e.next ? `<p class="pc-next clamp1"><span class="arrow" aria-hidden="true">→</span> ${esc(e.next)}</p>` : ''}
${e.judged && counts ? `<div class="pc-parts">${counts}</div>` : ''}
</li>`;
}

/** The index page; `entries` newest first, each with its href and pathLabel set. */
export function renderIndexPage(entries: readonly (IndexEntry & { href: string; pathLabel: string })[], style: PageStyle = {}, now = Date.now()): string {
  const accent = accentPair(style.accent);
  const theme = style.theme === 'light' ? 'light' : 'dark';
  const list = entries.length
    ? `<ul class="pcs" id="pcs">${entries.map((e) => card(e, now)).join('\n')}</ul><p class="muted small" id="nomatch" hidden>No project matches.</p>`
    : '<p class="note">No rundowns yet. Run <b>/rundown</b> in a project and it shows up here.</p>';
  const filter = entries.length >= FILTER_FROM ? '<input id="q" class="q" type="search" placeholder="Filter by name, path or branch" aria-label="Filter projects" autocomplete="off">' : '';
  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">
<meta name="referrer" content="no-referrer">
<title>Rundowns</title>
<style>${BASE_CSS(accent.dark, accent.light)}${INDEX_CSS}</style>
</head>
<body>
<header class="top"><div class="wrap bar">
<h1 class="brand"><span class="bdot" aria-hidden="true"></span><span class="bname">Rundowns</span></h1><span class="count">${num(entries.length)}<span class="sr"> ${entries.length === 1 ? 'project' : 'projects'}</span></span><span class="grow"></span>
<button id="theme" class="icon-btn" type="button" aria-pressed="${theme === 'dark'}" aria-label="Dark theme">${icon('moon', 'i-moon')}${icon('sun', 'i-sun')}</button>
</div></header>
<main class="wrap" id="main">
${entries.length ? '<p class="help muted">Every project you ran /rundown in, newest first. Click a card to open its rundown.</p>' : ''}
${filter}
${list}
<footer>Updated every time a project's rundown page is drawn (a full or quick /rundown). Projects whose page is gone drop off.</footer>
</main>
<script>${INDEX_JS}</script>
</body>
</html>
`;
}
