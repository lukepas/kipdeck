// The scene registry: one module per section, keyed by the section's data-scene. main.ts mounts a
// scene when its section first comes near the viewport. A new section plugs in here, never in main.ts.
import { mountHero } from './hero';
import { mountEnd } from './end';
import { mountFunnel } from './funnel';
import { mountProblem } from './problem';
import { mountLoop } from './loop';
import { mountWhy } from './why';
import { mountYours } from './yours';
import { mountPhone } from './phone';
import { mountNumbers } from './numbers';
import { mountLabs } from './labs';
import { mountProof } from './proof';
import { mountTeams } from './teams';

export type Mount = (section: HTMLElement) => unknown;

export const SCENES: Record<string, Mount> = {
  hero: mountHero,
  funnel: mountFunnel,
  problem: mountProblem,
  loop: mountLoop,
  why: mountWhy,
  yours: mountYours,
  phone: mountPhone,
  numbers: mountNumbers,
  labs: mountLabs,
  proof: mountProof,
  teams: mountTeams,
  end: mountEnd,
};
