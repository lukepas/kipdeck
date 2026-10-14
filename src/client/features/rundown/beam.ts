// The orange beam on the holo city stands on the part the map's next step is for. E there deploys an
// agent on that step, the same task the inbox's "Deploy on: <step>" gives (shared/yourcall.ts), through
// the deck's own Ask window: a new agent at a free desk, or one already at work. R opens the window.

import type { Rundown } from '../../../shared/rundown/schema';
import { deployOnLabel, nextStepCall, nextStepPrompt, stamp } from '../../../shared/yourcall';

/** What the hint says at the beam's district ("Deploy on: ...", and "on M5 - Server"), or null elsewhere. */
export function beamHint(r: Rundown | null | undefined, partId: string | undefined): { label: string; where: string } | null {
  const next = r ? nextStepCall(r) : null;
  if (!next || !partId || r?.nextStep?.partId !== partId) return null;
  return { label: deployOnLabel(next, 40), where: stamp(next) ? `on ${stamp(next)}` : 'next step' };
}

/** E at the beam: asks `assign` for an agent on the next step. False when `partId` isn't the beam's district. */
export function beamDeploy(r: Rundown | null | undefined, partId: string, floorName: string, assign: (prompt: string, title: string) => void): boolean {
  const next = r ? nextStepCall(r) : null;
  if (!next || r?.nextStep?.partId !== partId) return false;
  assign(nextStepPrompt(floorName, next), deployOnLabel(next));
  return true;
}
