// Settings > Bridge > Quality: how much the 3D deck draws (features/quality). Auto starts from your
// graphics and steps down by itself if frames fall behind; Low, Medium and High hold where you put
// them. Every tier shows the boards, the marks and the callouts the same: only the light round them
// changes. The tier drawn now is on the page's root (data-quality), where features/quality marks it.

import { type Quality, type Settings } from '../state';
import { h } from './dom';
import { choiceRow } from './settings-rows';

const NOTE: Record<Quality, string> = {
  auto: 'Picks a tier for your graphics, and steps down one by itself if frames keep falling behind. It never steps back up on its own.',
  low: 'The least to draw: no glow, shadows drawn again only when someone moves, two star layers and no sky light on the hull. For a laptop on battery or software graphics.',
  medium: 'Glow at half size, shadows twenty times a second, the sky lighting the hull and a glossy floor.',
  high: 'Everything: full glow, shadows every frame at full size, the sky lighting the hull and a glossy floor. For a recent Mac or a discrete GPU.',
};

const NAME: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/** The Quality row, saved for you in this browser. */
export function qualitySettings(get: () => Settings, change: (some: Partial<Settings>) => void): Node[] {
  const note = h('p.setting-note');
  const paint = () => {
    const now = NAME[document.documentElement.dataset.quality ?? ''];
    note.textContent = NOTE[get().quality] + (get().quality === 'auto' && now ? ` Drawing at ${now} now.` : '');
  };
  const row = choiceRow<Quality>('Quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => get().quality, (quality) => {
    change({ quality });
    // The tier changes on the next frame: say what it is once it has.
    requestAnimationFrame(() => requestAnimationFrame(paint));
    paint();
  });
  paint();
  return [row, note];
}
