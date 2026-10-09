// The Kipdeck logo, in one place: Kip's face (head, leaf ears, knocked-out eyes with glints) with his
// curled tuft, whose bobble is the signal light. Only the light ever changes colour: Signal orange
// while someone is needed, violet on the /pom/ showcase, the mark's own colour otherwise.
//
// Everything that draws the logo reads from here. The app's top bars and favicon (ui/brand.ts), the
// Deck's canvases (world/office/floorpaint.ts) and the 2D plan import it. The static copies (the
// favicons, the app icons, the press files in design/logo/, and the inline marks in the HTML pages,
// the landing page, the pitch deck and the share cards) are written by `npm run logo`
// (design/logo/sync.ts), and tests/logo.test.ts fails if any of them drifts from this file.
//
// The mark is drawn on a 32 grid, fill only, in currentColor. Below about 22px use the small mark:
// the same face snapped to the pixel grid, with a square light that stays a light at 16px.

/** The mark, for 22px and up: one body path and the signal light. */
export const MARK = {
  body: 'M4.7 21.6A11.3 9.4 0 1 1 27.3 21.6A11.3 9.4 0 1 1 4.7 21.6ZM10.5 16.9C5.3 12.3 3.4 5.4 4.7 1C8.5 3.6 11.5 10.1 10.5 16.9ZM21.5 16.9C20.5 10.1 23.5 3.6 27.3 1C28.6 5.4 26.7 12.3 21.5 16.9ZM8.4 21.1A3 3 0 1 0 14.4 21.1A3 3 0 1 0 8.4 21.1ZM11.5 20.1A0.8 0.8 0 1 1 13.1 20.1A0.8 0.8 0 1 1 11.5 20.1ZM17.6 21.1A3 3 0 1 0 23.6 21.1A3 3 0 1 0 17.6 21.1ZM20.7 20.1A0.8 0.8 0 1 1 22.3 20.1A0.8 0.8 0 1 1 20.7 20.1ZM15.4 14.1C13.8 11.5 14.8 8.1 16.9 6.6A0.5 0.5 0 0 1 17.5 7.4C15.5 9 15 10.8 16.6 13.4Z',
  signal: 'M15.6 6A2.1 2.1 0 1 1 19.8 6A2.1 2.1 0 1 1 15.6 6Z',
} as const;

/** The mark snapped to a 16px grid, for favicons and anything under about 22px. No glints. */
export const MARK_SMALL = {
  body: 'M6 21A10 9 0 1 1 26 21A10 9 0 1 1 6 21ZM11 17C5.5 13 4 6.5 6 2C9.5 4.5 12 10.5 11 17ZM21 17C20 10.5 22.5 4.5 26 2C28 6.5 26.5 13 21 17ZM8 21A3 3 0 1 0 14 21A3 3 0 1 0 8 21ZM18 21A3 3 0 1 0 24 21A3 3 0 1 0 18 21ZM16 9h2v4h-2Z',
  signal: 'M15.5 4h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3a1.5 1.5 0 0 1-1.5-1.5v-3a1.5 1.5 0 0 1 1.5-1.5Z',
} as const;

/** KIP and DECK outlined from Archivo 600 at 118% width, +6% tracking, cap height centred on the head. */
export const WORD = {
  kip: 'M37.09 26.85L37.09 16.33L39.33 16.33L39.33 21.77L45.3 16.33L48.16 16.33L43.43 20.68L48.25 26.85L45.45 26.85L41.81 22.09L39.33 24.13L39.33 26.85ZM50.99 26.85L50.99 16.33L53.22 16.33L53.22 26.85ZM56.93 26.85L56.93 16.33L63.95 16.33Q65.02 16.33 65.78 16.77Q66.54 17.21 66.94 17.97Q67.35 18.74 67.35 19.76Q67.35 20.76 66.94 21.55Q66.52 22.33 65.74 22.77Q64.96 23.21 63.87 23.21L59.16 23.21L59.16 26.85ZM59.16 21.32L63.4 21.32Q64.21 21.32 64.65 20.91Q65.08 20.5 65.08 19.78Q65.08 19.27 64.89 18.93Q64.7 18.58 64.33 18.4Q63.95 18.22 63.4 18.22L59.16 18.22Z',
  deck: 'M70.15 26.85L70.15 16.33L75.37 16.33Q77.19 16.33 78.51 16.93Q79.82 17.53 80.53 18.69Q81.23 19.86 81.23 21.6Q81.23 23.33 80.53 24.49Q79.82 25.66 78.51 26.25Q77.19 26.85 75.37 26.85ZM72.38 24.97L75.28 24.97Q76.09 24.97 76.76 24.77Q77.43 24.57 77.92 24.17Q78.4 23.77 78.67 23.17Q78.93 22.56 78.93 21.77L78.93 21.43Q78.93 20.62 78.67 20.02Q78.4 19.41 77.92 19.01Q77.43 18.62 76.76 18.42Q76.09 18.22 75.28 18.22L72.38 18.22ZM84.48 26.85L84.48 16.33L94.43 16.33L94.43 18.22L86.71 18.22L86.71 20.56L93.59 20.56L93.59 22.43L86.71 22.43L86.71 24.97L94.55 24.97L94.55 26.85ZM103.42 27.03Q101.45 27.03 100.1 26.43Q98.74 25.82 98.05 24.62Q97.36 23.41 97.36 21.58Q97.36 18.94 98.93 17.54Q100.5 16.15 103.41 16.15Q105.06 16.15 106.33 16.64Q107.6 17.13 108.32 18.06Q109.04 19 109.04 20.36L106.82 20.36Q106.82 19.59 106.39 19.07Q105.95 18.55 105.18 18.29Q104.42 18.03 103.39 18.03Q102.21 18.03 101.38 18.42Q100.55 18.81 100.1 19.56Q99.66 20.31 99.66 21.4L99.66 21.77Q99.66 22.87 100.1 23.62Q100.55 24.37 101.39 24.77Q102.23 25.17 103.41 25.17Q104.48 25.17 105.25 24.91Q106.03 24.65 106.45 24.13Q106.88 23.62 106.88 22.86L109.04 22.86Q109.04 24.19 108.33 25.13Q107.62 26.07 106.36 26.55Q105.09 27.03 103.42 27.03ZM112.26 26.85L112.26 16.33L114.49 16.33L114.49 21.77L120.46 16.33L123.32 16.33L118.59 20.68L123.41 26.85L120.61 26.85L116.97 22.09L114.49 24.13L114.49 26.85Z',
} as const;

/** The lockup's view box: the mark at 0..32, then the word. */
export const LOCKUP_VIEWBOX = '4.3 0 119.5 32';
export const MARK_VIEWBOX = '0 0 32 32';

/** The colours the standalone files are painted in (the pages use their own tokens). */
export const LOGO_COLORS = {
  void: '#0D131A',
  plate: '#222C38',
  text: '#E8ECEF',
  muted: '#8A97A5',
  lightText: '#0D131A',
  lightMuted: '#56616D',
  /** Signal orange: someone needs you. On a light page use --signal (#A8380A). */
  signal: '#FF6A1A',
  /** The /pom/ showcase's violet. */
  proof: '#A68BFF',
  /** The app icon's calm light, a touch brighter than the face. */
  light: '#F4F6F8',
} as const;

export type MarkKind = 'mark' | 'small';
/** What an inline logo is: `data-logo="mark|small|lockup"` on its <svg>. */
export type LogoKind = MarkKind | 'lockup';

const shapes = (kind: MarkKind) => (kind === 'small' ? MARK_SMALL : MARK);

/** The paths inside an inline logo. The light is `.signal`; the lockup's DECK is `.word-muted`. */
export function logoPaths(kind: LogoKind): string {
  if (kind === 'lockup') return `${logoPaths('mark')}<path d="${WORD.kip}"/><path class="word-muted" d="${WORD.deck}"/>`;
  const s = shapes(kind);
  return `<path d="${s.body}"/><path class="signal" d="${s.signal}"/>`;
}

/** The view box an inline logo of this kind needs. */
export const viewBoxOf = (kind: LogoKind) => (kind === 'lockup' ? LOCKUP_VIEWBOX : MARK_VIEWBOX);

/** The mark for a page, in currentColor; the small one under 22px unless `kind` says otherwise. */
export function markSvg(size = 24, cls = 'brand-mark', kind: MarkKind = size < 22 ? 'small' : 'mark'): string {
  return `<svg class="${cls}" data-logo="${kind}" width="${size}" height="${size}" viewBox="${MARK_VIEWBOX}" fill="currentColor" aria-hidden="true">${logoPaths(kind)}</svg>`;
}

/** The favicon: the small mark in light on a void tile. `light` paints the signal (orange while someone needs you). */
export function faviconSvg(light: string = LOGO_COLORS.text): string {
  const s = MARK_SMALL;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${LOGO_COLORS.void}"/><path fill="${LOGO_COLORS.text}" d="${s.body}"/><path fill="${light}" d="${s.signal}"/></svg>`;
}

/** The app icon (apple-touch-icon, 512 full bleed so platform masks crop it): the mark on a plate, its light glowing. */
export function appIconSvg(alert = false): string {
  const glow = alert ? LOGO_COLORS.signal : '#FFFFFF';
  const light = alert ? LOGO_COLORS.signal : LOGO_COLORS.light;
  const alpha = alert ? 0.3 : 0.16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><title>Kipdeck</title><defs><linearGradient id="plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${LOGO_COLORS.plate}"/><stop offset="1" stop-color="${LOGO_COLORS.void}"/></linearGradient><radialGradient id="glow" cx="271.6" cy="164" r="70" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${glow}" stop-opacity="${alpha}"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs><rect width="512" height="512" fill="url(#plate)"/><circle cx="271.6" cy="164" r="70" fill="url(#glow)"/><g transform="translate(108.8 108.8) scale(9.2)"><path fill="${LOGO_COLORS.text}" d="${MARK.body}"/><path fill="${light}" d="${MARK.signal}"/></g></svg>`;
}

/** A standalone mark file in currentColor (design/logo/). */
export function markFile(kind: MarkKind): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}" fill="currentColor"><title>Kipdeck</title>${logoPaths(kind)}</svg>`;
}

/** The lockup as a file, for dark or light grounds (README, press). */
export function lockupFile(ground: 'dark' | 'light'): string {
  const [fg, muted] = ground === 'dark' ? [LOGO_COLORS.text, LOGO_COLORS.muted] : [LOGO_COLORS.lightText, LOGO_COLORS.lightMuted];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOCKUP_VIEWBOX}" fill="${fg}"><title>Kipdeck</title><style>.word-muted{fill:${muted}}</style>${logoPaths('lockup')}</svg>`;
}

/** An SVG as a data: URL, for a favicon set at run time. */
export const svgDataUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
