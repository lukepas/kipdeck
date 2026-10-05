/**
 * Quality's row in the HUD menu (Tab), under Deck: the tier the deck draws at now, as the chip in
 * Settings says it ('Auto - running at High', and Auto's last step), a one-click 'Try High' when Auto
 * is running under the best these graphics draw, and the row itself opening Settings > Bridge.
 */
import type { HudAction } from '../../ui/menu';
import { canTryHigh, menuText, qualityStatus, tryHigh, TIER_NAME } from './status';

export function qualityMenuAction(openBridge: () => void): HudAction {
  return {
    id: 'quality',
    icon: 'ship',
    label: 'Quality',
    section: 'Deck',
    note: () => {
      const s = qualityStatus();
      return s ? menuText(s) : '';
    },
    title: () => 'How much the 3D deck draws: Settings > Bridge > Quality',
    extra: () => {
      const s = qualityStatus();
      if (!s || !canTryHigh(s)) return undefined;
      return { label: `Try ${TIER_NAME[s.top]}`, title: `Forget Auto's step down and draw at ${TIER_NAME[s.top]} again now`, run: tryHigh };
    },
    run: openBridge,
  };
}
