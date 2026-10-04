// The page's state: the store (./store.ts), made of the core and every slice (./slices), and what this
// browser remembers between visits (./persist.ts).

import { SLICES } from './slices';
import { Store } from './store';

export { AVATAR_COLORS, HUD_DEFAULTS, MISSION_TABS, BRIGHTNESS_STEPS, LIFE_LEVELS, LIFE_PARTS, LIGHTINGS, NEEDS_YOU_SOUNDS, SHIP_MOTIONS, lastFloor, lastHere, lastSpot, loadProfile, loadSettings, rememberSpot, saveProfile, saveSettings, stampHere } from './persist';
export type { HudPanel, LifeLevel, LifePart, Lighting, MissionTab, NeedsYouSound, Profile, Settings, ShipMotion, Spot, ViewMode } from './persist';
export { workerForPull } from './store';
export type { ScreenState, Slice, Store, Topic, Topics } from './store';

export const store = new Store(SLICES);
