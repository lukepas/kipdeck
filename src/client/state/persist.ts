// What this browser remembers between visits, in localStorage: your profile, your settings, the floor
// you were last on and the spot you were standing in. Every read and write shrugs off blocked storage.

import { DATA_COLORS, remapColor } from '../../shared/datacolors';
import { randomLook, sanitizeLook, type Look } from '../../shared/avatar';
import type { WatchMode } from '../../shared/launch';

export type { WatchMode };

export interface Profile {
  name: string;
  color: string;
  look: Look;
}

const PROFILE_KEY = 'agent-office.profile';
/** The yokes an operator can wear: the deck's data palette (shared/datacolors.ts). */
export const AVATAR_COLORS: readonly string[] = DATA_COLORS;

/** Your saved profile. `look` is missing when only the 2D view (or an office from before looks) saved it. */
export function loadProfile(): (Omit<Profile, 'look'> & { look?: Look }) | null {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null');
    if (p && typeof p.name === 'string' && typeof p.color === 'string') {
      return { name: p.name, color: remapColor(p.color), look: p.look ? sanitizeLook(p.look, randomLook()) : undefined };
    }
  } catch {
    // storage blocked
  }
  return null;
}

/** Without a look, the 3D office deals one the first time (the 2D view saves only a name). */
export function saveProfile(p: Omit<Profile, 'look'> & { look?: Look }) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    // storage blocked
  }
}

export type ViewMode = 'first' | 'third';

/** The panels you can show or hide on screen, from the menu. */
export type HudPanel = 'mission' | 'workers' | 'people' | 'spend' | 'limits' | 'chat' | 'floor';
/** Out of the way by default: the mission, the workers and the chat show until you turn the rest on. */
export const HUD_DEFAULTS: Record<HudPanel, boolean> = { mission: true, workers: true, people: false, spend: false, limits: false, chat: true, floor: false };

/** Mission control's tabs (see ui/mission). */
export type MissionTab = 'attention' | 'goals' | 'review' | 'timeline' | 'crew';
export const MISSION_TABS: readonly MissionTab[] = ['attention', 'goals', 'review', 'timeline', 'crew'];

/** How the office rings when a worker needs you: not at all, once, or again and again until someone's at its terminal. */
export const NEEDS_YOU_SOUNDS = ['off', 'once', 'remind'] as const;
export type NeedsYouSound = (typeof NEEDS_YOU_SOUNDS)[number];

/** How space moves outside the bridge's glass: as is, at half speed with no flybys, or not at all (with the rest of the office). */
export const SHIP_MOTIONS = ['full', 'calm', 'off'] as const;
export type ShipMotion = (typeof SHIP_MOTIONS)[number];

/** The bridge's lights: Night (low light), Day (high light), or Auto, which follows the system's dark or light setting. */
export const LIGHTINGS = ['auto', 'night', 'day'] as const;
export type Lighting = (typeof LIGHTINGS)[number];
/**
 * Settings > Bridge > Quality: how much the 3D deck draws (features/quality). Auto starts from what the
 * graphics are and steps down by itself when frames fall behind; the others hold where you put them.
 */
export const QUALITIES = ['auto', 'low', 'medium', 'high'] as const;
export type Quality = (typeof QUALITIES)[number];
/** How far Brightness steps either way from the mode's own level (each step is 12% of exposure). */
export const BRIGHTNESS_STEPS = 2;

/**
 * Settings > Bridge > Life: how much the bridge's life moves. Full as is; Calm drops the gestures
 * (salutes, hails, idle tricks); Silent running stops all ambient life and slows the stars to a crawl,
 * while every attention state keeps its full strength (features/giveway).
 */
export const LIFE_LEVELS = ['full', 'calm', 'silent'] as const;
export type LifeLevel = (typeof LIFE_LEVELS)[number];
/**
 * The parts of the bridge's world that each have a switch of their own under Life. All ship on; the
 * droid already docks itself under Ship motion Off, reduced motion and Silent running.
 */
export const LIFE_PARTS = ['destination', 'fleet', 'sorties', 'epithets', 'droid'] as const;
export type LifePart = (typeof LIFE_PARTS)[number];
export const LIFE_PART_DEFAULTS: Readonly<Record<LifePart, boolean>> = { destination: true, fleet: true, sorties: true, epithets: true, droid: true };
/** Settings > Bridge > Ship's voice (VESPER, features/vesper): with humour, plain status lines only, or silent. */
export const VOICE_MODES = ['on', 'plain', 'off'] as const;
export type VoiceMode = (typeof VOICE_MODES)[number];
/** Settings > Bridge > Celebrations (features/moments): the tiered moments in full, as cards only, or off (the merge beat and the jump stay). */
export const CELEBRATION_MODES = ['full', 'cards', 'off'] as const;
export type CelebrationMode = (typeof CELEBRATION_MODES)[number];
/** Settings > Bridge > Alert conditions (features/alert): on or off, and the minutes a wait takes to go amber and a stuck unit red. */
export interface AlertSettings {
  on: boolean;
  amberMin: number;
  redMin: number;
}
export const AMBER_MINUTES = [2, 5, 10, 15] as const;
export const RED_MINUTES = [5, 10, 20, 30] as const;
export const ALERT_DEFAULTS: Readonly<AlertSettings> = { on: true, amberMin: 5, redMin: 10 };
/** Settings > Bridge > Hands (features/hands): Auto draws your first-person hands at High and Medium, On at every tier, Off never. */
export const HANDS_MODES = ['auto', 'on', 'off'] as const;
export type HandsMode = (typeof HANDS_MODES)[number];
/** Settings > Bridge > Start of watch (features/launch): the launch and the debrief, the debrief only, or neither. */
export const WATCH_MODES = ['full', 'debrief', 'off'] as const;

export interface Settings {
  view: ViewMode;
  /** The sound cues' level, 0-1 (sound/alerts.ts). */
  volume: number;
  /** Sound cues off: the default, until you turn them on in Settings. */
  muted: boolean;
  /** Voice chat starts muted and V is held down to talk, instead of an open mic. */
  pushToTalk: boolean;
  /** Desktop notifications when a worker needs input or finishes while you're in another tab (once the browser allows them). */
  notify: boolean;
  /** The alarm when a worker stops to ask you something: not at all, once, or again every half minute until someone's at its terminal. */
  needsYouSound: NeedsYouSound;
  /** Which panels show on screen. */
  hud: Record<HudPanel, boolean>;
  /** The menu's actions you pinned to the top bar, by id. */
  pins: string[];
  /** The Mission control tab you had open last. */
  missionTab: MissionTab;
  /** The 2D view lists the workers on every floor, not just yours. */
  allFloors: boolean;
  /** Settings > Bridge: how space moves outside (Off stills the whole office, as the system's reduce-motion setting does). */
  shipMotion: ShipMotion;
  /** Settings > Bridge: Quality, how much the 3D deck draws (Auto, Low, Medium or High). */
  quality: Quality;
  /** Settings > Bridge: the bridge's lights, and the page's colors with them (see lighting.ts). */
  lighting: Lighting;
  /** Settings > Bridge: Brightness, a whole step from -BRIGHTNESS_STEPS to BRIGHTNESS_STEPS on top of the lights' mode. */
  brightness: number;
  /** Settings > Bridge > Life: Full, Calm or Silent running. */
  life: LifeLevel;
  /** Settings > Bridge > Life: each part of the world outside on or off. */
  lifeParts: Record<LifePart, boolean>;
  /** Settings > Bridge > Ship's voice: On, Plain only or Off. */
  voice: VoiceMode;
  /** Settings > Bridge > Celebrations: Full, Cards only or Off. */
  celebrations: CelebrationMode;
  /** Settings > Bridge > Alert conditions. */
  alerts: AlertSettings;
  /** Settings > Bridge > Start of watch: Full, Debrief only or Off. */
  watch: WatchMode;
  /** Settings > Bridge > Momentum display: the drive core and the fleet's log on the ticker (features/drive). */
  momentum: boolean;
  /** Settings > Bridge > Turnaround clock: the pit wall in the Review bay (features/turnaround). */
  turnaround: boolean;
  /** Settings > Bridge > Hands: your gloved hands in front of you in first person. */
  hands: HandsMode;
}

const SETTINGS_KEY = 'agent-office.settings';
const FLOOR_KEY = 'agent-office.floor';

/** The floor you were last on, to come back to it after a reload. */
export function lastFloor(): string | null {
  try {
    return localStorage.getItem(FLOOR_KEY);
  } catch {
    return null;
  }
}

export function rememberFloor(id: string | null) {
  try {
    if (id) localStorage.setItem(FLOOR_KEY, id);
  } catch {
    // storage blocked
  }
}

const SEEN_KEY = 'agent-office.seen';

/**
 * When this browser was last in the office (ms), for the "While you were away" digest on the shared
 * password, where there's no account for the office to remember it by.
 */
export function lastHere(): number | undefined {
  try {
    const at = Number(localStorage.getItem(SEEN_KEY));
    return Number.isFinite(at) && at > 0 ? at : undefined;
  } catch {
    return undefined;
  }
}

/** This browser is in the office now. */
export function stampHere(at = Date.now()) {
  try {
    localStorage.setItem(SEEN_KEY, String(at));
  } catch {
    // storage blocked
  }
}

const SPOT_KEY = 'agent-office.spot';

/** Where you were standing, on which floor, to be back there when you come back in. */
export interface Spot {
  floor: string;
  /** What that floor was called, to say so if it's gone by then. */
  name: string;
  x: number;
  y: number;
  z: number;
  facing: number;
}

/** The spot you were last in, if this browser has one. */
export function lastSpot(): Spot | null {
  try {
    const s = JSON.parse(localStorage.getItem(SPOT_KEY) ?? 'null');
    const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
    // One saved on a map the office doesn't have any more (the castle) is nowhere in the office.
    const elsewhere = typeof s?.map === 'string' && s.map !== 'office';
    if (s && !elsewhere && typeof s.floor === 'string' && s.floor && finite(s.x) && finite(s.y) && finite(s.z) && finite(s.facing)) {
      return { floor: s.floor, name: typeof s.name === 'string' ? s.name : '', x: s.x, y: s.y, z: s.z, facing: s.facing };
    }
  } catch {
    // storage blocked
  }
  return null;
}

export function rememberSpot(s: Spot) {
  try {
    localStorage.setItem(SPOT_KEY, JSON.stringify(s));
  } catch {
    // storage blocked
  }
}

export function loadSettings(): Settings {
  const s: Settings = { view: 'first', volume: 0.7, muted: true, pushToTalk: false, notify: true, needsYouSound: 'once', hud: { ...HUD_DEFAULTS }, pins: [], missionTab: 'attention', allFloors: false, shipMotion: 'full', quality: 'auto', lighting: 'auto', brightness: 0, life: 'full', lifeParts: { ...LIFE_PART_DEFAULTS }, voice: 'on', celebrations: 'full', alerts: { ...ALERT_DEFAULTS }, watch: 'full', momentum: true, turnaround: true, hands: 'auto' };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    if (saved?.view === 'first' || saved?.view === 'third') s.view = saved.view;
    if (typeof saved?.volume === 'number' && Number.isFinite(saved.volume)) s.volume = Math.max(0, Math.min(1, saved.volume));
    if (typeof saved?.muted === 'boolean') s.muted = saved.muted;
    if (typeof saved?.pushToTalk === 'boolean') s.pushToTalk = saved.pushToTalk;
    if (typeof saved?.notify === 'boolean') s.notify = saved.notify;
    if (NEEDS_YOU_SOUNDS.includes(saved?.needsYouSound)) s.needsYouSound = saved.needsYouSound;
    for (const k of Object.keys(s.hud) as HudPanel[]) if (typeof saved?.hud?.[k] === 'boolean') s.hud[k] = saved.hud[k];
    if (Array.isArray(saved?.pins)) s.pins = saved.pins.filter((p: unknown): p is string => typeof p === 'string').slice(0, 30);
    if (MISSION_TABS.includes(saved?.missionTab)) s.missionTab = saved.missionTab;
    if (typeof saved?.allFloors === 'boolean') s.allFloors = saved.allFloors;
    if (SHIP_MOTIONS.includes(saved?.shipMotion)) s.shipMotion = saved.shipMotion;
    if (QUALITIES.includes(saved?.quality)) s.quality = saved.quality;
    if (LIGHTINGS.includes(saved?.lighting)) s.lighting = saved.lighting;
    if (Number.isInteger(saved?.brightness)) s.brightness = Math.max(-BRIGHTNESS_STEPS, Math.min(BRIGHTNESS_STEPS, saved.brightness));
    if (LIFE_LEVELS.includes(saved?.life)) s.life = saved.life;
    for (const k of LIFE_PARTS) if (typeof saved?.lifeParts?.[k] === 'boolean') s.lifeParts[k] = saved.lifeParts[k];
    if (VOICE_MODES.includes(saved?.voice)) s.voice = saved.voice;
    if (CELEBRATION_MODES.includes(saved?.celebrations)) s.celebrations = saved.celebrations;
    if (typeof saved?.alerts?.on === 'boolean') s.alerts.on = saved.alerts.on;
    if ((AMBER_MINUTES as readonly unknown[]).includes(saved?.alerts?.amberMin)) s.alerts.amberMin = saved.alerts.amberMin;
    if ((RED_MINUTES as readonly unknown[]).includes(saved?.alerts?.redMin)) s.alerts.redMin = saved.alerts.redMin;
    if (WATCH_MODES.includes(saved?.watch)) s.watch = saved.watch;
    if (typeof saved?.momentum === 'boolean') s.momentum = saved.momentum;
    if (typeof saved?.turnaround === 'boolean') s.turnaround = saved.turnaround;
    if (HANDS_MODES.includes(saved?.hands)) s.hands = saved.hands;
  } catch {
    // storage blocked
  }
  return s;
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // storage blocked
  }
}
