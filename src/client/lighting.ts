// Bridge lights, as far as the page's colors go: Night is the slate set (tokens.css :root), Day the
// light whiteprint ([data-theme=print]), and Auto follows the system's dark or light setting. One
// setting (Settings > Deck, kept with the rest in this browser) sets the 3D bridge's light rig
// (features/lights), its HUD, the 2D view and the sign-in pages alike. Three.js-free, for every page.

import { loadSettings, saveSettings, type Lighting } from './state/persist';

/** What the lights are now, once Auto has asked the system. */
export type LightMode = 'night' | 'day';

/** The page's background in each mode, for the browser's own chrome (meta theme-color). */
const THEME_COLOR: Record<LightMode, string> = { night: '#0d131a', day: '#f4f6f8' };

const LIGHT_QUERY = '(prefers-color-scheme: light)';

/** Whether the system asks for light colors now. */
export function systemLight(): boolean {
  return typeof matchMedia === 'function' && matchMedia(LIGHT_QUERY).matches;
}

/** The mode a setting gives: Auto is Day while the system is light, Night otherwise. */
export function lightModeOf(setting: Lighting, light = systemLight()): LightMode {
  if (setting === 'auto') return light ? 'day' : 'night';
  return setting;
}

/** Calls `fn` whenever the system switches between dark and light. */
export function onSystemLight(fn: () => void) {
  if (typeof matchMedia === 'function') matchMedia(LIGHT_QUERY).addEventListener('change', fn);
}

function themeColor(mode: LightMode) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[mode]);
}

/** Paints the page in `mode` outright (the 3D office, whose scene has to know the mode too). */
export function markLight(mode: LightMode) {
  const root = document.documentElement;
  root.dataset.theme = mode === 'day' ? 'print' : 'dark';
  root.dataset.light = mode;
  themeColor(mode);
}

/**
 * Paints a page with no scene of its own (the 2D view, the sign-in pages) by `setting`: Auto is left to
 * the stylesheet's own media query ([data-theme=auto]), so it follows the system live.
 */
export function markPageLight(setting: Lighting) {
  const root = document.documentElement;
  root.dataset.theme = setting === 'auto' ? 'auto' : setting === 'day' ? 'print' : 'dark';
  const mode = lightModeOf(setting);
  root.dataset.light = mode;
  themeColor(mode);
}

/** The saved setting. */
export function savedLighting(): Lighting {
  return loadSettings().lighting;
}

/** Saves `lighting` with the rest of this browser's settings. */
export function saveLighting(lighting: Lighting) {
  const s = loadSettings();
  s.lighting = lighting;
  saveSettings(s);
}
