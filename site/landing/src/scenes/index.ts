// The scene registry: one module per section, keyed by the section's data-scene. main.ts mounts a
// scene when its section first comes near the viewport. A new section plugs in here, never in main.ts.
import { mountHero } from './hero';
import { mountEnd } from './end';

export type Mount = (section: HTMLElement) => unknown;

export const SCENES: Record<string, Mount> = {
  hero: mountHero,
  end: mountEnd,
};
