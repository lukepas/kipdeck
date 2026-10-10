// The map page: one self-contained HTML file (inline CSS, script and SVG, no fonts, no requests) that
// opens from disk with a double-click. Every section is drawn ahead, so it reads with the script off
// too; the script adds the theme toggle, the part drawer and the live "updated" time. The model is
// embedded once as JSON for the drawer. A pure string function: the skill writes it to
// .rundown/map.html and the office serves it as a download.

import { PAGE_CSS, PAGE_JS } from './html-assets.js';
import { activity, branches, changes, decisions, esc, facts, glyphPaths, milestones, overview, partsMap } from './html-sections.js';
import { STATUS_LABEL, STATUSES, type Rundown } from './schema.js';

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

/** The CSS that swaps the default orange for `hex` (dark as is, a darker shade on light and in print). */
function accentCss(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const dark = `#${rgb.map((c) => Math.round(c * 0.62).toString(16).padStart(2, '0')).join('')}`;
  const a = (k: number, c = rgb) => `rgba(${c.join(',')},${k})`;
  const d = [Number.parseInt(dark.slice(1, 3), 16), Number.parseInt(dark.slice(3, 5), 16), Number.parseInt(dark.slice(5, 7), 16)];
  return `:root{--accent:${hex};--accent-soft:${a(0.12)};--h1:${a(0.28)};--h2:${a(0.5)};--h3:${a(0.75)};--h4:${hex}}:root[data-theme=light]{--accent:${dark};--accent-soft:${a(0.08, d)};--h1:${a(0.22, d)};--h2:${a(0.45, d)};--h3:${a(0.7, d)};--h4:${dark}}@media print{:root{--accent:${dark}}}`;
}

export function renderPage(r: Rundown, now = new Date(), style: PageStyle = {}): string {
  const hex = accentHex(style.accent);
  const extraCss = hex && hex !== ACCENTS.orange ? accentCss(hex) : '';
  const head = r.project.head;
  const glyphs = STATUSES.map((s) => `<template data-glyph="${s}"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">${glyphPaths(s)}</svg>${STATUS_LABEL[s]}</template>`).join('');
  const mode = r.generator.mode === 'full' ? 'full read' : r.generator.mode === 'quick' ? 'quick' : 'facts only';
  return `<!doctype html>
<html lang="en"${style.theme === 'light' ? ' data-theme="light"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">
<meta name="referrer" content="no-referrer">
<title>Rundown: ${esc(r.project.name)}</title>
<style>${PAGE_CSS}${extraCss}</style>
</head>
<body>
<header class="top"><div class="wrap">
<h1>${esc(r.project.name)}</h1>
<div class="meta">${head ? `<span class="pill mono">${esc(head.branch ?? 'detached')} ${esc(head.sha.slice(0, 7))}</span>` : ''}<span title="${esc(r.generatedAt)}">updated <span data-ago="${esc(r.generatedAt)}">${esc(r.generatedAt.slice(0, 16).replace('T', ' '))}</span></span><span class="pill">${esc(mode)}</span>${r.project.remote ? `<span class="mono">${esc(r.project.remote)}</span>` : ''}</div>
<button class="theme" type="button">${style.theme === 'light' ? 'Dark' : 'Light'}</button>
</div></header>
<main class="wrap">
${r.project.description ? `<p class="note" style="margin-top:0">${esc(r.project.description)}</p>` : ''}
${overview(r)}
${changes(r)}
${partsMap(r)}
${milestones(r)}
${activity(r, now)}
${branches(r, now)}
${decisions(r)}
${facts(r)}
<p class="note">Made by ${esc(r.generator.name)} ${esc(r.generator.version)} from ${esc(r.project.root)}. Nothing on this page leaves your computer.</p>
</main>
<aside class="drawer" aria-hidden="true" aria-label="Part details"><button class="x" type="button" aria-label="Close">&#215;</button><div class="body"></div></aside>
${glyphs}
<script type="application/json" id="rundown">${scriptJson(r)}</script>
<script>${PAGE_JS}</script>
</body>
</html>
`;
}
