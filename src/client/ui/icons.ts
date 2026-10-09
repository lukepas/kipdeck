/**
 * The Kipdeck icon set: inline SVG on a 24 grid, 1.75px strokes, square caps and mitred joins, drawn
 * in currentColor so each one takes the color of the text around it. It replaces the emoji the chrome
 * used to carry. The six status glyphs are shapes first, so a state reads without its hue:
 * needs you is a solid diamond, stuck a hollow triangle with a bar, to review a hollow circle with a
 * dot, working a small steel bar, parked a dim dot, merged a check in a square. No three.js here: the
 * 2D view and the 3D office both use it, and the 3D billboards draw from the same paths.
 */

/** Inner SVG markup for each glyph (stroked unless the path says otherwise). */
export const ICONS = {
  // ---- status (shared/attention.ts levels, plus merged) ----
  'needs-you': '<path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" fill="currentColor"/>',
  stuck: '<path d="M12 4 21 19.5H3Z"/><path d="M12 10v4.5"/><path d="M12 16.6v.2" stroke-width="2.25"/>',
  review: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>',
  working: '<path d="M5 12h14" stroke-width="3"/>',
  parked: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" opacity=".55"/>',
  merged: '<path d="M4 4h16v16H4Z"/><path d="m8 12.5 3 3 5.5-6.5"/>',

  // ---- the brand mark (Formation): three chevrons in an upward V, the lead one solid ----
  mark: '<path d="M4 10 11 3l1 1 1-1 7 7v4l-8-8-8 8Z" fill="currentColor" stroke="none"/><path d="m4 17 8-8 8 8M4 22l8-8 8 8" stroke-width="2.5" stroke-linecap="butt"/>',

  // ---- places and panels ----
  mission: '<path d="M3.5 3.5h7v7h-7ZM13.5 3.5h7v7h-7ZM3.5 13.5h7v7h-7Z"/><path d="M13.5 13.5h7v7h-7Z" fill="currentColor"/>',
  units: '<path d="M8 4h8v5H8Z"/><path d="M9.5 6.5h5"/><path d="M6 20v-6.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2V20"/><path d="M9 20h6"/>',
  unit: '<path d="M8 4h8v5H8Z"/><path d="M9.5 6.5h5"/><path d="M6 20v-6.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2V20"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19.5v-1a5.5 5.5 0 0 1 11 0v1"/><path d="M15 5.2a3 3 0 0 1 0 5.6"/><path d="M17.5 13.6a5.5 5.5 0 0 1 3 4.9v1"/>',
  operator: '<path d="M9 3.5h6v5H9Z"/><path d="M10.5 6h3"/><path d="M5 20.5v-4a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v4"/>',
  decks: '<path d="m12 3.5 8.5 4.5L12 12.5 3.5 8Z"/><path d="m3.5 12 8.5 4.5 8.5-4.5"/><path d="m3.5 16 8.5 4.5 8.5-4.5"/>',
  plot: '<path d="M3.5 3.5h17v17h-17Z"/><path d="M3.5 9.5h17M9.5 3.5v17"/><circle cx="15" cy="15" r="2"/>',
  walk: '<path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4"/><path d="M9 9h6v6H9Z"/>',
  overview: '<path d="m12 3.5 8.5 4.9v7.2L12 20.5l-8.5-4.9V8.4Z"/><path d="m3.5 8.4 8.5 4.9 8.5-4.9M12 13.3v7.2"/>',

  // ---- boards and work ----
  issue: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  pull: '<circle cx="6.5" cy="5.5" r="2"/><circle cx="6.5" cy="18.5" r="2"/><circle cx="17.5" cy="18.5" r="2"/><path d="M6.5 7.5v9"/><path d="M17.5 16.5V9.5a2.5 2.5 0 0 0-2.5-2.5h-4"/><path d="m12.5 4.5-2.5 2.5 2.5 2.5"/>',
  queue: '<path d="M4 6h12M4 12h12M4 18h8"/><path d="m17.5 15.5 3 2.5-3 2.5"/>',
  services: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.5 2.4 3.5 5.2 3.5 8.5s-1 6.1-3.5 8.5c-2.5-2.4-3.5-5.2-3.5-8.5s1-6.1 3.5-8.5Z"/>',
  board: '<path d="M3.5 4.5h17v12h-17Z"/><path d="M8 20.5l4-4 4 4"/><path d="m7 12.5 3-3 2.5 2 4.5-4"/>',
  meeting: '<path d="M5 10.5h14v3H5Z"/><path d="M7 13.5v6M17 13.5v6"/><circle cx="8" cy="5.5" r="1.8"/><circle cx="16" cy="5.5" r="1.8"/>',
  docs: '<path d="M5 4h6.5v16H5ZM12.5 4H19v16h-6.5Z"/><path d="M7 8h2.5M14.5 8H17"/>',
  terminal: '<path d="M3.5 4.5h17v15h-17Z"/><path d="m7 9.5 3 2.5-3 2.5M12 15h5"/>',
  changes: '<path d="M6 4.5h9l3.5 3.5v11.5H6Z"/><path d="M9.5 11h5M12 8.5v5M9.5 16h5"/>',
  branch: '<circle cx="7" cy="5.5" r="2"/><circle cx="7" cy="18.5" r="2"/><circle cx="17" cy="8" r="2"/><path d="M7 7.5v9"/><path d="M17 10c0 4-10 2.5-10 6.5"/>',
  task: '<path d="M5 4.5h14v15H5Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  shell: '<path d="m5 7 5 5-5 5"/><path d="M12 17.5h7"/>',

  // ---- proof and money (violet in the chrome) ----
  proof: '<path d="M12 3 19.5 6v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  bounty: '<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9a2.8 2.8 0 0 0-2.8-1.5c-1.6 0-2.8.9-2.8 2.1 0 3 5.6 1.6 5.6 4.6 0 1.2-1.2 2.2-2.8 2.2a3 3 0 0 1-2.9-1.6M12 6v1.5M12 16.5V18"/>',
  wallet: '<path d="M3.5 6.5h15v13h-15Z"/><path d="M3.5 6.5 15 3.5v3"/><path d="M14 12h6.5v4H14Z"/>',
  spend: '<path d="M3.5 19.5h17"/><path d="M6 19.5v-6M10.5 19.5v-10M15 19.5v-4M19.5 19.5V5"/>',
  limits: '<path d="M7 3.5h10M7 20.5h10"/><path d="M8 3.5c0 4.5 8 4.5 8 8.5s-8 4-8 8.5M16 3.5c0 4.5-8 4.5-8 8.5s8 4 8 8.5"/>',
  settled: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',

  // ---- together ----
  chat: '<path d="M4 5h16v11H10l-4.5 3.5V16H4Z"/>',
  mic: '<path d="M9 3.5h6v10H9Z"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3"/>',
  'mic-off': '<path d="M9 3.5h6v7M9 9v4.5h4"/><path d="M5.5 11a6.5 6.5 0 0 0 10.3 5.3M18.5 11a6.4 6.4 0 0 1-.6 2.8M12 17.5v3M4 4l16 16"/>',
  screen: '<path d="M3.5 4.5h17v11h-17Z"/><path d="M9 20h6M12 15.5V20"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.7-8.7M16 7l2.5 2.5M13.5 9.5 15.5 11.5"/>',
  lock: '<path d="M5 10.5h14v10H5Z"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  invite: '<circle cx="9.5" cy="8" r="3"/><path d="M4 19.5v-1a5.5 5.5 0 0 1 9.5-3.8"/><path d="M18 13.5v6M15 16.5h6"/>',

  // ---- the office itself ----
  settings: '<path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1"/><path d="M13 4.5h4v4h-4ZM7 10h4v4H7ZM15 15.5h4v4h-4Z"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5"/><path d="M12 16.6v.2" stroke-width="2.25"/>',
  keyboard: '<path d="M3 6.5h18v11H3Z"/><path d="M6.5 10h1M10 10h1M13.5 10h1M17 10h.5M8 14h8"/>',
  upgrade: '<path d="M12 20V5M6 11l6-6 6 6"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><path d="M12 7.6v.2" stroke-width="2.25"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15Z"/><path d="M10 20.5h4"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  sparkle: '<path d="M12 3.5v6M12 14.5v6M3.5 12h6M14.5 12h6"/>',
  ship: '<path d="M12 3.5 18.5 20 12 16.5 5.5 20Z"/><path d="M12 9.5v4"/>',
  // The Deck: the bridge's canopy over its plate, seen from the door.
  deck: '<path d="M3.5 16.5 12 20.5l8.5-4L12 12.5Z"/><path d="M4.5 14a7.5 7.5 0 0 1 15 0"/><path d="M12 6.5v2"/>',
  reminder: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4.5l2.5 2M4.5 4.5 7 7M19.5 4.5 17 7"/>',

  // ---- actions ----
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  pin: '<path d="M9 3.5h6l-1 6 3.5 3.5h-11L10 9.5Z"/><path d="M12 13v7.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  plus: '<path d="M12 4.5v15M4.5 12h15"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  copy: '<path d="M8.5 8.5h11v11h-11Z"/><path d="M15.5 8.5v-4h-11v11h4"/>',
  external: '<path d="M13.5 4.5h6v6M19.5 4.5l-9 9"/><path d="M17 13.5v6H4.5V7h6"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4v4.5H15"/>',
  trash: '<path d="M4.5 6.5h15M9.5 6.5v-3h5v3M6.5 6.5l1 14h9l1-14"/>',
  play: '<path d="M7 4.5 19 12 7 19.5Z"/>',
  pause: '<path d="M7.5 5v14M16.5 5v14"/>',
  stop: '<path d="M6 6h12v12H6Z"/>',
  edit: '<path d="m4.5 19.5 1-4.5L15 5.5l3.5 3.5L9 18.5Z"/><path d="M12.5 8l3.5 3.5"/>',
  send: '<path d="M4 12h12M11 6l6 6-6 6"/><path d="M20 4.5v15"/>',
  back: '<path d="M20 12H5M11 6l-6 6 6 6"/>',
  next: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  warning: '<path d="M12 4 21 19.5H3Z"/><path d="M12 10v4.5"/><path d="M12 16.6v.2" stroke-width="2.25"/>',
  blocked: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  draft: '<path d="M6 4.5h9l3.5 3.5v11.5H6Z"/><path d="M9.5 12h5M9.5 15.5h3" stroke-dasharray="2 2"/>',
  phone: '<path d="M7 3.5h10v17H7Z"/><path d="M11 17.5h2"/>',
  home: '<path d="M4 11 12 4l8 7"/><path d="M6.5 9v11h11V9"/>',
  labs: '<path d="M9.5 3.5h5M10.5 3.5v6L5 19.5h14L13.5 9.5v-6"/><path d="M7.5 15h9"/>',
  contrast: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none"/>',
  more: '<circle cx="12" cy="5.5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="18.5" r="1.6" fill="currentColor" stroke="none"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  rail: '<path d="M4 4.5h16v15H4Z"/><path d="M9.5 4.5v15"/>',
  logout: '<path d="M14 4.5H4.5v15H14"/><path d="M10 12h10M16.5 8.5 20 12l-3.5 3.5"/>',
} as const;

export type IconName = keyof typeof ICONS;

/** The glyph for each attention level (shared/attention.ts), for anything showing a worker's state. */
export const LEVEL_ICON = {
  'needs-you': 'needs-you',
  stuck: 'stuck',
  review: 'review',
  working: 'working',
  parked: 'parked',
} as const satisfies Record<string, IconName>;

/** The glyph's whole SVG, as markup: for a template or a canvas that wants it as an image. */
export function iconSvg(name: IconName, size = 16, title?: string): string {
  const label = title ? `<title>${title.replace(/[<&>"]/g, (c) => `&#${c.charCodeAt(0)};`)}</title>` : '';
  const aria = title ? 'role="img"' : 'aria-hidden="true"';
  return `<svg class="ico ico-${name}" ${aria} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" stroke-linejoin="miter">${label}${ICONS[name]}</svg>`;
}

/** The glyph as an element, ready to put in a button or a row. */
export function icon(name: IconName, size = 16, title?: string): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = iconSvg(name, size, title);
  return t.content.firstElementChild as SVGSVGElement;
}

/** A CI check's glyph, in its state's color (see .ck-* in styles/base.css); nothing for no checks. */
export function checkIcon(state: 'pass' | 'fail' | 'pending' | 'skip' | 'none', size = 14): SVGSVGElement | null {
  const name: IconName | null = state === 'pass' ? 'check' : state === 'fail' ? 'close' : state === 'pending' ? 'clock' : state === 'skip' ? 'parked' : null;
  if (!name) return null;
  const el = icon(name, size, state);
  el.classList.add(`ck-${state}`);
  return el;
}

/** Whether a string names a glyph (the menu's actions still take an emoji-free label or a glyph's name). */
export function isIcon(name: string): name is IconName {
  return Object.prototype.hasOwnProperty.call(ICONS, name);
}
