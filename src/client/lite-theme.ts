// The 2D view's light toggle: the light whiteprint (tokens.css, [data-theme=print]) for reading on
// white or printing, or the slate deck. It is the bridge's lights (Settings > Bridge in the 3D
// office, lighting.ts): Day is the whiteprint, Night the slate, and Auto, until someone picks,
// follows the system's light or dark setting. The pick is this browser's, kept with its settings.
import { lightModeOf, markPageLight, saveLighting, savedLighting } from './lighting';
import { icon } from './ui/icons';

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

export function mountThemeToggle(button: HTMLElement) {
  const apply = () => {
    const setting = savedLighting();
    markPageLight(setting);
    button.setAttribute('aria-pressed', String(lightModeOf(setting) === 'day'));
  };
  carryOver();
  button.replaceChildren(icon('contrast', 16));
  apply();
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', apply);
  button.addEventListener('click', () => {
    saveLighting(lightModeOf(savedLighting()) === 'day' ? 'night' : 'day');
    apply();
  });
}
