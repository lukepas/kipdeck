// Settings > Bridge > Hands: your gloved hands in front of you in first person (features/hands). Auto
// draws them at High and Medium and leaves them out at Low, where every draw counts; On draws them at
// every tier; Off never.

import type { HandsMode, Settings } from '../state';
import { h } from './dom';
import { choiceRow } from './settings-rows';

const NOTE: Record<HandsMode, string> = {
  auto: 'Your gloved hands at the bottom of the view while you walk the deck in first person: they sway as you turn and walk, reach out and tap what you use, and hold a datapad while Mission control is open. Left out at Low quality, and always out of the way when you sit, in the Overview and in third person.',
  on: 'Your hands at every Quality tier, Low included.',
  off: 'No hands: in first person you are the camera.',
};

/** The Hands row, saved for you in this browser. */
export function handsSettings(get: () => Settings, change: (some: Partial<Settings>) => void): Node[] {
  const note = h('p.setting-note');
  const paint = () => void (note.textContent = NOTE[get().hands]);
  const row = choiceRow<HandsMode>('Hands', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']], () => get().hands, (hands) => {
    change({ hands });
    paint();
  });
  paint();
  return [row, note];
}
