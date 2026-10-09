// The Deck without Deck ambience (Labs): the same room and the same agents, with the
// decorative systems quiet. Pure, so it's tested without a scene.
import { LIFE_PARTS, type LifePart, type Settings } from '../../state/persist';

/**
 * Your settings as the bridge uses them while Bridge ambience is off: no mascot, droid, fleet or
 * relay outside (Life: Silent running, every part off), no ship's voice, celebrations, start of
 * watch, momentum display or pit-wall clock, no gloved hands, space at Calm and the ambience bed
 * silent. Everything that tells you about an agent (the alerts, the attention cues, the boards) is
 * left as it was. A copy: what's saved in this browser is not touched.
 */
export function calmBridge(s: Settings): Settings {
  const lifeParts = Object.fromEntries(LIFE_PARTS.map((p) => [p, false])) as Record<LifePart, boolean>;
  return {
    ...s,
    life: 'silent',
    lifeParts,
    voice: 'off',
    celebrations: 'off',
    watch: 'off',
    momentum: false,
    turnaround: false,
    hands: 'off',
    shipMotion: s.shipMotion === 'off' ? 'off' : 'calm',
    mix: { ...s.mix, ambience: 0 },
  };
}
