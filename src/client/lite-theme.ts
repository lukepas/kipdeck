// The home page's light or dark: the light whiteprint (tokens.css, [data-theme=print]) or the slate
// deck. It is the bridge's lights (Settings > Deck in the 3D office, lighting.ts): Day is the
// whiteprint, Night the slate, and Auto, until someone picks, follows the system's light or dark
// setting. The pick is this browser's, kept with its settings; the avatar menu and Ctrl+K switch it.
import { lightModeOf, markPageLight, saveLighting, savedLighting } from './lighting';

/** Where the 2D view kept its own pick before it shared the bridge's lights. */
const OLD_KEY = 'agent-office.lite-theme';

/** An older pick of the 2D view's own carries over to the bridge's lights, once. */
function carryOver() {
  try {
    const old = localStorage.getItem(OLD_KEY);
    if (old === 'print' || old === 'dark') saveLighting(old === 'print' ? 'day' : 'night');
    localStorage.removeItem(OLD_KEY);
  } catch {
    // storage blocked: nothing kept to carry
  }
}

/** Paints the page in the saved light, and again whenever the system's changes (for Auto). */
export function applyLight() {
  carryOver();
  const apply = () => markPageLight(savedLighting());
  apply();
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', apply);
}

/** Light now? */
export const isLight = () => lightModeOf(savedLighting()) === 'day';

/** Switches between light and dark, and keeps the pick. */
export function toggleLight() {
  saveLighting(isLight() ? 'night' : 'day');
  markPageLight(savedLighting());
}
