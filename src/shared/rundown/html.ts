// The map page: one self-contained HTML file (inline CSS, script and SVG, no fonts, no requests) that
// opens from disk with a double-click and works at phone width. It reads as a flow (page-flow.ts): Road,
// Next, Needs you and Parts, with the code map, activity, branches and repo vitals folded under the hood
// (page-hood.ts). Everything is drawn ahead, so it reads with the script off too; the script adds the
// theme toggle, the part drawer, Copy as prompt and relative times. A pure string function: the skill
// writes it to .rundown/rundown.html and the office serves it as a download.

import { esc, partFolders } from './html-sections.js';
import { BASE_CSS, PAGE_CSS } from './page-css.js';
import { describe, header, needsSection, nextSection, num, partDetail, partsSection, roadSection, sinceRow, time, type FlowCtx, type StepId } from './page-flow.js';
import { hoodSection } from './page-hood.js';
import { PAGE_JS } from './page-js.js';
import { partOfPath } from './paths.js';
import type { Rundown, RundownState } from './schema.js';
import { judged, needsQueue, nextItem } from './view.js';

/** JSON safe inside a <script> element: no "</script>", no "<!--". */
export function scriptJson(v: unknown): string {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/** The page's look: which theme it opens in (the toggle still switches), and its one accent colour. */
export interface PageStyle {
  theme?: 'dark' | 'light';
  /** A name from ACCENTS or a #rrggbb colour; orange when missing or unknown. */
  accent?: string;
}

/** The accents a style file or --accent may name. */
export const ACCENTS: Readonly<Record<string, string>> = {
  orange: '#ff8a3d', amber: '#fbbf24', yellow: '#facc15', red: '#f87171', rose: '#fb7185', pink: '#f472b6', purple: '#a78bfa', violet: '#a78bfa',
  indigo: '#818cf8', blue: '#60a5fa', cyan: '#22d3ee', teal: '#2dd4bf', green: '#4ade80', lime: '#a3e635',
};

/** `#rrggbb` for a name or a colour, or null when it's neither. */
export function accentHex(accent: string | undefined): string | null {
  if (!accent) return null;
  const a = accent.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(a)) return a;
  return ACCENTS[a] ?? null;
}

/** The accent for each theme: as is on dark, a darker shade on light so text in it stays readable. */
export function accentPair(accent: string | undefined): { dark: string; light: string } {
  const hex = accentHex(accent) ?? ACCENTS.orange;
  if (hex === ACCENTS.orange) return { dark: hex, light: '#c2410c' };
  const n = Number.parseInt(hex.slice(1), 16);
  const light = `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c * 0.58).toString(16).padStart(2, '0')).join('')}`;
  return { dark: hex, light };
}

/** What the page shows beyond the model: the run before (new milestones, the test delta), when the judgement was written, and the index's link. */
export interface PageExtras {
  prev?: RundownState | null;
  judgedAt?: string | null;
  /** The index of every project's rundown, as a file: URL. */
  indexHref?: string | null;
}

/** Files in no part, from the folder buckets. */
function unassignedFiles(r: Rundown): number {
  if (!r.parts.length) return 0;
  return r.facts.files.dirs.reduce((s, d) => s + (partOfPath(r.parts, d.path) ? 0 : d.files), 0);
}

export function renderPage(r: Rundown, now = new Date(), style: PageStyle = {}, extras: PageExtras = {}): string {
  const accent = accentPair(style.accent);
  const theme = style.theme === 'light' ? 'light' : 'dark';
  const isJudged = judged(r);
  const needs = needsQueue(r);
  // Fixed order: Road, Next, Needs you, Parts. Before any judgement there is no road or next step, and
  // Needs you only shows when something is waiting.
  const steps: FlowCtx['steps'] = [];
  if (isJudged) steps.push({ id: 'road', label: 'Road' }, { id: 'next', label: 'Next' });
  if (isJudged || needs.count || needs.nextPart) steps.push({ id: 'needs', label: 'Needs you', short: 'Needs' });
  steps.push({ id: 'parts', label: 'Parts' });
  const ctx: FlowCtx = {
    now: now.getTime(),
    nowDate: now,
    theme,
    judged: isJudged,
    steps,
    needs,
    prev: extras.prev ?? null,
    judgedAt: extras.judgedAt ?? null,
    indexHref: extras.indexHref ?? null,
    changes: r.changes,
    partById: new Map(r.parts.map((p) => [p.id, p])),
    nextItem: nextItem(r),
    unassigned: unassignedFiles(r),
  };
  const sections: Record<StepId, (r: Rundown, ctx: FlowCtx) => string> = { road: roadSection, next: nextSection, needs: needsSection, parts: partsSection };
  const body = steps.map((s) => sections[s.id](r, ctx)).join('\n');
  const intro = isJudged ? '' : `<div class="sec intro"><p class="note">No judgement yet: run <b>/rundown</b> for milestones, a next step and decisions. Until then each top folder is a part.</p>${sinceRow(r, ctx)}</div>`;
  const remote = r.project.remote ? ` · ${esc(r.project.remote)}` : '';
  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">
<meta name="referrer" content="no-referrer">
<title>${esc(r.project.name)} rundown</title>
<style>${BASE_CSS(accent.dark, accent.light)}${PAGE_CSS}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${header(r, ctx)}
<main class="wrap" id="main">
${describe(r)}
${intro}
${body}
${hoodSection(r, ctx)}
<footer>Edit <code>.rundown/milestones.md</code> or <code>decisions.md</code>, then <code>/rundown quick</code>${ctx.indexHref ? ` · <a href="${esc(ctx.indexHref)}">All rundowns</a>` : ''} · ${esc(r.generator.name)} ${esc(r.generator.version)} · ${esc(r.generator.mode)} run${remote} · generated ${time(r.generatedAt, ctx.now)}${r.facts.durationMs != null ? ` in ${num(r.facts.durationMs)} ms` : ''}. Nothing on this page leaves your computer.</footer>
</main>
<noscript><p class="wrap muted small">The part drawer, copy buttons and theme toggle need JavaScript; everything else works without it.</p></noscript>
<dialog id="drawer" aria-labelledby="drawer-title"><span id="drawer-title" class="sr">Part details</span><button class="close" type="button" aria-label="Close">×</button><div class="dlg-body" id="drawer-body"></div></dialog>
<div id="toast" class="toast" role="status" aria-live="polite"></div>
<div id="copybox" class="copybox" hidden><p class="small">Press Cmd/Ctrl+C to copy:</p><code></code><button type="button" class="btn-ghost" data-hide-copybox>Done</button></div>
${r.parts.map((p) => partDetail(r, p, ctx, partFolders(r, p))).join('\n')}
<script type="application/json" id="rundown">${scriptJson(r)}</script>
<script>${PAGE_JS}</script>
</body>
</html>
`;
}
