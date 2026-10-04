/**
 * The UGC Army marks: the Formation mark (three chevrons in an upward V, the lead one solid), the
 * wordmark and the lockup, plus the favicon that turns its lead chevron Signal orange while anything
 * needs someone. No three.js here: the 2D view and the sign-in pages use it too.
 */
import { h } from './dom';

export const PRODUCT = 'UGC Army';
export const TAGLINE = 'Mission control for your AI agents. Proof of every merge.';
export const CREDIT = 'Built on agent-office by webdevcody - MIT';
export const CREDIT_URL = 'https://github.com/webdevcody/agent-office';

/** The lead chevron (with its alignment notch) and the two trailing outlines, on a 24 grid. */
const LEAD = 'M4 10 11 3l1 1 1-1 7 7v4l-8-8-8 8Z';
const TRAIL = 'm4 17 8-8 8 8M4 22l8-8 8 8';

/** The mark as SVG markup. `lead` colors the lead chevron (default: the text color). */
export function markSvg(size = 24, lead = 'currentColor', trail = 'currentColor'): string {
  return `<svg class="brand-mark" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24"><path d="${LEAD}" fill="${lead}"/><path d="${TRAIL}" fill="none" stroke="${trail}" stroke-width="2.5"/></svg>`;
}

/** The lockup: the mark on the left, then UGC in the text color and ARMY muted. */
export function lockup(size = 22): HTMLElement {
  const el = h('span.brand', { 'aria-label': PRODUCT });
  el.innerHTML = `${markSvg(size)}<span class="brand-word" aria-hidden="true"><b>UGC</b> <span>ARMY</span></span>`;
  return el;
}

/** The favicon as a data URL: the mark in light on void, with 2px corners. `alert` lights the lead chevron. */
export function faviconUrl(alert: boolean): string {
  const lead = alert ? '#FF6A1A' : '#E8ECEF';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="2" fill="#0D131A"/><g transform="translate(2.4 1.6) scale(.8)"><path d="${LEAD}" fill="${lead}"/><path d="${TRAIL}" fill="none" stroke="#E8ECEF" stroke-width="2.5"/></g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

let lastAlert: boolean | undefined;
/** Points the tab's icon at the plain or the lit mark (only when that changes). */
export function setFaviconAlert(alert: boolean) {
  if (alert === lastAlert) return;
  lastAlert = alert;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.append(link);
  }
  link.type = 'image/svg+xml';
  link.href = faviconUrl(alert);
}
