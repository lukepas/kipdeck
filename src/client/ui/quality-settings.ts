// Settings > Bridge > Quality: how much the 3D deck draws (features/quality). Auto starts from your
// graphics, steps down a tier when frames keep falling behind and back up when they have room, and
// says so live in a chip under the row ('Auto - running at High', and its last step with the reason
// and the time). Low, Medium and High hold where you put them. Every tier shows the boards, the marks
// and the callouts the same: only the light round them changes.

import './quality-settings.css';
import { type Quality, type Settings } from '../state';
import { canTryHigh, chipText, onQualityStatus, qualityStatus, stepText, tryHigh, TIER_NAME, type QualityStatus } from '../features/quality/status';
import { h } from './dom';
import { choiceRow } from './settings-rows';

const NOTE: Record<Quality, string> = {
  auto: 'Picks a tier for your graphics, steps down one when frames keep falling behind and back up when they have room again. On Apple silicon and discrete graphics it holds at Medium or better.',
  low: 'The least to draw: no glow, shadows drawn again only when someone moves, two star layers and no sky light on the hull. For a laptop on battery or software graphics.',
  medium: 'Glow at half size, shadows twenty times a second, the sky lighting the hull and a glossy floor.',
  high: 'Everything: full glow, shadows every frame at full size, the sky lighting the hull and a glossy floor. For a recent Mac or a discrete GPU.',
};

/** The live chip: the tier now, Auto's last step, and 'Try High' when Auto is under the best these graphics draw. */
export function qualityChip(onTry?: () => void): HTMLElement {
  const label = h('span.q-chip-label');
  const why = h('span.q-chip-why');
  const btn = h('button.btn.q-chip-try', { type: 'button' }) as HTMLButtonElement;
  btn.addEventListener('click', () => {
    tryHigh();
    onTry?.();
  });
  const chip = h('div.q-chip', { role: 'status', 'aria-live': 'polite' }, h('span.q-chip-dot'), label, why, btn);
  let shown = false;
  const paint = (s: QualityStatus | null) => {
    // Gone with Settings or the menu: stop listening.
    if (shown && !chip.isConnected) return off();
    if (!s) {
      chip.hidden = true;
      return;
    }
    chip.hidden = false;
    chip.dataset.tier = s.tier;
    label.textContent = chipText(s);
    why.textContent = stepText(s);
    btn.hidden = !canTryHigh(s);
    btn.textContent = `Try ${TIER_NAME[s.top]}`;
    btn.title = `Forget Auto's step down and draw at ${TIER_NAME[s.top]} again now`;
  };
  const off = onQualityStatus(paint);
  paint(qualityStatus());
  requestAnimationFrame(() => (shown = chip.isConnected));
  return chip;
}

/** The Quality row, saved for you in this browser, with the live chip under it. */
export function qualitySettings(get: () => Settings, change: (some: Partial<Settings>) => void): Node[] {
  const note = h('p.setting-note');
  const paint = () => {
    note.textContent = NOTE[get().quality];
  };
  const row = choiceRow<Quality>('Quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => get().quality, (quality) => {
    change({ quality });
    paint();
  });
  // 'Try High' sets Auto again if a tier was picked by hand: the row shows it.
  const chip = qualityChip(() => {
    change({ quality: 'auto' });
    paint();
    row.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      const on = b.textContent === 'Auto';
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
  });
  paint();
  return [row, chip, note];
}
