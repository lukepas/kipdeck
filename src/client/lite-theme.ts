// The 2D view's print toggle: the light whiteprint (tokens.css, [data-theme=print]) for reading on
// white or printing, or the slate deck. Until someone picks, the page follows the system's light or
// dark setting ([data-theme=auto]). The pick is this browser's only, kept in its storage.
import { icon } from './ui/icons';

const KEY = 'agent-office.lite-theme';
type Theme = 'print' | 'dark';

function saved(): Theme | undefined {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'print' || v === 'dark' ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Whether the page shows light now: picked, or by the system while nothing is. */
function isLight(): boolean {
  const t = document.documentElement.dataset.theme;
  return t === 'print' || (t === 'auto' && matchMedia('(prefers-color-scheme: light)').matches);
}

export function mountThemeToggle(button: HTMLElement) {
  const root = document.documentElement;
  const apply = (t: Theme | undefined) => {
    root.dataset.theme = t ?? 'auto';
    button.setAttribute('aria-pressed', String(isLight()));
  };
  button.replaceChildren(icon('contrast', 16));
  apply(saved());
  button.addEventListener('click', () => {
    const next: Theme = isLight() ? 'dark' : 'print';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // storage blocked: it holds for this visit
    }
    apply(next);
  });
}
