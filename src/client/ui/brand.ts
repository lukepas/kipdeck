/**
 * The Kipdeck marks: Kip's face with his tuft as the signal light (src/shared/logo.ts), the wordmark
 * and the lockup, plus the favicon whose light turns Signal orange while anything needs someone. No
 * three.js here: the 2D view and the sign-in pages use it too.
 */
import { PRODUCT, UPSTREAM_CREDIT } from '../../shared/copy';
import { LOGO_COLORS, faviconSvg, markSvg, svgDataUrl } from '../../shared/logo';
import { h } from './dom';

// The name, the line under it and the description live in shared/copy.ts, for the app, the server and the landing page alike.
export { DESCRIPTION, PRODUCT, TAGLINE } from '../../shared/copy';
export { markSvg } from '../../shared/logo';
export const CREDIT = UPSTREAM_CREDIT;
export const CREDIT_URL = 'https://github.com/AgentSystemLabs/agent-office';

/** The lockup: the mark on the left, then KIP in the text color and DECK muted. */
export function lockup(size = 24): HTMLElement {
  const el = h('span.brand', { 'aria-label': PRODUCT });
  el.innerHTML = `${markSvg(size)}<span class="brand-word" aria-hidden="true"><b>KIP</b><span>DECK</span></span>`;
  return el;
}

/** The favicon as a data URL: the small mark in light on void. `alert` lights Kip's light Signal orange. */
export function faviconUrl(alert: boolean): string {
  return svgDataUrl(faviconSvg(alert ? LOGO_COLORS.signal : LOGO_COLORS.text));
}

let lastAlert: boolean | undefined;
/** Points the tab's icon at the plain or the lit mark, and lights the top bar's mark with it (only when that changes). */
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
  document.documentElement.classList.toggle('logo-lit', alert);
}
